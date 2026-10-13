// ===== Живые изолинии на первом экране =====
// Фон первого экрана — отрисованные на <canvas> «топографические» линии,
// которые медленно дрейфуют сами по себе и прогибаются от курсора мыши
// (или пальца на тач-устройствах), как будто курсор продавливает
// натянутую ткань. Картинка (HERO_PHOTO) больше не используется на фоне —
// админ-поле для неё в панели можно оставить про запас или убрать отдельно.
(function () {
  const canvas = document.getElementById('heroIsolines');
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const host = canvas.parentElement; // .hero-bg — задаёт размеры

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Цвет линий берём из CSS-переменной --accent, чтобы фон всегда совпадал
  // с акцентным цветом сайта, даже если палитру поменяют в style.css.
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1668e3';
  function accentRgba(alpha) {
    // --accent задан как hex (#1668e3) — переводим в rgb для alpha-канала.
    const hex = accent.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const LINE_COUNT = 22;
  const SAMPLE_STEP = 10; // px между опорными точками по X — компромисс гладкость/скорость

  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let xs = []; // опорные точки по X (общие для всех линий)
  let lines = []; // параметры каждой линии

  // Текущая и «догоняющая» (сглаженная) позиция курсора — лёгкое
  // инерционное движение приятнее, чем мгновенный скачок точки влияния.
  let pointerX = -9999;
  let pointerY = -9999;
  let smoothX = -9999;
  let smoothY = -9999;
  let hasPointer = false;

  function buildLines() {
    xs = [];
    for (let x = 0; x <= width + SAMPLE_STEP; x += SAMPLE_STEP) xs.push(x);

    lines = [];
    for (let i = 0; i < LINE_COUNT; i++) {
      const t = i / (LINE_COUNT - 1); // 0..1 сверху вниз
      lines.push({
        baseY: height * (0.08 + t * 0.92),
        amp1: 14 + Math.random() * 22,
        freq1: 0.0022 + Math.random() * 0.002,
        phase1: Math.random() * Math.PI * 2,
        amp2: 6 + Math.random() * 10,
        freq2: 0.006 + Math.random() * 0.004,
        phase2: Math.random() * Math.PI * 2,
        speed: 0.00006 + Math.random() * 0.00008,
        alpha: 0.07 + (1 - Math.abs(t - 0.5) * 2) * 0.1 // линии ближе к центру чуть заметнее
      });
    }
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    width = Math.round(rect.width);
    height = Math.round(rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildLines();
    if (prefersReducedMotion) drawFrame(0);
  }

  // Прогиб «от курсора»: чем ближе точка линии к курсору, тем сильнее её
  // отталкивает по вертикали — получается мягкий купол вокруг указателя,
  // как будто он продавливает ткань снизу или сверху.
  const INFLUENCE_RADIUS = 220;
  const INFLUENCE_STRENGTH = 46;

  function cursorOffset(x, baseY) {
    if (!hasPointer) return 0;
    const dx = x - smoothX;
    const dy = baseY - smoothY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > INFLUENCE_RADIUS) return 0;
    const influence = Math.exp(-(dist * dist) / (2 * (INFLUENCE_RADIUS / 2.2) ** 2));
    const sign = dy === 0 ? 1 : Math.sign(dy);
    return sign * influence * INFLUENCE_STRENGTH;
  }

  // Лёгкая инерция курсора считается на каждом кадре анимации, а не в
  // обработчике события — так движение остаётся плавным даже при редких
  // событиях pointermove (например, на тач-устройствах).
  function tickPointer() {
    smoothX += (pointerX - smoothX) * 0.12;
    smoothY += (pointerY - smoothY) * 0.12;
  }

  function drawFrame(time) {
    if (!prefersReducedMotion) tickPointer();
    ctx.clearRect(0, 0, width, height);

    lines.forEach((line) => {
      const drift = prefersReducedMotion ? 0 : time * line.speed;
      const pts = xs.map((x) => {
        const wave =
          Math.sin(x * line.freq1 + line.phase1 + drift) * line.amp1 +
          Math.sin(x * line.freq2 + line.phase2 + drift * 1.7) * line.amp2;
        const y = line.baseY + wave + cursorOffset(x, line.baseY + wave);
        return [x, y];
      });

      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      // Сглаживание через среднюю точку между соседними узлами — дешёвый
      // аналог catmull-rom, без видимых изломов на вершинах синусоид.
      for (let i = 1; i < pts.length - 1; i++) {
        const [cx, cy] = pts[i];
        const [nx, ny] = pts[i + 1];
        const mx = (cx + nx) / 2;
        const my = (cy + ny) / 2;
        ctx.quadraticCurveTo(cx, cy, mx, my);
      }
      ctx.strokeStyle = accentRgba(line.alpha);
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  let rafId = null;
  function loop(time) {
    drawFrame(time);
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (prefersReducedMotion || rafId !== null) return;
    rafId = requestAnimationFrame(loop);
  }
  function stopLoop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function onPointerMove(e) {
    const rect = host.getBoundingClientRect();
    pointerX = e.clientX - rect.left;
    pointerY = e.clientY - rect.top;
    if (!hasPointer) {
      // Первое касание — сразу ставим сглаженную точку на курсор, чтобы
      // линии не «прилетали» из угла экрана (-9999) первым же кадром.
      smoothX = pointerX;
      smoothY = pointerY;
    }
    hasPointer = true;
  }
  function onPointerLeave() {
    hasPointer = false;
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', onPointerLeave, { passive: true });
  window.addEventListener('pointercancel', onPointerLeave, { passive: true });

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