const portfolioGrid = document.getElementById('portfolioGrid');
const portfolioList = document.getElementById('portfolioList');
const projectView = document.getElementById('projectView');
const projectContent = document.getElementById('projectContent');
const backToList = document.getElementById('backToList');
const tagFilterBar = document.getElementById('tagFilterBar');

let activeTag = new URLSearchParams(window.location.search).get('tag') || null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Та же заглушка-превью, что и в блоге (public/js/blog.js) — на случай,
// если у проекта ещё не загружена обложка.
function placeholderThumb(seed) {
  const variant = seed % 3;
  const shape =
    variant === 0
      ? '<path d="M20 170 L20 90 L90 50 L160 90 L160 170 M20 90 L160 90"/><rect x="60" y="120" width="24" height="50"/><rect x="110" y="110" width="30" height="60"/>'
      : variant === 1
      ? '<circle cx="90" cy="100" r="46"/><path d="M90 54 V146 M44 100 H136"/>'
      : '<path d="M30 160 L110 60 L190 160 Z"/><path d="M60 160 V120 H100 V160"/>';
  return `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <rect width="320" height="200" fill="#eaf1fb"/>
    <g stroke="#1d4a98" stroke-width="1.4" fill="none" opacity="0.85">${shape}</g>
    <g stroke="#dde6f3" stroke-width="1"><line x1="200" y1="20" x2="200" y2="180"/></g>
  </svg>`;
}

let allProjects = [];
let allTags = [];

function getSlugFromUrl() {
  const match = window.location.pathname.match(/^\/portfolio\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function projectUrl(slug) {
  return `/portfolio/${encodeURIComponent(slug)}`;
}

function filterByTag(projects, tag) {
  if (!tag) return projects;
  const lower = tag.toLowerCase();
  return projects.filter(
    (p) =>
      (p.category && p.category.toLowerCase() === lower) ||
      (Array.isArray(p.tags) && p.tags.some((t) => t.toLowerCase() === lower))
  );
}

function renderTagFilterBar(tags) {
  if (!tagFilterBar) return;
  if (!tags.length) { tagFilterBar.innerHTML = ''; return; }

  const allChip = `<span class="tag-chip${activeTag ? '' : ' active'}" data-tag="">Все</span>`;
  const chips = tags
    .map(
      ({ tag, count }) =>
        `<span class="tag-chip${activeTag && activeTag.toLowerCase() === tag.toLowerCase() ? ' active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} (${count})</span>`
    )
    .join('');
  tagFilterBar.innerHTML = allChip + chips;

  tagFilterBar.querySelectorAll('.tag-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeTag = chip.dataset.tag || null;
      const url = activeTag ? `/portfolio?tag=${encodeURIComponent(activeTag)}` : '/portfolio';
      history.pushState({}, '', url);
      renderGrid(filterByTag(allProjects, activeTag));
      renderTagFilterBar(tags);
    });
  });
}

async function loadProjects() {
  const pathSlug = getSlugFromUrl();
  const serverRendered = pathSlug && document.getElementById('projectView')?.classList.contains('active');

  try {
    const res = await fetch('/api/portfolio');
    allProjects = await res.json();

    if (serverRendered) {
      // Страница уже отрендерена сервером для SEO — только подгружаем список в фоне
      return;
    }

    renderGrid(filterByTag(allProjects, activeTag));

    fetch('/api/portfolio/tags/all')
      .then((r) => r.json())
      .then((tags) => {
        allTags = Array.isArray(tags) ? tags : [];
        renderTagFilterBar(allTags);
      })
      .catch(() => {});

    if (pathSlug) {
      const project = allProjects.find((p) => p.slug === pathSlug);
      if (project) showProject(project, false);
    }
  } catch (err) {
    if (!serverRendered) {
      portfolioGrid.innerHTML = '<p style="color:var(--text-muted)">Не удалось загрузить проекты.</p>';
    }
  }
}

function renderGrid(projects) {
  if (!projects.length) {
    portfolioGrid.innerHTML = '<p style="color:var(--text-muted)">Пока нет опубликованных проектов.</p>';
    return;
  }
  portfolioGrid.innerHTML = projects
    .map(
      (project, i) => `
    <article class="post-card reveal" style="--delay:${(i % 3) * 0.12}s" data-slug="${escapeHtml(project.slug)}">
      <a href="${projectUrl(project.slug)}" class="post-link" data-slug="${escapeHtml(project.slug)}">
        <div class="thumb">${project.coverImage ? `<img src="${project.coverImage}" alt="" style="width:100%;height:100%;object-fit:cover">` : placeholderThumb(i)}</div>
        <div class="body">
          ${project.category ? `<span class="card-category">${escapeHtml(project.category)}</span>` : ''}
          <h3>${escapeHtml(project.title)}</h3>
          <p>${escapeHtml(project.excerpt)}</p>
          <span class="read-more">Смотреть проект →</span>
        </div>
      </a>
    </article>`
    )
    .join('');

  document.querySelectorAll('.post-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      const project = allProjects.find((p) => p.slug === link.dataset.slug);
      if (project) showProject(project, true);
    });
  });

  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    }),
    { threshold: 0.15 }
  );
  document.querySelectorAll('.post-card.reveal').forEach((el) => observer.observe(el));
}

function renderDescription(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function renderGallery(gallery) {
  if (!Array.isArray(gallery) || !gallery.length) return '';
  return `<div class="project-gallery">${gallery
    .map((src) => `<figure class="post-figure"><img src="${src}" alt=""></figure>`)
    .join('')}</div>`;
}

function renderMeta(project) {
  const items = [project.category, project.location, project.year].filter(Boolean);
  return items.length ? `<div class="project-meta">${items.map((i) => `<span>${escapeHtml(i)}</span>`).join('')}</div>` : '';
}

function showProject(project, pushState) {
  projectContent.innerHTML = `
    <h1>${escapeHtml(project.title)}</h1>
    ${renderMeta(project)}
    ${project.coverImage ? `<figure class="post-figure project-cover"><img src="${project.coverImage}" alt=""></figure>` : ''}
    <div class="content">${renderDescription(project.description)}</div>
    ${renderGallery(project.gallery)}
  `;
  portfolioList.classList.add('hidden');
  projectView.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if (pushState) history.pushState({}, '', projectUrl(project.slug));
}

function showList() {
  portfolioList.classList.remove('hidden');
  projectView.classList.remove('active');
  history.pushState({}, '', '/portfolio');
}

backToList.addEventListener('click', (e) => {
  // На серверной странице /portfolio/:slug — обычный переход по ссылке
  if (/^\/portfolio\//.test(window.location.pathname)) return;
  e.preventDefault();
  showList();
});

window.addEventListener('popstate', () => {
  const slug = getSlugFromUrl();
  if (slug) {
    const project = allProjects.find((p) => p.slug === slug);
    if (project) return showProject(project, false);
  }
  activeTag = new URLSearchParams(window.location.search).get('tag') || null;
  renderGrid(filterByTag(allProjects, activeTag));
  showList();
});

loadProjects();
