// ===== Живые изолинии на первом экране =====
// Фон первого экрана — отрисованные на <canvas> настоящие топографические
// изолинии: замкнутые органические контуры разного размера, вложенные друг
// в друга, как на карте высот. Это не декоративные волны вдоль экрана, а
// линии равного уровня по полю шума (value noise), извлечённые алгоритмом
// marching squares — тем же методом, которым рисуют горизонтали на
// топокартах. Поле медленно «плывёт» само по себе и слегка проминается
// рядом с курсором (или пальцем на тач-устройствах).
(function () {
  const canvas = document.getElementById('heroIsolines');
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const host = canvas.parentElement; // .hero-bg — задаёт размеры

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Цвет линий берём из CSS-переменной --accent, чтобы фон совпадал с
  // акцентным цветом сайта, даже если палитру поменяют в style.css.
  // Альфа-канал заметно выше, чем в прежней версии — там линии на светлом
  // фоне были почти не видны.
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1668e3';
  function accentRgba(alpha) {
    const hex = accent.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  // Обычные («второстепенные») изолинии — тонкие и бледные. Каждая
  // INDEX_EVERY-я — «утолщённая» опорная линия, как на бумажных топокартах,
  // где каждая пятая горизонталь жирнее остальных и подписывается высотой.
  const LINE_ALPHA = 0.28;
  const LINE_WIDTH = 1.0;
  const INDEX_EVERY = 4;
  const INDEX_LINE_ALPHA = 0.62;
  const INDEX_LINE_WIDTH = 2.0;

  // Шаг сетки по X/Y в CSS-пикселях — компромисс между гладкостью контуров
  // и скоростью пересчёта marching squares на каждом кадре.
  const CELL = 14;
  // Число уровней (изолиний) по высоте поля шума; поле нормировано примерно
  // в диапазон [-1.2, 1.2], уровни распределены равномерно по нему.
  const LEVEL_COUNT = 13;
  const LEVEL_MIN = -1.15;
  const LEVEL_MAX = 1.15;
  const LEVELS = Array.from({ length: LEVEL_COUNT }, (_, k) => LEVEL_MIN + ((LEVEL_MAX - LEVEL_MIN) * k) / (LEVEL_COUNT - 1));
  // Середина списка уровней считается «нулевой» горизонталью — от неё
  // отсчитываем опорные линии в обе стороны, как от уровня моря на карте.
  const INDEX_OFFSET = Math.floor(LEVEL_COUNT / 2) % INDEX_EVERY;

  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cols = 0;
  let rows = 0;
  let cellW = CELL;
  let cellH = CELL;
  let field = null; // Float32Array((cols+1)*(rows+1)) — значения поля в узлах сетки

  // Текущая и «догоняющая» (сглаженная) позиция курсора — инерция делает
  // прогиб поля плавным даже при редких событиях pointermove.
  let pointerX = -9999;
  let pointerY = -9999;
  let smoothX = -9999;
  let smoothY = -9999;
  let hasPointer = false;

  // ===== Поле шума (value noise, 2 октавы) =====
  // Детерминированный псевдослучайный хэш узла решётки — целочисленный
  // битовый хэш вместо Math.sin(): тригонометрия на CPU заметно дороже,
  // а buildField дергает хэш по 4 раза на узел сетки на каждый кадр —
  // при полном экране это сотни тысяч вызовов в секунду.
  function hashNode(ix, iy) {
    let h = (Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296; // 0..1
  }
  function smoothstep5(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function valueNoise2D(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smoothstep5(x - x0);
    const fy = smoothstep5(y - y0);
    const v00 = hashNode(x0, y0);
    const v10 = hashNode(x0 + 1, y0);
    const v01 = hashNode(x0, y0 + 1);
    const v11 = hashNode(x0 + 1, y0 + 1);
    const top = v00 + (v10 - v00) * fx;
    const bottom = v01 + (v11 - v01) * fx;
    return (top + (bottom - top) * fy) * 2 - 1; // -1..1
  }
  // Две октавы разной частоты дают крупные «холмы» с мелкими вложенными
  // петлями внутри — тот самый узнаваемый топографический рисунок.
  function fbm(x, y) {
    return valueNoise2D(x, y) * 1 + valueNoise2D(x * 2.37 + 50, y * 2.37 - 30) * 0.5;
  }

  const NOISE_FREQ = 0.0026; // масштаб «холмов» относительно экрана
  const DRIFT_X = 0.000018;
  const DRIFT_Y = 0.000012;

  // Курсор продавливает поле локальным «бугром» — рядом с ним контуры
  // стягиваются в дополнительную петлю, как будто в ткань карты воткнули
  // палец. Чисто декоративный эффект, не привязан к реальной высоте.
  // Чуть шире и мягче прежнего: резкий узкий бугор заставлял линии рядом
  // с курсором внезапно смыкаться/распадаться между соседними ячейками
  // сетки (видно как «скачок» формы), а не плавно утекать за курсором.
  const BUMP_RADIUS = 210;
  const BUMP_STRENGTH = 0.62;
  function bumpAt(x, y) {
    if (!hasPointer) return 0;
    const dx = x - smoothX;
    const dy = y - smoothY;
    const distSq = dx * dx + dy * dy;
    const r = BUMP_RADIUS;
    if (distSq > r * r * 4) return 0;
    return BUMP_STRENGTH * Math.exp(-distSq / (2 * (r / 1.8) ** 2));
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    width = Math.round(rect.width);
    height = Math.round(rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.max(2, Math.ceil(width / CELL));
    rows = Math.max(2, Math.ceil(height / CELL));
    cellW = width / cols;
    cellH = height / rows;
    field = new Float32Array((cols + 1) * (rows + 1));

    if (prefersReducedMotion) drawFrame(0);
  }

  // Пересчитывает значения поля во всех узлах сетки один раз за кадр —
  // ниже каждый уровень изолиний просто сравнивает с уже готовой сеткой,
  // вместо того чтобы заново сэмплировать шум для каждого уровня отдельно.
  function buildField(time) {
    const driftX = prefersReducedMotion ? 0 : time * DRIFT_X;
    const driftY = prefersReducedMotion ? 0 : time * DRIFT_Y;
    let idx = 0;
    for (let j = 0; j <= rows; j++) {
      const py = j * cellH;
      for (let i = 0; i <= cols; i++) {
        const px = i * cellW;
        const nx = px * NOISE_FREQ + driftX;
        const ny = py * NOISE_FREQ + driftY;
        field[idx++] = fbm(nx, ny) + bumpAt(px, py);
      }
    }
  }

  // ===== Marching squares =====
  // Таблица случаев: 4 угла ячейки (a=TL, b=TR, c=BR, d=BL), case = 8a+4b+2c+d.
  // Каждый случай — список отрезков между рёбрами ячейки: N(верх), E(право),
  // S(низ), W(лево). Случаи 5 и 10 (седловые) дают по два отрезка.
  const CASE_EDGES = [
    [],
    [['W', 'S']],
    [['S', 'E']],
    [['W', 'E']],
    [['N', 'E']],
    [['N', 'W'], ['S', 'E']],
    [['N', 'S']],
    [['N', 'W']],
    [['N', 'W']],
    [['N', 'S']],
    [['N', 'E'], ['W', 'S']],
    [['N', 'E']],
    [['W', 'E']],
    [['S', 'E']],
    [['W', 'S']],
    []
  ];

  function lerpEdge(level, v1, v2, x1, y1, x2, y2) {
    const denom = v2 - v1;
    const t = Math.abs(denom) < 1e-6 ? 0.5 : (level - v1) / denom;
    return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
  }

  // Ключ точки для склейки отрезков в цепочки: соседние ячейки сетки
  // интерполируют одну и ту же граничную точку из одних и тех же значений
  // в узлах, так что совпадение получается с точностью до float — десятых
  // пикселя как ключа более чем достаточно, чтобы не расклеить линию из-за
  // погрешности округления.
  function pointKey(p) {
    return Math.round(p[0] * 8) + '_' + Math.round(p[1] * 8);
  }

  // Буферы отрезков по уровням — один раз выделены и переиспользуются
  // каждый кадр (просто обнуляем .length), чтобы не грузить сборщик мусора
  // десятками тысяч коротких массивов в секунду.
  const levelSegments = LEVELS.map(() => []);

  // Раньше это была отдельная функция collectSegments(level), которую
  // вызывали 13 раз — по разу на каждый уровень, каждый раз заново обходя
  // ВСЮ сетку ячеек. Здесь сетка обходится один раз: значения в углах
  // ячейки (a,b,c,d) читаются из поля один раз, после чего по ним сразу
  // определяется диапазон [min,max] этой ячейки, и перебираются только те
  // уровни, что реально через неё проходят (обычно 1-2 из 13, а не все 13) —
  // кратное сокращение числа операций на кадр.
  function collectAllLevels() {
    for (let L = 0; L < LEVEL_COUNT; L++) levelSegments[L].length = 0;

    const stride = cols + 1;
    for (let j = 0; j < rows; j++) {
      const y0 = j * cellH;
      const y1 = y0 + cellH;
      const rowTop = j * stride;
      const rowBottom = (j + 1) * stride;
      for (let i = 0; i < cols; i++) {
        const x0 = i * cellW;
        const x1 = x0 + cellW;

        const a = field[rowTop + i];       // TL
        const b = field[rowTop + i + 1];   // TR
        const c = field[rowBottom + i + 1]; // BR
        const d = field[rowBottom + i];    // BL

        let minV = a, maxV = a;
        if (b < minV) minV = b; else if (b > maxV) maxV = b;
        if (c < minV) minV = c; else if (c > maxV) maxV = c;
        if (d < minV) minV = d; else if (d > maxV) maxV = d;

        for (let L = 0; L < LEVEL_COUNT; L++) {
          const level = LEVELS[L];
          if (level < minV) continue;
          if (level > maxV) break; // LEVELS отсортирован по возрастанию

          const caseIdx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
          const segs = CASE_EDGES[caseIdx];
          if (!segs.length) continue;

          const bucket = levelSegments[L];
          for (const [e1, e2] of segs) {
            bucket.push([edgePointAt(level, e1, a, b, c, d, x0, y0, x1, y1), edgePointAt(level, e2, a, b, c, d, x0, y0, x1, y1)]);
          }
        }
      }
    }
  }

  function edgePointAt(level, name, a, b, c, d, x0, y0, x1, y1) {
    switch (name) {
      case 'N': return lerpEdge(level, a, b, x0, y0, x1, y0);
      case 'E': return lerpEdge(level, b, c, x1, y0, x1, y1);
      case 'S': return lerpEdge(level, d, c, x0, y1, x1, y1);
      case 'W': return lerpEdge(level, a, d, x0, y0, x0, y1);
      default: return [x0, y0];
    }
  }

  // Склеивает разрозненные отрезки одного уровня в непрерывные цепочки
  // точек (замкнутые петли или оборванные на краю канваса) — без этого
  // каждый отрезок рисовался бы отдельным прямым звеном, и на поворотах
  // был виден «многогранник» вместо гладкой кривой.
  function stitchPolylines(segments) {
    const byPoint = new Map();
    const addRef = (key, ref) => {
      let list = byPoint.get(key);
      if (!list) { list = []; byPoint.set(key, list); }
      list.push(ref);
    };
    segments.forEach((seg, s) => {
      addRef(pointKey(seg[0]), { s, end: 0 });
      addRef(pointKey(seg[1]), { s, end: 1 });
    });

    const used = new Array(segments.length).fill(false);
    const polylines = [];

    const extend = (chain, fromEnd) => {
      for (;;) {
        const tip = fromEnd === 'end' ? chain[chain.length - 1] : chain[0];
        const candidates = byPoint.get(pointKey(tip));
        if (!candidates) return;
        const next = candidates.find((c) => !used[c.s]);
        if (!next) return;
        used[next.s] = true;
        const seg = segments[next.s];
        const otherPoint = next.end === 0 ? seg[1] : seg[0];
        if (fromEnd === 'end') chain.push(otherPoint);
        else chain.unshift(otherPoint);
      }
    };

    for (let s = 0; s < segments.length; s++) {
      if (used[s]) continue;
      used[s] = true;
      const chain = [segments[s][0], segments[s][1]];
      extend(chain, 'end');
      extend(chain, 'start');
      polylines.push(chain);
    }
    return polylines;
  }

  // Сглаженная кривая через узлы цепочки — проводит кривую через середины
  // соседних отрезков (дешёвый аналог catmull-rom), так что заметных
  // изломов на стыках ячеек сетки не остаётся.
  function strokeSmoothPolyline(pts) {
    if (pts.length < 2) return;
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 2) {
      ctx.lineTo(pts[1][0], pts[1][1]);
      return;
    }
    for (let i = 1; i < pts.length - 1; i++) {
      const [cx, cy] = pts[i];
      const [nx, ny] = pts[i + 1];
      const mx = (cx + nx) / 2;
      const my = (cy + ny) / 2;
      ctx.quadraticCurveTo(cx, cy, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
  }

  // Рисует уже собранные отрезки одного уровня одним path (один stroke на
  // уровень вместо одного на цепочку — ощутимо дешевле при сотнях петель).
  function drawLevelSegments(segments, color, lineWidth) {
    if (!segments.length) return;
    const polylines = stitchPolylines(segments);
    ctx.beginPath();
    for (const pts of polylines) strokeSmoothPolyline(pts);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function drawFrame(time) {
    ctx.clearRect(0, 0, width, height);
    buildField(time);
    collectAllLevels(); // один проход по сетке на все 13 уровней сразу
    const minorColor = accentRgba(LINE_ALPHA);
    const indexColor = accentRgba(INDEX_LINE_ALPHA);
    // Второстепенные линии рисуются первыми, опорные — поверх них, чтобы
    // утолщённый штрих не перекрывался тонкими соседними линиями.
    for (let L = 0; L < LEVEL_COUNT; L++) {
      if ((L + INDEX_OFFSET) % INDEX_EVERY === 0) continue;
      drawLevelSegments(levelSegments[L], minorColor, LINE_WIDTH);
    }
    for (let L = 0; L < LEVEL_COUNT; L++) {
      if ((L + INDEX_OFFSET) % INDEX_EVERY !== 0) continue;
      drawLevelSegments(levelSegments[L], indexColor, INDEX_LINE_WIDTH);
    }
  }

  let rafId = null;
  let lastTickTime = 0;
  // Раньше здесь был искусственный потолок в 24–30 кадров/с — чтобы не
  // гонять marching squares по всей сетке 60 раз в секунду. После отказа
  // от сборки сегментов level-за-level (13 проходов по всей сетке) в пользу
  // одного общего прохода с отсечением уровней вне диапазона [min,max]
  // ячейки, плюс целочисленный хэш шума вместо Math.sin(), кадр стал на
  // порядок дешевле — теперь рисуем на каждый тик requestAnimationFrame,
  // то есть на полную частоту обновления экрана (обычно 60 Гц и выше),
  // а не с явным троттлингом. Если на слабом устройстве кадр всё же не
  // укладывается в бюджет, браузер сам пропустит тик rAF — ограничивать
  // частоту вручную поверх этого не нужно.
  const POINTER_SMOOTH_MS = 90; // постоянная времени сглаживания курсора, мс

  // Сглаживание курсора — экспоненциальное, с постоянной времени, а не с
  // фиксированным шагом за кадр: скорость «бугра» не зависит от того,
  // насколько ровно идут кадры.
  function tickPointer(dt) {
    if (prefersReducedMotion || !hasPointer) return;
    const k = 1 - Math.exp(-dt / POINTER_SMOOTH_MS);
    smoothX += (pointerX - smoothX) * k;
    smoothY += (pointerY - smoothY) * k;
  }

  function loop(time) {
    rafId = requestAnimationFrame(loop);
    const dt = lastTickTime ? time - lastTickTime : 16.7;
    lastTickTime = time;
    tickPointer(dt);
    drawFrame(time);
  }

  function startLoop() {
    if (prefersReducedMotion || rafId !== null) return;
    rafId = requestAnimationFrame(loop);
  }
  function stopLoop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // «Бугор» под курсором имеет смысл только там, где есть настоящий
  // курсор, зависающий над страницей без нажатия (мышь/трекпад). На
  // тачскринах (телефоны, планшеты) pointermove тоже срабатывает — но
  // только во время свайпа пальцем, то есть деформация линий дёргалась бы
  // рывками при скролле/жестах, а не была живым откликом на движение
  // курсора. Поэтому слушатели вообще не вешаем, если у устройства нет
  // точного наведения без нажатия (pointer: fine + hover: hover).
  const supportsHoverPointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function onPointerMove(e) {
    // Доп. подстраховка для гибридных устройств (сенсорный ноутбук с
    // мышью): matchMedia выше отражает основной тип ввода устройства в
    // целом, а не конкретное событие, поэтому события от пальца всё равно
    // отфильтровываем по e.pointerType.
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    const rect = host.getBoundingClientRect();
    pointerX = e.clientX - rect.left;
    pointerY = e.clientY - rect.top;
    if (!hasPointer) {
      // Первое касание — сразу ставим сглаженную точку на курсор, чтобы
      // бугор не «прилетал» из угла экрана (-9999) первым же кадром.
      smoothX = pointerX;
      smoothY = pointerY;
    }
    hasPointer = true;
  }
  function onPointerLeave() {
    hasPointer = false;
  }

  if (supportsHoverPointer) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('pointercancel', onPointerLeave, { passive: true });
  }

  let resizeTimer = null;
  window.addEventListener(
    'resize',
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    },
    { passive: true }
  );

  // Пока первый экран вне видимости (пролистали дальше по сайту) — не
  // тратим кадры на анимацию фона, которого всё равно не видно.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => (entry.isIntersecting ? startLoop() : stopLoop()));
      },
      { threshold: 0 }
    );
    io.observe(host);
  } else {
    startLoop();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop();
    else if (!prefersReducedMotion) startLoop();
  });

  resize();
  if (!prefersReducedMotion) startLoop();
})();