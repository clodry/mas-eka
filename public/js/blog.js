const blogGrid = document.getElementById('blogGrid');
const blogList = document.getElementById('blogList');
const postView = document.getElementById('postView');
const postContent = document.getElementById('postContent');
const backToList = document.getElementById('backToList');
const tagFilterBar = document.getElementById('tagFilterBar');

let activeTag = new URLSearchParams(window.location.search).get('tag') || null;

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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

let allPosts = [];
let allTags = [];

function getSlugFromUrl() {
  const match = window.location.pathname.match(/^\/blog\/([^/]+)\/?$/);
  if (match) return decodeURIComponent(match[1]);
  const params = new URLSearchParams(window.location.search);
  return params.get('post');
}

function postUrl(slug) {
  return `/blog/${encodeURIComponent(slug)}`;
}

function filterByTag(posts, tag) {
  if (!tag) return posts;
  const lower = tag.toLowerCase();
  return posts.filter((p) => Array.isArray(p.tags) && p.tags.some((t) => t.toLowerCase() === lower));
}

function renderTagFilterBar(tags) {
  if (!tagFilterBar) return;
  if (!tags.length) { tagFilterBar.innerHTML = ''; return; }

  const allChip = `<span class="tag-chip${activeTag ? '' : ' active'}" data-tag="">Все теги</span>`;
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
      const url = activeTag ? `/blog?tag=${encodeURIComponent(activeTag)}` : '/blog';
      history.pushState({}, '', url);
      renderGrid(filterByTag(allPosts, activeTag));
      renderTagFilterBar(tags);
    });
  });
}

async function loadPosts() {
  const pathSlug = getSlugFromUrl();
  const serverRendered = pathSlug && document.getElementById('postView')?.classList.contains('active');

  try {
    const res = await fetch('/api/posts');
    allPosts = await res.json();

    if (serverRendered) {
      // Страница уже отрендерена сервером для SEO — только подгружаем список в фоне
      return;
    }

    renderGrid(filterByTag(allPosts, activeTag));

    fetch('/api/posts/tags/all')
      .then((r) => r.json())
      .then((tags) => {
        allTags = Array.isArray(tags) ? tags : [];
        renderTagFilterBar(allTags);
      })
      .catch(() => {});

    const slug = pathSlug;
    if (slug) {
      const post = allPosts.find((p) => p.slug === slug);
      if (post) showPost(post, false);
    }
  } catch (err) {
    if (!serverRendered) {
      blogGrid.innerHTML = '<p style="color:var(--text-muted)">Не удалось загрузить статьи.</p>';
    }
  }
}

function renderGrid(posts) {
  if (!posts.length) {
    blogGrid.innerHTML = '<p style="color:var(--text-muted)">Пока нет опубликованных статей.</p>';
    return;
  }
  blogGrid.innerHTML = posts
    .map(
      (post, i) => `
    <article class="post-card reveal" style="--delay:${(i % 3) * 0.12}s" data-slug="${escapeHtml(post.slug)}">
      <a href="${postUrl(post.slug)}" class="post-link" data-slug="${escapeHtml(post.slug)}">
        <div class="thumb">${post.previewImage ? `<img src="${post.previewImage}" alt="" style="width:100%;height:100%;object-fit:cover">` : placeholderThumb(i)}</div>
        <div class="body">
          <span class="date">${formatDate(post.publishedAt || post.created_at)}</span>
          <h3>${escapeHtml(post.title)}</h3>
          <p>${escapeHtml(post.excerpt)}</p>
          ${Array.isArray(post.tags) && post.tags.length ? `<div class="card-tags">${post.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          <span class="read-more">Читать далее →</span>
        </div>
      </a>
    </article>`
    )
    .join('');

  document.querySelectorAll('.post-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      const post = allPosts.find((p) => p.slug === link.dataset.slug);
      if (post) showPost(post, true);
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

function renderBlocks(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return '';
  return blocks
    .map((b) => {
      if (b.type === 'image' && b.src) {
        return `
        <figure class="post-figure">
          <img src="${b.src}" alt="${escapeHtml(b.caption || '')}">
          ${b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : ''}
        </figure>`;
      }
      if (b.type === 'paragraph' && (b.html || b.text)) {
        const content = b.html !== undefined ? b.html : escapeHtml(b.text);
        return `<p>${content}</p>`;
      }
      return '';
    })
    .join('');
}

function showPost(post, pushState) {
  const tagsHtml = Array.isArray(post.tags) && post.tags.length
    ? `<div class="post-tags">${post.tags.map((t) => `<a class="post-tag" href="/blog?tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join('')}</div>`
    : '';
  const author = post.author;
  const authorHtml = author
    ? `<a class="post-author" href="/author/${encodeURIComponent(author.slug)}">
        ${author.photo ? `<img class="post-author-photo" src="${escapeHtml(author.photo)}" alt="${escapeHtml(author.name)}">` : ''}
        <span class="post-author-info"><span class="post-author-name">${escapeHtml(author.name)}</span>${author.role ? `<span class="post-author-role">${escapeHtml(author.role)}</span>` : ''}</span>
      </a>`
    : '';
  postContent.innerHTML = `
    <span class="date">${formatDate(post.publishedAt || post.created_at)}</span>
    <h1>${escapeHtml(post.title)}</h1>
    ${authorHtml}
    ${tagsHtml}
    <div class="content">${renderBlocks(post.blocks)}</div>
  `;
  blogList.classList.add('hidden');
  postView.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if (pushState) {
    history.pushState({}, '', postUrl(post.slug));
    trackPostView(post.slug);
  }
}

// Переход по клику на карточку поста происходит без перезагрузки страницы,
// поэтому серверный счётчик просмотров (см. /blog/:slug) его не видит —
// отмечаем такой просмотр отдельным запросом. Заходы напрямую по ссылке
// или обновление страницы уже учтены на сервере, здесь не дублируются.
function trackPostView(slug) {
  try {
    fetch('/api/analytics/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
      keepalive: true
    }).catch(() => {});
  } catch (e) {}
}

function showList() {
  blogList.classList.remove('hidden');
  postView.classList.remove('active');
  history.pushState({}, '', '/blog');
}

backToList.addEventListener('click', (e) => {
  // На серверной странице /blog/:slug — обычный переход по ссылке
  if (/^\/blog\//.test(window.location.pathname)) return;
  e.preventDefault();
  showList();
});

window.addEventListener('popstate', () => {
  const slug = getSlugFromUrl();
  if (slug) {
    const post = allPosts.find((p) => p.slug === slug);
    if (post) return showPost(post, false);
  }
  activeTag = new URLSearchParams(window.location.search).get('tag') || null;
  renderGrid(filterByTag(allPosts, activeTag));
  showList();
});

loadPosts();