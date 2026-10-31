// ===== Навбар: смена фона при скролле =====
// Поведение навигации и оформление шапки при прокрутке.
const navbar = document.querySelector('.navbar');
const menuButton = document.querySelector('.nav-toggle');
const primaryNavigation = document.querySelector('.nav-links');

function setMenuOpen(isOpen) {
  if (!navbar || !menuButton) return;
  navbar.classList.toggle('menu-open', isOpen);
  menuButton.setAttribute('aria-expanded', String(isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню');
}

menuButton?.addEventListener('click', () => {
  setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true');
});
primaryNavigation?.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMenuOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenuOpen(false);
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 720) setMenuOpen(false);
});

function onScroll() {
  if (window.scrollY > 40) navbar.classList.add('scrolled');
  else navbar.classList.remove('scrolled');
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ===== Reveal-анимации при скролле =====
const revealEls = document.querySelectorAll('.reveal, .reveal-scale');
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
);
revealEls.forEach((el, i) => {
  el.style.setProperty('--delay', `${Math.min(i % 4, 3) * 0.12}s`);
  revealObserver.observe(el);
});

// ===== Анимированные счётчики (секция «О нас») =====
function animateCounter(el) {
  const target = parseFloat(el.dataset.count);
  const suffix = el.dataset.suffix || '';
  const duration = 1400;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = target < 10 ? (target * eased).toFixed(1) : Math.round(target * eased);
    el.textContent = value + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const counters = document.querySelectorAll('[data-count]');
const counterObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.5 }
);
counters.forEach((el) => counterObserver.observe(el));

// ===== Тизер блога на главной =====
const teaserGrid = document.getElementById('blogTeaserGrid');

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function placeholderThumb(seed) {
  const hueShift = seed % 3;
  const lines = [
    '<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">',
    '<rect width="320" height="200" fill="#eaf1fb"/>',
    '<g stroke="#1d4a98" stroke-width="1.4" fill="none" opacity="0.85">',
    hueShift === 0
      ? '<path d="M20 170 L20 90 L90 50 L160 90 L160 170 M20 90 L160 90"/><rect x="60" y="120" width="24" height="50"/><rect x="110" y="110" width="30" height="60"/>'
      : hueShift === 1
      ? '<circle cx="90" cy="100" r="46"/><path d="M90 54 V146 M44 100 H136"/>'
      : '<path d="M30 160 L110 60 L190 160 Z"/><path d="M60 160 V120 H100 V160"/>',
    '</g>',
    '<g stroke="#dde6f3" stroke-width="1">',
    '<line x1="200" y1="20" x2="200" y2="180"/>',
    '</g>',
    '</svg>'
  ];
  return lines.join('');
}

async function loadTeaserPosts() {
  if (!teaserGrid) return;
  try {
    const res = await fetch('/api/posts?limit=3');
    const posts = await res.json();
    if (!Array.isArray(posts) || posts.length === 0) {
      teaserGrid.innerHTML = '<p style="color:var(--text-muted)">Пока нет опубликованных статей — загляните позже.</p>';
      return;
    }
    teaserGrid.innerHTML = posts
      .map(
        (post, i) => `
      <article class="post-card reveal" style="--delay:${i * 0.12}s">
        <a href="/blog/${encodeURIComponent(post.slug)}">
          <div class="thumb">${post.previewImage ? `<img src="${post.previewImage}" alt="" style="width:100%;height:100%;object-fit:cover">` : placeholderThumb(i)}</div>
          <div class="body">
            <span class="date">${formatDate(post.created_at)}</span>
            <h3>${escapeHtml(post.title)}</h3>
            <p>${escapeHtml(post.excerpt)}</p>
            <span class="read-more">Читать далее →</span>
          </div>
        </a>
      </article>`
      )
      .join('');

    teaserGrid.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));
  } catch (err) {
    teaserGrid.innerHTML = '<p style="color:var(--text-muted)">Не удалось загрузить статьи блога.</p>';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadTeaserPosts();

// Кастомный курсор, параллакс водяных знаков, 3D-наклон карточек и
// «магнитные» кнопки убраны вместе со сменой стиля: в спокойной
// типографической подаче они читались как лишний аттракцион.
