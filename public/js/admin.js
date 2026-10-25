const adminScreen = document.getElementById('adminScreen');
const logoutBtn = document.getElementById('logoutBtn');

const postForm = document.getElementById('postForm');
const formTitle = document.getElementById('formTitle');
const formError = document.getElementById('formError');
const resetFormBtn = document.getElementById('resetFormBtn');
const postsList = document.getElementById('postsList');
const blocksEditor = document.getElementById('blocksEditor');
const addParagraphBtn = document.getElementById('addParagraphBtn');
const addImageBtn = document.getElementById('addImageBtn');
const previewBox = document.getElementById('previewBox');
const statCards = document.getElementById('statCards');
const analyticsChart = document.getElementById('analyticsChart');
const analyticsTopPosts = document.getElementById('analyticsTopPosts');
const analyticsUniqueVisitors = document.getElementById('analyticsUniqueVisitors');
const postSearch = document.getElementById('postSearch');
const dashSidebar = document.getElementById('dashSidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const dashLayout = document.getElementById('dashLayout');
const sidebarCollapseToggle = document.getElementById('sidebarCollapseToggle');
const dashboardsToggle = document.getElementById('dashboardsToggle');
const dashboardsChildren = document.getElementById('dashboardsChildren');
const previewPostBtn = document.getElementById('previewPostBtn');
const previewModal = document.getElementById('previewModal');
const previewArticle = document.getElementById('previewArticle');
const closePreviewBtn = document.getElementById('closePreviewBtn');
const tagSuggestions = document.getElementById('tagSuggestions');
const slugInput = document.getElementById('slugInput');

// ===== Статус публикации: модалка «Отложенная публикация» и автор статьи =====
const openScheduleModalBtn = document.getElementById('openScheduleModalBtn');
const scheduleModal = document.getElementById('scheduleModal');
const closeScheduleModalBtn = document.getElementById('closeScheduleModalBtn');
const cancelScheduleBtn = document.getElementById('cancelScheduleBtn');
const confirmScheduleBtn = document.getElementById('confirmScheduleBtn');
const scheduleModalError = document.getElementById('scheduleModalError');
const publishedAtInput = document.getElementById('publishedAtInput');
const authorSelect = document.getElementById('authorSelect');
const authorProfileLink = document.getElementById('authorProfileLink');

// ===== Страница «Авторы» =====
const authorForm = document.getElementById('authorForm');
const authorFormTitle = document.getElementById('authorFormTitle');
const authorFormError = document.getElementById('authorFormError');
const authorNameInput = document.getElementById('authorNameInput');
const authorSlugInput = document.getElementById('authorSlugInput');
const authorPhotoBox = document.getElementById('authorPhotoBox');
const authorsList = document.getElementById('authorsList');
const resetAuthorFormBtn = document.getElementById('resetAuthorFormBtn');

// ===== Страница «Портфолио» =====
const projectForm = document.getElementById('projectForm');
const projectFormTitle = document.getElementById('projectFormTitle');
const projectFormError = document.getElementById('projectFormError');
const projectTitleInput = document.getElementById('projectTitleInput');
const projectSlugInput = document.getElementById('projectSlugInput');
const projectDescriptionInput = document.getElementById('projectDescriptionInput');
const projectCoverBox = document.getElementById('projectCoverBox');
const projectGalleryBox = document.getElementById('projectGalleryBox');
const projectGalleryFileInput = document.getElementById('projectGalleryFileInput');
const portfolioAdminList = document.getElementById('portfolioAdminList');
const resetProjectFormBtn = document.getElementById('resetProjectFormBtn');
const projectTagSuggestions = document.getElementById('projectTagSuggestions');

const siteContentForm = document.getElementById('siteContentForm');
const siteContentError = document.getElementById('siteContentError');
const siteContentSuccess = document.getElementById('siteContentSuccess');
const heroPhotoBox = document.getElementById('heroPhotoBox');
const statsEditor = document.getElementById('statsEditor');
const valuesEditor = document.getElementById('valuesEditor');
const addStatBtn = document.getElementById('addStatBtn');
const addValueBtn = document.getElementById('addValueBtn');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ===== Генератор ЧПУ (черновой предпросмотр на клиенте) =====
// Транслитерация зеркалит серверную utils/slugify.js — здесь она нужна только
// для мгновенного визуального предпросмотра адреса при вводе заголовка;
// окончательный, гарантированно уникальный slug всегда формирует сервер.
const TRANSLIT_MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
};

function clientSlugify(text) {
  return String(text || '')
    .toLowerCase()
    .split('')
    .map((ch) => (TRANSLIT_MAP[ch] !== undefined ? TRANSLIT_MAP[ch] : ch))
    .join('')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Пока пользователь не начал вписывать адрес вручную, он автоматически
// подстраивается под заголовок. Как только slug тронут руками — авто-подстройка
// выключается, чтобы не затирать ручную правку.
let slugTouchedByUser = false;
if (slugInput) {
  slugInput.addEventListener('input', () => {
    slugTouchedByUser = slugInput.value.trim().length > 0;
  });
  postForm.elements.title.addEventListener('input', () => {
    if (slugTouchedByUser) return;
    slugInput.value = clientSlugify(postForm.elements.title.value);
  });
}

let projectSlugTouchedByUser = false;
if (projectSlugInput) {
  projectSlugInput.addEventListener('input', () => {
    projectSlugTouchedByUser = projectSlugInput.value.trim().length > 0;
  });
  projectTitleInput.addEventListener('input', () => {
    if (projectSlugTouchedByUser) return;
    projectSlugInput.value = clientSlugify(projectTitleInput.value);
  });
}

function genId() {
  return 'blk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ===== Статус публикации =====
// Больше нет отдельного переключателя — статус определяется тем, какую
// кнопку в form-actions нажал пользователь (см. обработчик submit ниже).

// datetime-local хранит локальное время без таймзоны ('2026-08-05T14:30') —
// эти две функции переводят его в/из ISO-строки, которую хранит и отдаёт сервер.
function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===== Автор статьи =====
let authorsState = [];

function renderAuthorSelectOptions() {
  authorSelect.innerHTML = authorsState
    .map((a) => `<option value="${a.id}">${escapeHtml(a.name)}${a.role ? ` — ${escapeHtml(a.role)}` : ''}</option>`)
    .join('');
}

function updateAuthorProfileLink() {
  const author = authorsState.find((a) => a.id === authorSelect.value);
  if (author) {
    authorProfileLink.href = `/author/${encodeURIComponent(author.slug)}`;
    authorProfileLink.hidden = false;
  } else {
    authorProfileLink.hidden = true;
  }
}

authorSelect.addEventListener('change', updateAuthorProfileLink);

async function loadAuthorsForSelect() {
  try {
    const res = await fetch('/api/authors');
    authorsState = await res.json();
    renderAuthorSelectOptions();
    updateAuthorProfileLink();
  } catch (err) {
    authorsState = [];
  }
}

// ===== Состояние блочного редактора =====
// Каждый блок: { id, type: 'paragraph', text } или { id, type: 'image', existingSrc, file, previewUrl, caption }
let blocksState = [];

// ===== Состояние превью карточки =====
// mode: 'auto' (первое фото статьи), 'own' (загружено отдельно), 'block' (скопировано с фото из статьи)
let previewState = { mode: 'auto', file: null, existingSrc: null, blockId: null };

function newParagraphBlock(html) {
  return { id: genId(), type: 'paragraph', html: html || '' };
}
function newImageBlock({ existingSrc, caption } = {}) {
  return { id: genId(), type: 'image', existingSrc: existingSrc || null, file: null, previewUrl: existingSrc || null, caption: caption || '' };
}

// ===== Секция «Превью карточки» =====
function renderPreviewBox() {
  let url = null;

  if (previewState.mode === 'own') {
    url = previewState.file ? URL.createObjectURL(previewState.file) : previewState.existingSrc;
  } else if (previewState.mode === 'block') {
    const block = blocksState.find((b) => b.id === previewState.blockId);
    if (block && block.previewUrl) {
      url = block.previewUrl;
    } else {
      previewState = { mode: 'auto', file: null, existingSrc: null, blockId: null };
    }
  }

  if (!url) {
    previewBox.innerHTML = `
      <div class="preview-box-empty">
        <span>Фото не выбрано — будет использовано первое фото статьи</span>
        <label class="file-label">
          Выбрать фото
          <input type="file" accept="image/*" id="previewOwnFile">
        </label>
      </div>`;
  } else {
    const sourceTag = previewState.mode === 'block' ? 'Скопировано из фото в статье' : 'Загружено отдельно';
    previewBox.innerHTML = `
      <div class="preview-box-filled">
        <div class="preview-thumb"><img src="${url}" alt=""></div>
        <div class="preview-actions">
          <span class="preview-source-tag">${sourceTag}</span>
          <label class="file-label">
            Заменить фото
            <input type="file" accept="image/*" id="previewOwnFile">
          </label>
          <button type="button" id="clearPreviewBtn" class="icon-btn" title="Убрать превью">Убрать превью</button>
        </div>
      </div>`;
  }

  const fileInput = document.getElementById('previewOwnFile');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      previewState = { mode: 'own', file, existingSrc: null, blockId: null };
      renderPreviewBox();
      renderBlocks();
    });
  }
  const clearBtn = document.getElementById('clearPreviewBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      previewState = { mode: 'auto', file: null, existingSrc: null, blockId: null };
      renderPreviewBox();
      renderBlocks();
    });
  }
}

function setPreviewFromBlock(blockId) {
  previewState = { mode: 'block', blockId, file: null, existingSrc: null };
  renderPreviewBox();
  renderBlocks();
}

// ===== Пользовательские шрифты в статье =====
// fontsState: [{ family, url, originalName }] — шрифты, загруженные в рамках
// текущего поста. Подставляются в форму при сохранении и внедряются в
// документ как @font-face, чтобы сразу были видны в редакторе и в превью.
let fontsState = [];

function ensureFontFaceStyleTag() {
  let tag = document.getElementById('customFontFacesStyle');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'customFontFacesStyle';
    document.head.appendChild(tag);
  }
  return tag;
}

function injectFontFace(font) {
  const tag = ensureFontFaceStyleTag();
  if (tag.dataset[font.family]) return;
  tag.dataset[font.family] = '1';
  tag.appendChild(
    document.createTextNode(`\n@font-face { font-family: '${font.family}'; src: url('${font.url}'); font-display: swap; }`)
  );
}

function resetFontFaceStyleTag() {
  const tag = document.getElementById('customFontFacesStyle');
  if (tag) tag.textContent = '';
}

const FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48];

// Клик по выпадающему списку размера или по кнопке загрузки шрифта уводит
// фокус с contenteditable, из-за чего теряется выделение текста. Поэтому
// запоминаем последнее непустое выделение внутри блока статьи и, если к
// моменту применения стиля выделения уже нет, восстанавливаем его.
let savedSelection = null; // { blockId, range }

document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const container = node.nodeType === 1 ? node : node.parentElement;
  const el = container ? container.closest('.rte-editable') : null;
  if (el) savedSelection = { blockId: el.dataset.id, range: range.cloneRange() };
});

function restoreSelectionIfNeeded(blockId) {
  const sel = window.getSelection();
  if (sel && sel.rangeCount && !sel.isCollapsed) {
    const node = sel.anchorNode;
    const container = node && (node.nodeType === 1 ? node : node.parentElement);
    const el = container ? container.closest('.rte-editable') : null;
    if (el && el.dataset.id === blockId) return true; // уже есть актуальное выделение
  }
  if (savedSelection && savedSelection.blockId === blockId && sel) {
    sel.removeAllRanges();
    sel.addRange(savedSelection.range.cloneRange());
    return true;
  }
  return false;
}

// Оборачивает выделенный текст в блоке в <span style="..."> с заданным CSS-
// свойством. Технически: временно помечаем выделение через execCommand
// fontSize (даёт надёжный якорь даже при выделении, пересекающем несколько
// узлов), затем заменяем полученный <font size="7"> на свой <span>.
function applyInlineStyleToSelection(blockId, cssProp, cssValue) {
  const el = blocksEditor.querySelector(`.rte-editable[data-id="${blockId}"]`);
  if (!el) return;
  el.focus();
  const hasSelection = restoreSelectionIfNeeded(blockId);
  const selection = window.getSelection();
  if (!hasSelection || !selection || selection.isCollapsed) {
    alert('Сначала выделите текст, к которому нужно применить стиль.');
    return;
  }
  document.execCommand('fontSize', false, '7');
  el.querySelectorAll('font[size="7"]').forEach((font) => {
    const span = document.createElement('span');
    span.style[cssProp] = cssValue;
    while (font.firstChild) span.appendChild(font.firstChild);
    font.replaceWith(span);
  });

  savedSelection = null;
  const b = blocksState.find((x) => x.id === blockId);
  if (b) b.html = el.innerHTML;
}

async function handleFontUpload(blockId, file) {
  const fd = new FormData();
  fd.append('font', file);
  try {
    const res = await fetch('/api/posts/upload-font', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Не удалось загрузить шрифт');
      return;
    }
    fontsState.push(data);
    injectFontFace(data);
    applyInlineStyleToSelection(blockId, 'fontFamily', `"${data.family}"`);
  } catch (err) {
    alert('Ошибка соединения с сервером');
  }
}

// ===== Блоки статьи =====
// ===== Rich-text тулбар для абзацев =====
const RTE_BUTTONS = [
  { cmd: 'bold', label: '<b>Ж</b>', title: 'Жирный' },
  { cmd: 'italic', label: '<i>К</i>', title: 'Курсив' },
  { cmd: 'underline', label: '<u>Ч</u>', title: 'Подчёркнутый' },
  { cmd: 'strikeThrough', label: '<s>З</s>', title: 'Зачёркнутый' },
  { cmd: 'insertUnorderedList', label: '•', title: 'Маркированный список' },
  { cmd: 'insertOrderedList', label: '1.', title: 'Нумерованный список' },
  { cmd: 'link', label: '🔗', title: 'Вставить ссылку' },
];

function runRteCommand(cmd, blockId) {
  const el = blocksEditor.querySelector(`.rte-editable[data-id="${blockId}"]`);
  if (!el) return;
  el.focus();

  if (cmd === 'link') {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      alert('Сначала выделите текст, который должен стать ссылкой.');
      return;
    }
    const url = window.prompt('Адрес ссылки (например https://example.com):', 'https://');
    if (!url) return;
    document.execCommand('createLink', false, url);
  } else {
    document.execCommand(cmd, false, null);
  }

  const b = blocksState.find((x) => x.id === blockId);
  if (b) b.html = el.innerHTML;
}

function renderBlocks() {
  if (!blocksState.length) {
    blocksEditor.innerHTML = '<p class="blocks-empty">Пока пусто — добавьте абзац или фото ниже.</p>';
    return;
  }

  blocksEditor.innerHTML = blocksState
    .map((block, i) => {
      const moveUp = i > 0;
      const moveDown = i < blocksState.length - 1;
      const controls = `
        <div class="block-controls">
          <button type="button" class="icon-btn move-up" data-id="${block.id}" ${moveUp ? '' : 'disabled'} title="Переместить вверх">&#11014;</button>
          <button type="button" class="icon-btn move-down" data-id="${block.id}" ${moveDown ? '' : 'disabled'} title="Переместить вниз">&#11015;</button>
          <button type="button" class="icon-btn remove-block" data-id="${block.id}" title="Удалить">✕</button>
        </div>`;

      if (block.type === 'paragraph') {
        return `
        <div class="block-card" data-id="${block.id}" data-type="paragraph">
          <div class="block-card-head">
            <span class="block-label">Абзац текста</span>
            ${controls}
          </div>
          <div class="rte-toolbar">
            ${RTE_BUTTONS.map((b) => `<button type="button" class="rte-btn" data-cmd="${b.cmd}" data-id="${block.id}" title="${b.title}">${b.label}</button>`).join('')}
            <select class="rte-size-select" data-id="${block.id}" title="Размер текста">
              <option value="">Размер…</option>
              ${FONT_SIZE_OPTIONS.map((s) => `<option value="${s}px">${s}px</option>`).join('')}
            </select>
            <label class="rte-font-upload" title="Загрузить свой шрифт и применить к выделению">
              + Шрифт
              <input type="file" accept=".ttf,.otf,.woff,.woff2" class="rte-font-input" data-id="${block.id}">
            </label>
          </div>
          <div class="rte-editable" contenteditable="true" data-id="${block.id}" data-placeholder="Текст абзаца...">${block.html}</div>
        </div>`;
      }

      // image block
      const isPreview = previewState.mode === 'block' && previewState.blockId === block.id;
      const hasImage = !!block.previewUrl;
      return `
        <div class="block-card" data-id="${block.id}" data-type="image">
          <div class="block-card-head">
            <span class="block-label">Фото</span>
            ${controls}
          </div>
          <div class="block-image-body">
            <div class="block-image-preview ${hasImage ? '' : 'empty'}">
              ${hasImage ? `<img src="${block.previewUrl}" alt="">` : '<span>Нет фото</span>'}
            </div>
            <div class="block-image-fields">
              <label class="file-label">
                ${hasImage ? 'Заменить фото' : 'Выбрать фото'}
                <input type="file" accept="image/*" class="block-image-file" data-id="${block.id}">
              </label>
              <input type="text" class="block-image-caption" data-id="${block.id}" placeholder="Подпись под фото (необязательно)" value="${escapeHtml(block.caption)}">
              <button type="button" class="btn-mini set-preview-btn ${isPreview ? 'is-active' : ''}" data-id="${block.id}" ${hasImage ? '' : 'disabled'}>
                ${isPreview ? 'Это превью карточки' : 'Добавить как превью'}
              </button>
            </div>
          </div>
        </div>`;
    })
    .join('');

  wireBlockEvents();
}

function wireBlockEvents() {
  blocksEditor.querySelectorAll('.rte-editable').forEach((el) => {
    el.addEventListener('input', () => {
      const b = blocksState.find((x) => x.id === el.dataset.id);
      if (b) b.html = el.innerHTML;
    });
  });

  blocksEditor.querySelectorAll('.rte-btn').forEach((btn) => {
    // Не даём кнопке перехватить фокус/выделение у contenteditable
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => runRteCommand(btn.dataset.cmd, btn.dataset.id));
  });

  blocksEditor.querySelectorAll('.rte-size-select').forEach((select) => {
    select.addEventListener('change', () => {
      if (!select.value) return;
      applyInlineStyleToSelection(select.dataset.id, 'fontSize', select.value);
      select.value = '';
    });
  });

  blocksEditor.querySelectorAll('.rte-font-input').forEach((input) => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      handleFontUpload(input.dataset.id, file).finally(() => { input.value = ''; });
    });
  });

  blocksEditor.querySelectorAll('.block-image-caption').forEach((el) => {
    el.addEventListener('input', () => {
      const b = blocksState.find((x) => x.id === el.dataset.id);
      if (b) b.caption = el.value;
    });
  });

  blocksEditor.querySelectorAll('.block-image-file').forEach((el) => {
    el.addEventListener('change', () => {
      const file = el.files[0];
      if (!file) return;
      const b = blocksState.find((x) => x.id === el.dataset.id);
      if (!b) return;
      b.file = file;
      b.previewUrl = URL.createObjectURL(file);
      renderBlocks();
      // если это фото сейчас выбрано как превью — обновим превью-блок тоже
      if (previewState.mode === 'block' && previewState.blockId === b.id) renderPreviewBox();
    });
  });

  blocksEditor.querySelectorAll('.set-preview-btn').forEach((el) => {
    el.addEventListener('click', () => setPreviewFromBlock(el.dataset.id));
  });

  blocksEditor.querySelectorAll('.move-up').forEach((el) => {
    el.addEventListener('click', () => moveBlock(el.dataset.id, -1));
  });
  blocksEditor.querySelectorAll('.move-down').forEach((el) => {
    el.addEventListener('click', () => moveBlock(el.dataset.id, 1));
  });
  blocksEditor.querySelectorAll('.remove-block').forEach((el) => {
    el.addEventListener('click', () => removeBlock(el.dataset.id));
  });
}

function moveBlock(id, dir) {
  const i = blocksState.findIndex((b) => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= blocksState.length) return;
  [blocksState[i], blocksState[j]] = [blocksState[j], blocksState[i]];
  renderBlocks();
}

function removeBlock(id) {
  blocksState = blocksState.filter((b) => b.id !== id);
  if (previewState.mode === 'block' && previewState.blockId === id) {
    previewState = { mode: 'auto', file: null, existingSrc: null, blockId: null };
    renderPreviewBox();
  }
  renderBlocks();
}

addParagraphBtn.addEventListener('click', () => {
  blocksState.push(newParagraphBlock(''));
  renderBlocks();
});

addImageBtn.addEventListener('click', () => {
  blocksState.push(newImageBlock());
  renderBlocks();
});

// ===== Навигация дашборда (Новый пост / Посты / Настройки) =====
// Соответствие внутренних имён разделов и адресов в браузере.
const PAGE_TO_URL = {
  'new-post': '/admin/newpost',
  'posts': '/admin/posts',
  'authors': '/admin/authors',
  'portfolio': '/admin/portfolio',
  'site-settings': '/admin/settings'
};
const URL_TO_PAGE = {
  '/admin': 'posts',
  '/admin/': 'posts',
  '/admin/newpost': 'new-post',
  '/admin/posts': 'posts',
  '/admin/authors': 'authors',
  '/admin/portfolio': 'portfolio',
  '/admin/settings': 'site-settings'
};

// Ссылка редактирования конкретного поста: /admin/posts/edit/{id} — при
// открытии такого адреса напрямую (например, по сохранённой ссылке) должна
// открыться панель со страницей «Новый пост», заполненной этим постом.
const EDIT_URL_RE = /^\/admin\/posts\/edit\/([^/]+)\/?$/;

// Ссылка просмотра поста: /admin/posts/{id} — открывает окно предпросмотра
// поверх списка постов. Открывается кликом по строке поста в таблице, а также
// напрямую по сохранённой/скопированной ссылке.
const VIEW_URL_RE = /^\/admin\/posts\/([^/]+)\/?$/;

function postIdFromUrl() {
  const m = window.location.pathname.match(EDIT_URL_RE);
  return m ? decodeURIComponent(m[1]) : null;
}

function postIdFromViewUrl() {
  const m = window.location.pathname.match(VIEW_URL_RE);
  return m ? decodeURIComponent(m[1]) : null;
}

function editUrlForPost(id) {
  return `/admin/posts/edit/${encodeURIComponent(id)}`;
}

function viewUrlForPost(id) {
  return `/admin/posts/${encodeURIComponent(id)}`;
}

function pageFromUrl() {
  if (EDIT_URL_RE.test(window.location.pathname)) return 'new-post';
  return URL_TO_PAGE[window.location.pathname] || 'posts';
}

function goToPage(page, { updateUrl = true, url } = {}) {
  document.querySelectorAll('.dash-page').forEach((el) => {
    el.hidden = el.id !== `page-${page}`;
  });
  document.querySelectorAll('.dash-nav-child').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  dashSidebar.classList.remove('open');

  if (updateUrl) {
    const target = url || PAGE_TO_URL[page] || '/admin/posts';
    if (window.location.pathname !== target) {
      window.history.pushState({ page }, '', target);
    }
  }
}

document.querySelectorAll('.dash-nav-child').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.page === 'new-post') resetForm();
    if (btn.dataset.page === 'authors') loadAuthors();
    if (btn.dataset.page === 'portfolio') loadPortfolio();
    goToPage(btn.dataset.page);
  });
});

// Кнопки «назад»/«вперёд» браузера переключают раздел без перезагрузки страницы.
window.addEventListener('popstate', () => {
  if (adminScreen.hidden) return;
  const editId = postIdFromUrl();
  if (editId) {
    startEdit(editId, { updateUrl: false });
    return;
  }
  const viewId = postIdFromViewUrl();
  if (viewId) {
    openPostView(viewId, { updateUrl: false });
    return;
  }
  previewModal.hidden = true;
  goToPage(pageFromUrl(), { updateUrl: false });
});

dashboardsToggle.addEventListener('click', () => {
  const expanded = dashboardsToggle.getAttribute('aria-expanded') === 'true';
  dashboardsToggle.setAttribute('aria-expanded', String(!expanded));
  dashboardsChildren.hidden = expanded;
});

sidebarToggle.addEventListener('click', () => dashSidebar.classList.toggle('open'));

// ===== Сворачивание сайдбара (десктоп). По умолчанию сайдбар всегда развёрнут
// — состояние не сохраняется, при каждой загрузке страницы он раскрыт. =====
sidebarCollapseToggle.addEventListener('click', () => {
  const collapsed = dashLayout.classList.toggle('sidebar-collapsed');
  sidebarCollapseToggle.title = collapsed ? 'Развернуть меню' : 'Свернуть меню';
  sidebarCollapseToggle.setAttribute('aria-label', sidebarCollapseToggle.title);
});

// ===== Проверка сессии при загрузке =====
// Сервер уже не отдаёт эту страницу без валидной сессии (см. server.js),
// но сессия может истечь прямо во время работы (например, страница была
// открыта дольше 8 часов) — тогда просто уводим на страницу входа.
async function checkAuth() {
  const res = await fetch('/api/auth/status');
  const data = await res.json();
  if (data.isAdmin) {
    showAdmin();
  } else {
    window.location.href = '/admin/auth';
  }
}

function showAdmin() {
  adminScreen.hidden = false;
  resetForm();
  goToPage(pageFromUrl(), { updateUrl: false });
  loadAuthorsForSelect().then(() => {
    if (pageFromUrl() === 'authors') loadAuthors();
  });
  loadPosts().then(() => {
    const editId = postIdFromUrl();
    if (editId) {
      startEdit(editId, { updateUrl: false });
      return;
    }
    const viewId = postIdFromViewUrl();
    if (viewId) openPostView(viewId, { updateUrl: false });
  });
  loadSiteContent();
}

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/auth';
});

// ===== Список постов =====
// Иконки для карточек статистики: посты — как раньше, а посещения/просмотры —
// свои значки, чтобы визуально отличать трафик от контентных метрик.
const STAT_ICONS = {
  default: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>',
  visits: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  views: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><path d="M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z"/></svg>'
};

// analytics — сводка трекера посещений (см. loadAnalytics), необязательна:
// пока она не загрузилась, карточки 2 и 3 показывают прочерк.
function renderStats(posts, analytics) {
  const total = posts.length;
  const latest = posts[0] ? formatDate(posts[0].created_at) : '—';

  const totalVisits = analytics ? analytics.totalVisits : null;
  const totalPostViews = analytics ? analytics.totalPostViews : null;
  const visitsToday = analytics ? analytics.visitsToday : null;

  const cards = [
    { label: 'Всего постов', value: total, foot: 'Опубликовано на сайте', icon: 'default' },
    {
      label: 'Посещения сайта',
      value: totalVisits === null ? '—' : totalVisits,
      foot: visitsToday === null ? 'Всего визитов' : `Сегодня: ${visitsToday}`,
      icon: 'visits'
    },
    {
      label: 'Просмотры постов',
      value: totalPostViews === null ? '—' : totalPostViews,
      foot: 'Суммарно по всем постам',
      icon: 'views'
    },
    { label: 'Последний пост', value: latest, foot: total ? 'Дата публикации' : 'Постов пока нет', icon: 'default' }
  ];

  statCards.innerHTML = cards
    .map(
      (c) => `
    <div class="stat-card">
      <div class="stat-card-top">
        <div class="stat-card-icon">
          ${STAT_ICONS[c.icon] || STAT_ICONS.default}
        </div>
        <div>
          <div class="stat-card-label">${c.label}</div>
          <div class="stat-card-value">${c.value}</div>
        </div>
      </div>
      <div class="stat-card-foot"><span>${c.foot}</span></div>
    </div>`
    )
    .join('');
}

// Загружает сводку трекера посещений и перерисовывает карточки 2-3,
// мини-график за 7 дней и список популярных постов. Не блокирует
// остальную панель — если запрос не удался, просто оставляем прочерки.
async function loadAnalytics(posts) {
  try {
    const res = await fetch('/api/analytics/summary');
    if (!res.ok) throw new Error('analytics request failed');
    const analytics = await res.json();
    renderStats(posts, analytics);
    renderAnalyticsChart(analytics.last7Days || []);
    renderAnalyticsTopPosts(analytics.topPosts || []);
    analyticsUniqueVisitors.textContent = `Уникальных посетителей: ${analytics.uniqueVisitors}`;
  } catch (err) {
    renderAnalyticsChart([]);
    analyticsTopPosts.innerHTML = '<p class="muted">Не удалось загрузить статистику.</p>';
  }
}

function weekdayShort(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('ru-RU', { weekday: 'short' });
}

function renderAnalyticsChart(days) {
  if (!days.length) {
    analyticsChart.innerHTML = '<p class="muted">Пока нет данных о посещениях.</p>';
    return;
  }
  const max = Math.max(1, ...days.map((d) => d.visits));
  analyticsChart.innerHTML = days
    .map((d) => {
      const heightPct = Math.round((d.visits / max) * 100);
      return `
      <div class="analytics-bar-col" title="${formatDate(d.date)}: ${d.visits}">
        <div class="analytics-bar-value">${d.visits}</div>
        <div class="analytics-bar" style="height:${Math.max(heightPct, d.visits ? 6 : 2)}%"></div>
        <div class="analytics-bar-label">${weekdayShort(d.date)}</div>
      </div>`;
    })
    .join('');
}

function renderAnalyticsTopPosts(topPosts) {
  if (!topPosts.length) {
    analyticsTopPosts.innerHTML = '<p class="muted">Пока нет просмотров постов.</p>';
    return;
  }
  analyticsTopPosts.innerHTML = topPosts
    .map(
      (p, i) => `
    <div class="analytics-top-row">
      <span class="analytics-top-rank">${i + 1}</span>
      <span class="analytics-top-title">${escapeHtml(p.title)}</span>
      <span class="analytics-top-views">${p.views}</span>
    </div>`
    )
    .join('');
}

const STATUS_LABELS = { published: 'Опубликовано', draft: 'Черновик', scheduled: 'Отложено' };

function statusBadgeHtml(post) {
  // effectiveStatus — «наступивший» отложенный пост показываем как опубликованный,
  // но с подсказкой в title, что публикация на самом деле была отложенной.
  const shown = post.effectiveStatus || post.status || 'published';
  const label = STATUS_LABELS[shown] || shown;
  const title = post.status === 'scheduled' && shown === 'published'
    ? `Опубликовано автоматически по расписанию: ${formatDate(post.publishedAt)}`
    : post.status === 'scheduled'
    ? `Запланировано на ${formatDate(post.publishedAt)}`
    : '';
  return `<span class="status-badge status-${shown}" title="${title}">${label}</span>`;
}

function renderPostsTable(posts) {
  if (!posts.length) {
    postsList.innerHTML = '<p style="color:var(--text-muted); padding:12px;">Ничего не найдено.</p>';
    return;
  }
  postsList.innerHTML = posts
    .map(
      (post) => `
    <div class="post-row" data-id="${post.id}">
      <div class="thumb-mini">${post.previewImage ? `<img src="${post.previewImage}" alt="">` : ''}</div>
      <div class="info">
        <h3>${escapeHtml(post.title)}</h3>
        <span class="date">${formatDate(post.publishedAt || post.created_at)}</span>
        ${statusBadgeHtml(post)}
        ${post.author ? `<span class="post-author-mini">${post.author.photo ? `<img src="${post.author.photo}" alt="">` : ''}${escapeHtml(post.author.name)}</span>` : ''}
        <span class="post-views-badge" title="Просмотров">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><path d="M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z"/></svg>
          ${post.views || 0}
        </span>
        ${Array.isArray(post.tags) && post.tags.length ? `<div class="card-tags">${post.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="actions">
        <button class="edit-btn" data-id="${post.id}">Редактировать</button>
        <button class="delete-btn" data-id="${post.id}">Удалить</button>
      </div>
    </div>`
    )
    .join('');

  postsList.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      startEdit(btn.dataset.id);
    });
  });
  postsList.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePost(btn.dataset.id);
    });
  });
  // Клик по самой строке (не по кнопкам) открывает просмотр поста по ссылке
  // /admin/posts/{id}.
  postsList.querySelectorAll('.post-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openPostView(row.dataset.id);
    });
  });
}

function applySearchFilter() {
  const q = postSearch.value.trim().toLowerCase();
  const all = window.__allPosts || [];
  const filtered = q
    ? all.filter((p) => p.title.toLowerCase().includes(q) || p.excerpt.toLowerCase().includes(q))
    : all;
  renderPostsTable(filtered);
}

postSearch.addEventListener('input', applySearchFilter);

async function loadPosts() {
  postsList.innerHTML = '<p style="color:var(--text-muted); padding:12px;">Загрузка…</p>';
  try {
    const res = await fetch('/api/posts');
    const posts = await res.json();
    window.__allPosts = posts;
    renderStats(posts, null);
    loadAnalytics(posts);
    if (!posts.length) {
      postsList.innerHTML = '<p style="color:var(--text-muted); padding:12px;">Пока нет постов — создайте первый через раздел «Новый пост».</p>';
      return;
    }
    applySearchFilter();
  } catch (err) {
    postsList.innerHTML = '<p style="color:var(--text-muted); padding:12px;">Не удалось загрузить посты.</p>';
  }

  // Подсказки тегов при вводе — не блокируем основную загрузку постов, если упадёт
  fetch('/api/posts/tags/all')
    .then((r) => r.json())
    .then((tags) => {
      if (!Array.isArray(tags)) return;
      tagSuggestions.innerHTML = tags.map(({ tag }) => `<option value="${escapeHtml(tag)}">`).join('');
    })
    .catch(() => {});
}

// ===== Редактирование =====
function startEdit(id, { updateUrl = true } = {}) {
  const post = (window.__allPosts || []).find((p) => String(p.id) === String(id));
  if (!post) {
    if (!updateUrl) {
      // Пришли по прямой ссылке /admin/posts/edit/{id}, а такого поста нет —
      // остаёмся на списке постов вместо пустой формы.
      goToPage('posts', { updateUrl: true });
    }
    return;
  }

  postForm.elements.id.value = post.id;
  postForm.elements.title.value = post.title;
  postForm.elements.excerpt.value = post.excerpt;
  postForm.elements.tags.value = (post.tags || []).join(', ');
  if (slugInput) {
    slugInput.value = post.slug || '';
    slugTouchedByUser = true; // не перезаписываем сохранённый адрес при правке заголовка
  }
  postForm.elements.seoTitle.value = post.seoTitle || '';
  postForm.elements.seoDescription.value = post.seoDescription || '';
  postForm.elements.h1.value = post.h1 || '';

  publishedAtInput.value = post.status === 'scheduled' ? isoToDatetimeLocal(post.publishedAt) : '';

  if (post.authorId && authorsState.some((a) => a.id === post.authorId)) {
    authorSelect.value = post.authorId;
  } else if (authorsState.length) {
    authorSelect.value = authorsState[0].id;
  }
  updateAuthorProfileLink();

  blocksState = (post.blocks || []).map((b) => {
    if (b.type === 'image') return newImageBlock({ existingSrc: b.src, caption: b.caption });
    // Новые посты хранят html; старые (до rich-text редактора) — обычный текст
    const html = b.html !== undefined ? b.html : escapeHtml(b.text || '');
    return newParagraphBlock(html);
  });

  // Подключаем уже использованные в статье пользовательские шрифты, чтобы
  // текст с ними корректно отображался в редакторе и в превью.
  fontsState = Array.isArray(post.customFonts) ? post.customFonts.slice() : [];
  resetFontFaceStyleTag();
  fontsState.forEach(injectFontFace);

  // Определяем состояние превью: совпадает с одним из фото статьи, отдельное фото, или авто
  previewState = { mode: 'auto', file: null, existingSrc: null, blockId: null };
  if (post.previewImage) {
    const match = blocksState.find((b) => b.type === 'image' && b.existingSrc === post.previewImage);
    if (match) {
      previewState = { mode: 'block', blockId: match.id, file: null, existingSrc: null };
    } else {
      previewState = { mode: 'own', file: null, existingSrc: post.previewImage, blockId: null };
    }
  }

  renderBlocks();
  renderPreviewBox();

  formTitle.textContent = `Редактирование: ${post.title}`;
  resetFormBtn.hidden = false;
  formError.hidden = true;
  goToPage('new-post', { updateUrl, url: editUrlForPost(post.id) });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

resetFormBtn.addEventListener('click', () => {
  resetForm();
  goToPage('new-post');
});

function resetForm() {
  postForm.reset();
  postForm.elements.id.value = '';
  slugTouchedByUser = false;
  blocksState = [newParagraphBlock('')];
  previewState = { mode: 'auto', file: null, existingSrc: null, blockId: null };
  fontsState = [];
  resetFontFaceStyleTag();
  renderBlocks();
  renderPreviewBox();
  publishedAtInput.value = '';
  if (authorsState.length) authorSelect.value = authorsState[0].id;
  updateAuthorProfileLink();
  formTitle.textContent = 'Новый пост';
  resetFormBtn.hidden = true;
  formError.hidden = true;
}

// ===== Превью поста в модальном окне =====
function buildPreviewArticleHtml() {
  const title = postForm.elements.title.value.trim() || 'Без названия';
  const dateStr = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  const blocksHtml = blocksState
    .map((b) => {
      if (b.type === 'paragraph') {
        const html = (b.html || '').trim();
        return html ? `<p>${html}</p>` : '';
      }
      if (b.type === 'image' && b.previewUrl) {
        return `
          <figure class="post-figure">
            <img src="${b.previewUrl}" alt="">
            ${b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : ''}
          </figure>`;
      }
      return '';
    })
    .join('');

  return `
    <span class="preview-article-date">${dateStr}</span>
    <h1>${escapeHtml(title)}</h1>
    <div class="preview-article-content">
      ${blocksHtml || '<p style="color:var(--text-faint)">Пока нет контента для отображения — добавьте абзацы или фото.</p>'}
    </div>
  `;
}

function openPreviewModal() {
  previewArticle.innerHTML = buildPreviewArticleHtml();
  previewModal.hidden = false;
}
function closePreviewModal() {
  previewModal.hidden = true;
  // Если окно было открыто по ссылке просмотра поста — возвращаемся на список.
  if (VIEW_URL_RE.test(window.location.pathname)) {
    window.history.pushState({}, '', '/admin/posts');
  }
}

// ===== Просмотр сохранённого поста по ссылке /admin/posts/{id} =====
// В отличие от buildPreviewArticleHtml (черновик из формы редактирования),
// здесь статья собирается из уже сохранённых данных поста.
function buildArticleHtmlFromPost(post) {
  const dateStr = formatDate(post.created_at);

  const blocksHtml = (post.blocks || [])
    .map((b) => {
      if (b.type === 'paragraph') {
        const html = (b.html !== undefined ? b.html : escapeHtml(b.text || '')).trim();
        return html ? `<p>${html}</p>` : '';
      }
      if (b.type === 'image' && b.src) {
        return `
          <figure class="post-figure">
            <img src="${b.src}" alt="">
            ${b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : ''}
          </figure>`;
      }
      return '';
    })
    .join('');

  return `
    <span class="preview-article-date">${dateStr}</span>
    <h1>${escapeHtml(post.title)}</h1>
    <div class="preview-article-content">
      ${blocksHtml || '<p style="color:var(--text-faint)">У этого поста пока нет содержимого.</p>'}
    </div>
  `;
}

function openPostView(id, { updateUrl = true } = {}) {
  const post = (window.__allPosts || []).find((p) => String(p.id) === String(id));
  if (!post) {
    // Пришли по прямой ссылке на несуществующий пост — остаёмся на списке.
    if (!updateUrl) goToPage('posts', { updateUrl: true });
    return;
  }

  (post.customFonts || []).forEach(injectFontFace);
  previewArticle.innerHTML = buildArticleHtmlFromPost(post);
  previewModal.hidden = false;

  if (updateUrl && window.location.pathname !== viewUrlForPost(post.id)) {
    window.history.pushState({ viewId: post.id }, '', viewUrlForPost(post.id));
  }
}

previewPostBtn.addEventListener('click', openPreviewModal);
closePreviewBtn.addEventListener('click', closePreviewModal);
previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) closePreviewModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !previewModal.hidden) closePreviewModal();
});

// ===== Создание / сохранение =====
async function savePost(status) {
  formError.hidden = true;

  const id = postForm.elements.id.value;
  const formData = new FormData();
  formData.append('title', postForm.elements.title.value);
  formData.append('excerpt', postForm.elements.excerpt.value);
  formData.append('tags', postForm.elements.tags.value);
  formData.append('slug', slugInput ? slugInput.value : '');
  formData.append('seoTitle', postForm.elements.seoTitle.value);
  formData.append('seoDescription', postForm.elements.seoDescription.value);
  formData.append('h1', postForm.elements.h1.value);
  formData.append('status', status);
  if (status === 'scheduled') {
    // datetime-local -> ISO (сервер сам проверит, что дата в будущем)
    const localValue = publishedAtInput.value;
    formData.append('publishedAt', localValue ? new Date(localValue).toISOString() : '');
  }
  formData.append('authorId', authorSelect.value || '');

  if (previewState.mode === 'own') {
    if (previewState.file) formData.append('previewUpload', previewState.file);
    else if (previewState.existingSrc) formData.append('previewExistingSrc', previewState.existingSrc);
  } else if (previewState.mode === 'block' && previewState.blockId) {
    formData.append('previewId', previewState.blockId);
  }

  const blocksPayload = blocksState.map((b) => {
    if (b.type === 'paragraph') return { type: 'paragraph', html: b.html };
    return { type: 'image', id: b.id, existingSrc: b.existingSrc, caption: b.caption };
  });
  formData.append('blocks', JSON.stringify(blocksPayload));
  formData.append('customFonts', JSON.stringify(fontsState));

  blocksState.forEach((b) => {
    if (b.type === 'image' && b.file) {
      formData.append(`img_${b.id}`, b.file);
    }
  });

  const url = id ? `/api/posts/${id}` : '/api/posts';

  try {
    const res = await fetch(url, {
      method: id ? 'PUT' : 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      formError.textContent = data.error || 'Не удалось сохранить пост';
      formError.hidden = false;
      return false;
    }
    resetForm();
    loadPosts();
    goToPage('posts');
    return true;
  } catch (err) {
    formError.textContent = 'Ошибка соединения с сервером';
    formError.hidden = false;
    return false;
  }
}

postForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = e.submitter && e.submitter.name === 'statusAction' ? e.submitter.value : 'published';
  savePost(status);
});

// ===== Модалка «Отложенная публикация» =====
function openScheduleModal() {
  scheduleModalError.hidden = true;
  scheduleModal.hidden = false;
  publishedAtInput.focus();
}
function closeScheduleModal() {
  scheduleModal.hidden = true;
}
openScheduleModalBtn.addEventListener('click', openScheduleModal);
closeScheduleModalBtn.addEventListener('click', closeScheduleModal);
cancelScheduleBtn.addEventListener('click', closeScheduleModal);
scheduleModal.addEventListener('click', (e) => {
  if (e.target === scheduleModal) closeScheduleModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !scheduleModal.hidden) closeScheduleModal();
});
confirmScheduleBtn.addEventListener('click', async () => {
  if (!publishedAtInput.value) {
    scheduleModalError.textContent = 'Укажите дату и время публикации';
    scheduleModalError.hidden = false;
    return;
  }
  scheduleModalError.hidden = true;
  confirmScheduleBtn.disabled = true;
  const ok = await savePost('scheduled');
  confirmScheduleBtn.disabled = false;
  if (ok) closeScheduleModal();
});

// ===== Удаление =====
async function deletePost(id) {
  const post = (window.__allPosts || []).find((p) => String(p.id) === String(id));
  const confirmed = window.confirm(`Удалить пост «${post ? post.title : ''}»? Это действие необратимо.`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Не удалось удалить пост');
      return;
    }
    loadPosts();
    if (postForm.elements.id.value === String(id)) resetForm();
  } catch (err) {
    alert('Ошибка соединения с сервером');
  }
}

// ===== Страница «Авторы» =====
let authorPhotoState = { file: null, existingSrc: null };

function renderAuthorPhotoBox() {
  const url = authorPhotoState.file ? URL.createObjectURL(authorPhotoState.file) : authorPhotoState.existingSrc;

  if (!url) {
    authorPhotoBox.innerHTML = `
      <div class="preview-box-empty">
        <span>Фото не выбрано</span>
        <label class="file-label">
          Выбрать фото
          <input type="file" accept="image/*" id="authorPhotoFileInput">
        </label>
      </div>`;
  } else {
    authorPhotoBox.innerHTML = `
      <div class="preview-box-filled">
        <div class="preview-thumb"><img src="${url}" alt=""></div>
        <div class="preview-actions">
          <label class="file-label">
            Заменить фото
            <input type="file" accept="image/*" id="authorPhotoFileInput">
          </label>
          <button type="button" id="clearAuthorPhotoBtn" class="icon-btn" title="Убрать фото">Убрать фото</button>
        </div>
      </div>`;
  }

  const fileInput = document.getElementById('authorPhotoFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      authorPhotoState = { file, existingSrc: null };
      renderAuthorPhotoBox();
    });
  }
  const clearBtn = document.getElementById('clearAuthorPhotoBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      authorPhotoState = { file: null, existingSrc: null };
      authorPhotoRemoved = true;
      renderAuthorPhotoBox();
    });
  }
}

let authorPhotoRemoved = false;
let authorsAdminState = [];

function renderAuthorsTable(authors) {
  if (!authors.length) {
    authorsList.innerHTML = '<p style="color:var(--text-muted); padding:12px;">Пока нет авторов.</p>';
    return;
  }
  authorsList.innerHTML = authors
    .map(
      (a) => `
    <div class="post-row" data-id="${a.id}">
      <div class="thumb-mini">${a.photo ? `<img src="${a.photo}" alt="">` : ''}</div>
      <div class="info">
        <h3>${escapeHtml(a.name)}</h3>
        <span class="date">${a.role ? escapeHtml(a.role) : '/author/' + escapeHtml(a.slug)}</span>
        <span class="post-views-badge" title="Опубликованных статей">${a.postCount || 0} статей</span>
      </div>
      <div class="actions">
        <a href="/author/${encodeURIComponent(a.slug)}" target="_blank" rel="noopener" class="btn-mini">Профиль ↗</a>
        <button class="edit-btn" data-id="${a.id}">Редактировать</button>
        <button class="delete-btn" data-id="${a.id}">Удалить</button>
      </div>
    </div>`
    )
    .join('');

  authorsList.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => startEditAuthor(btn.dataset.id));
  });
  authorsList.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteAuthor(btn.dataset.id));
  });
}

async function loadAuthors() {
  authorsList.innerHTML = '<p style="color:var(--text-muted); padding:12px;">Загрузка…</p>';
  try {
    const res = await fetch('/api/authors');
    authorsAdminState = await res.json();
    renderAuthorsTable(authorsAdminState);
  } catch (err) {
    authorsList.innerHTML = '<p style="color:var(--text-muted); padding:12px;">Не удалось загрузить авторов.</p>';
  }
}

function resetAuthorForm() {
  authorForm.reset();
  authorForm.elements.id.value = '';
  authorPhotoState = { file: null, existingSrc: null };
  authorPhotoRemoved = false;
  renderAuthorPhotoBox();
  authorFormTitle.textContent = 'Новый автор';
  resetAuthorFormBtn.hidden = true;
  authorFormError.hidden = true;
}

function startEditAuthor(id) {
  const author = authorsAdminState.find((a) => String(a.id) === String(id));
  if (!author) return;
  authorForm.elements.id.value = author.id;
  authorNameInput.value = author.name;
  authorSlugInput.value = author.slug;
  authorForm.elements.role.value = author.role || '';
  authorForm.elements.bio.value = author.bio || '';
  authorForm.elements.socialUrl.value = author.socialUrl || '';
  authorPhotoState = { file: null, existingSrc: author.photo };
  authorPhotoRemoved = false;
  renderAuthorPhotoBox();
  authorFormTitle.textContent = `Редактирование: ${author.name}`;
  resetAuthorFormBtn.hidden = false;
  authorFormError.hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

resetAuthorFormBtn.addEventListener('click', resetAuthorForm);

authorForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authorFormError.hidden = true;

  const id = authorForm.elements.id.value;
  const formData = new FormData();
  formData.append('name', authorNameInput.value);
  formData.append('slug', authorSlugInput.value);
  formData.append('role', authorForm.elements.role.value);
  formData.append('bio', authorForm.elements.bio.value);
  formData.append('socialUrl', authorForm.elements.socialUrl.value);
  if (authorPhotoState.file) formData.append('photo', authorPhotoState.file);
  if (authorPhotoRemoved) formData.append('removePhoto', '1');

  const url = id ? `/api/authors/${id}` : '/api/authors';
  try {
    const res = await fetch(url, { method: id ? 'PUT' : 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) {
      authorFormError.textContent = data.error || 'Не удалось сохранить автора';
      authorFormError.hidden = false;
      return;
    }
    resetAuthorForm();
    await loadAuthors();
    await loadAuthorsForSelect();
  } catch (err) {
    authorFormError.textContent = 'Ошибка соединения с сервером';
    authorFormError.hidden = false;
  }
});

async function deleteAuthor(id) {
  const author = authorsAdminState.find((a) => String(a.id) === String(id));
  const confirmed = window.confirm(
    `Удалить автора «${author ? author.name : ''}»? Его статьи будут переданы другому автору.`
  );
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/authors/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Не удалось удалить автора');
      return;
    }
    await loadAuthors();
    await loadAuthorsForSelect();
    if (authorForm.elements.id.value === String(id)) resetAuthorForm();
    loadPosts();
  } catch (err) {
    alert('Ошибка соединения с сервером');
  }
}

renderAuthorPhotoBox();

// ===== Страница «Портфолио» =====
let projectCoverState = { file: null, existingSrc: null };
let projectCoverRemoved = false;
// Галерея хранится как keptUrls (уже сохранённые на сервере фото, которые
// оставляем) + newFiles (только что выбранные, ещё не загруженные файлы).
let projectGalleryState = { keptUrls: [], newFiles: [] };
let portfolioAdminState = [];

function renderProjectCoverBox() {
  const url = projectCoverState.file ? URL.createObjectURL(projectCoverState.file) : projectCoverState.existingSrc;

  if (!url) {
    projectCoverBox.innerHTML = `
      <div class="preview-box-empty">
        <span>Обложка не выбрана</span>
        <label class="file-label">
          Выбрать фото
          <input type="file" accept="image/*" id="projectCoverFileInput">
        </label>
      </div>`;
  } else {
    projectCoverBox.innerHTML = `
      <div class="preview-box-filled">
        <div class="preview-thumb"><img src="${url}" alt=""></div>
        <div class="preview-actions">
          <label class="file-label">
            Заменить фото
            <input type="file" accept="image/*" id="projectCoverFileInput">
          </label>
          <button type="button" id="clearProjectCoverBtn" class="icon-btn" title="Убрать фото">Убрать фото</button>
        </div>
      </div>`;
  }

  const fileInput = document.getElementById('projectCoverFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      projectCoverState = { file, existingSrc: null };
      renderProjectCoverBox();
    });
  }
  const clearBtn = document.getElementById('clearProjectCoverBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      projectCoverState = { file: null, existingSrc: null };
      projectCoverRemoved = true;
      renderProjectCoverBox();
    });
  }
}

// Галерея рисуется как набор миниатюр (сохранённых + только что выбранных)
// с кнопкой удаления на каждой — в отличие от обложки, тут нет предела в 1 фото.
function renderProjectGalleryBox() {
  const keptThumbs = projectGalleryState.keptUrls.map(
    (url, i) => `
    <div class="preview-thumb" style="width:96px; height:96px; position:relative;" data-kept-index="${i}">
      <img src="${url}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:var(--radius-sm);">
      <button type="button" class="icon-btn remove-gallery-kept" data-index="${i}" title="Убрать" style="position:absolute; top:4px; right:4px;">✕</button>
    </div>`
  );
  const newThumbs = projectGalleryState.newFiles.map(
    (file, i) => `
    <div class="preview-thumb" style="width:96px; height:96px; position:relative;" data-new-index="${i}">
      <img src="${URL.createObjectURL(file)}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:var(--radius-sm);">
      <button type="button" class="icon-btn remove-gallery-new" data-index="${i}" title="Убрать" style="position:absolute; top:4px; right:4px;">✕</button>
    </div>`
  );

  projectGalleryBox.innerHTML =
    keptThumbs.join('') + newThumbs.join('') ||
    '<span style="color:var(--text-muted); font-size:13.5px;">Фото галереи ещё не добавлены</span>';

  projectGalleryBox.querySelectorAll('.remove-gallery-kept').forEach((btn) => {
    btn.addEventListener('click', () => {
      projectGalleryState.keptUrls.splice(Number(btn.dataset.index), 1);
      renderProjectGalleryBox();
    });
  });
  projectGalleryBox.querySelectorAll('.remove-gallery-new').forEach((btn) => {
    btn.addEventListener('click', () => {
      projectGalleryState.newFiles.splice(Number(btn.dataset.index), 1);
      renderProjectGalleryBox();
    });
  });
}

projectGalleryFileInput.addEventListener('change', () => {
  projectGalleryState.newFiles.push(...Array.from(projectGalleryFileInput.files));
  projectGalleryFileInput.value = '';
  renderProjectGalleryBox();
});

function statusBadgeHtmlFor(status) {
  return status === 'draft'
    ? '<span class="status-badge status-draft">Черновик</span>'
    : '<span class="status-badge status-published">Опубликован</span>';
}

function renderPortfolioTable(projects) {
  if (!projects.length) {
    portfolioAdminList.innerHTML = '<p style="color:var(--text-muted); padding:12px;">Пока нет проектов.</p>';
    return;
  }
  portfolioAdminList.innerHTML = projects
    .map(
      (p) => `
    <div class="post-row" data-id="${p.id}">
      <div class="thumb-mini">${p.coverImage ? `<img src="${p.coverImage}" alt="">` : ''}</div>
      <div class="info">
        <h3>${escapeHtml(p.title)}</h3>
        <span class="date">${p.category ? escapeHtml(p.category) + ' · ' : ''}${formatDate(p.updated_at)}</span>
        ${statusBadgeHtmlFor(p.status)}
      </div>
      <div class="actions">
        <a href="/portfolio/${encodeURIComponent(p.slug)}" target="_blank" rel="noopener" class="btn-mini">Открыть ↗</a>
        <button class="edit-btn" data-id="${p.id}">Редактировать</button>
        <button class="delete-btn" data-id="${p.id}">Удалить</button>
      </div>
    </div>`
    )
    .join('');

  portfolioAdminList.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => startEditProject(btn.dataset.id));
  });
  portfolioAdminList.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteProject(btn.dataset.id));
  });
}

async function loadPortfolio() {
  portfolioAdminList.innerHTML = '<p style="color:var(--text-muted); padding:12px;">Загрузка…</p>';
  try {
    const res = await fetch('/api/portfolio');
    portfolioAdminState = await res.json();
    renderPortfolioTable(portfolioAdminState);

    fetch('/api/portfolio/tags/all')
      .then((r) => r.json())
      .then((tags) => {
        projectTagSuggestions.innerHTML = tags.map(({ tag }) => `<option value="${escapeHtml(tag)}">`).join('');
      })
      .catch(() => {});
  } catch (err) {
    portfolioAdminList.innerHTML = '<p style="color:var(--text-muted); padding:12px;">Не удалось загрузить проекты.</p>';
  }
}

function resetProjectForm() {
  projectForm.reset();
  projectForm.elements.id.value = '';
  projectSlugTouchedByUser = false;
  projectCoverState = { file: null, existingSrc: null };
  projectCoverRemoved = false;
  projectGalleryState = { keptUrls: [], newFiles: [] };
  renderProjectCoverBox();
  renderProjectGalleryBox();
  projectFormTitle.textContent = 'Новый проект';
  resetProjectFormBtn.hidden = true;
  projectFormError.hidden = true;
}

function startEditProject(id) {
  const project = portfolioAdminState.find((p) => String(p.id) === String(id));
  if (!project) return;
  projectForm.elements.id.value = project.id;
  projectTitleInput.value = project.title;
  projectSlugInput.value = project.slug;
  projectSlugTouchedByUser = true;
  projectForm.elements.excerpt.value = project.excerpt || '';
  projectForm.elements.category.value = project.category || '';
  projectForm.elements.location.value = project.location || '';
  projectForm.elements.year.value = project.year || '';
  projectForm.elements.tags.value = (project.tags || []).join(', ');
  projectDescriptionInput.value = project.description || '';
  projectForm.elements.status.value = project.status || 'published';
  projectForm.elements.seoTitle.value = project.seoTitle || '';
  projectForm.elements.seoDescription.value = project.seoDescription || '';
  projectForm.elements.h1.value = project.h1 || '';

  projectCoverState = { file: null, existingSrc: project.coverImage };
  projectCoverRemoved = false;
  projectGalleryState = { keptUrls: [...(project.gallery || [])], newFiles: [] };
  renderProjectCoverBox();
  renderProjectGalleryBox();

  projectFormTitle.textContent = `Редактирование: ${project.title}`;
  resetProjectFormBtn.hidden = false;
  projectFormError.hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

resetProjectFormBtn.addEventListener('click', resetProjectForm);

projectForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  projectFormError.hidden = true;

  const id = projectForm.elements.id.value;
  const formData = new FormData();
  formData.append('title', projectTitleInput.value);
  formData.append('slug', projectSlugInput.value);
  formData.append('excerpt', projectForm.elements.excerpt.value);
  formData.append('category', projectForm.elements.category.value);
  formData.append('location', projectForm.elements.location.value);
  formData.append('year', projectForm.elements.year.value);
  formData.append('tags', projectForm.elements.tags.value);
  formData.append('description', projectDescriptionInput.value);
  formData.append('status', projectForm.elements.status.value);
  formData.append('seoTitle', projectForm.elements.seoTitle.value);
  formData.append('seoDescription', projectForm.elements.seoDescription.value);
  formData.append('h1', projectForm.elements.h1.value);

  if (projectCoverState.file) formData.append('cover', projectCoverState.file);
  if (projectCoverRemoved) formData.append('removeCover', '1');

  formData.append('galleryKept', JSON.stringify(projectGalleryState.keptUrls));
  projectGalleryState.newFiles.forEach((file) => formData.append('gallery', file));

  const url = id ? `/api/portfolio/${id}` : '/api/portfolio';
  try {
    const res = await fetch(url, { method: id ? 'PUT' : 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) {
      projectFormError.textContent = data.error || 'Не удалось сохранить проект';
      projectFormError.hidden = false;
      return;
    }
    resetProjectForm();
    await loadPortfolio();
  } catch (err) {
    projectFormError.textContent = 'Ошибка соединения с сервером';
    projectFormError.hidden = false;
  }
});

async function deleteProject(id) {
  const project = portfolioAdminState.find((p) => String(p.id) === String(id));
  const confirmed = window.confirm(`Удалить проект «${project ? project.title : ''}»? Действие необратимо.`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/portfolio/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Не удалось удалить проект');
      return;
    }
    await loadPortfolio();
    if (projectForm.elements.id.value === String(id)) resetProjectForm();
  } catch (err) {
    alert('Ошибка соединения с сервером');
  }
}

renderProjectCoverBox();
renderProjectGalleryBox();

// ===== Настройки сайта (герой / о нас / контакты) =====
let siteContentState = null;
let heroPhotoState = { file: null, existingSrc: null };
let statsState = [];
let valuesState = [];

function renderHeroPhotoBox() {
  const url = heroPhotoState.file ? URL.createObjectURL(heroPhotoState.file) : heroPhotoState.existingSrc;

  if (!url) {
    heroPhotoBox.innerHTML = `
      <div class="preview-box-empty">
        <span>Фото не выбрано</span>
        <label class="file-label">
          Выбрать фото
          <input type="file" accept="image/*" id="heroPhotoFileInput">
        </label>
      </div>`;
  } else {
    heroPhotoBox.innerHTML = `
      <div class="preview-box-filled">
        <div class="preview-thumb"><img src="${url}" alt=""></div>
        <div class="preview-actions">
          <label class="file-label">
            Заменить фото
            <input type="file" accept="image/*" id="heroPhotoFileInput">
          </label>
        </div>
      </div>`;
  }

  const fileInput = document.getElementById('heroPhotoFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      heroPhotoState = { file, existingSrc: heroPhotoState.existingSrc };
      renderHeroPhotoBox();
    });
  }
}

function renderStatsEditor() {
  if (!statsState.length) {
    statsEditor.innerHTML = '<p class="blocks-empty">Пока нет ни одной плитки статистики.</p>';
    return;
  }
  statsEditor.innerHTML = statsState
    .map(
      (s, i) => `
    <div class="repeat-row" data-i="${i}">
      <input type="text" inputmode="decimal" class="stat-value-input" data-i="${i}" placeholder="Число, напр. 12" value="${escapeHtml(s.value)}">
      <input type="text" class="stat-suffix-input" data-i="${i}" placeholder="Суффикс, напр. %" value="${escapeHtml(s.suffix || '')}">
      <input type="text" class="stat-label-input" data-i="${i}" placeholder="Подпись, напр. лет на рынке" value="${escapeHtml(s.label || '')}">
      <button type="button" class="icon-btn remove-stat" data-i="${i}" title="Удалить">✕</button>
    </div>`
    )
    .join('');

  statsEditor.querySelectorAll('.stat-value-input').forEach((el) => el.addEventListener('input', () => { statsState[Number(el.dataset.i)].value = el.value; }));
  statsEditor.querySelectorAll('.stat-suffix-input').forEach((el) => el.addEventListener('input', () => { statsState[Number(el.dataset.i)].suffix = el.value; }));
  statsEditor.querySelectorAll('.stat-label-input').forEach((el) => el.addEventListener('input', () => { statsState[Number(el.dataset.i)].label = el.value; }));
  statsEditor.querySelectorAll('.remove-stat').forEach((el) => el.addEventListener('click', () => {
    statsState.splice(Number(el.dataset.i), 1);
    renderStatsEditor();
  }));
}

function renderValuesEditor() {
  if (!valuesState.length) {
    valuesEditor.innerHTML = '<p class="blocks-empty">Пока нет ни одной карточки ценностей.</p>';
    return;
  }
  valuesEditor.innerHTML = valuesState
    .map(
      (v, i) => `
    <div class="repeat-row values-row" data-i="${i}">
      <input type="text" class="value-tag-input" data-i="${i}" placeholder="Метка, напр. СРОКИ" value="${escapeHtml(v.tag || '')}">
      <input type="text" class="value-title-input" data-i="${i}" placeholder="Заголовок" value="${escapeHtml(v.title || '')}">
      <input type="text" class="value-text-input" data-i="${i}" placeholder="Текст" value="${escapeHtml(v.text || '')}">
      <button type="button" class="icon-btn remove-value" data-i="${i}" title="Удалить">✕</button>
    </div>`
    )
    .join('');

  valuesEditor.querySelectorAll('.value-tag-input').forEach((el) => el.addEventListener('input', () => { valuesState[Number(el.dataset.i)].tag = el.value; }));
  valuesEditor.querySelectorAll('.value-title-input').forEach((el) => el.addEventListener('input', () => { valuesState[Number(el.dataset.i)].title = el.value; }));
  valuesEditor.querySelectorAll('.value-text-input').forEach((el) => el.addEventListener('input', () => { valuesState[Number(el.dataset.i)].text = el.value; }));
  valuesEditor.querySelectorAll('.remove-value').forEach((el) => el.addEventListener('click', () => {
    valuesState.splice(Number(el.dataset.i), 1);
    renderValuesEditor();
  }));
}

addStatBtn.addEventListener('click', () => {
  statsState.push({ value: 0, suffix: '', label: '' });
  renderStatsEditor();
});
addValueBtn.addEventListener('click', () => {
  valuesState.push({ tag: '', title: '', text: '' });
  renderValuesEditor();
});

async function loadSiteContent() {
  try {
    const res = await fetch('/api/site-content');
    const content = await res.json();
    siteContentState = content;

    const fields = {
      heroEyebrow: content.hero.eyebrow,
      heroLine1: content.hero.line1,
      heroLine2: content.hero.line2,
      heroLine3: content.hero.line3,
      heroLead: content.hero.lead,
      heroPhotoAlt: content.hero.photoAlt,
      aboutEyebrow: content.about.eyebrow,
      aboutTitle: content.about.title,
      aboutDesc: content.about.desc,
      aboutP1: content.about.p1,
      aboutP2: content.about.p2,
      contactsTagline: content.contacts.tagline,
      contactsPhone: content.contacts.phone,
      contactsEmail: content.contacts.email,
      contactsAddress: content.contacts.address,
      seoHomeTitle: content.seo.home.title,
      seoHomeDescription: content.seo.home.description,
      seoBlogTitle: content.seo.blog.title,
      seoBlogDescription: content.seo.blog.description,
      seoBlogH1: content.seo.blog.h1,
      seoPortfolioTitle: content.seo.portfolio.title,
      seoPortfolioDescription: content.seo.portfolio.description,
      seoPortfolioH1: content.seo.portfolio.h1,
      seoRobotsTxt: content.seo.robotsTxt,
      analyticsYandexMetrika: content.analytics.yandexMetrikaCode,
      analyticsGoogleAnalytics: content.analytics.googleAnalyticsCode,
      analyticsYandexVerification: content.analytics.yandexVerification,
      analyticsGoogleVerification: content.analytics.googleVerification
    };
    Object.entries(fields).forEach(([name, value]) => {
      if (siteContentForm.elements[name]) siteContentForm.elements[name].value = value || '';
    });

    heroPhotoState = { file: null, existingSrc: content.hero.photo };
    statsState = (content.about.stats || []).map((s) => ({ ...s }));
    valuesState = (content.about.values || []).map((v) => ({ ...v }));

    renderHeroPhotoBox();
    renderStatsEditor();
    renderValuesEditor();
  } catch (err) {
    siteContentError.textContent = 'Не удалось загрузить настройки сайта';
    siteContentError.hidden = false;
  }
}

siteContentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  siteContentError.hidden = true;
  siteContentSuccess.hidden = true;

  const fd = new FormData();
  [
    'heroEyebrow', 'heroLine1', 'heroLine2', 'heroLine3', 'heroLead', 'heroPhotoAlt',
    'aboutEyebrow', 'aboutTitle', 'aboutDesc', 'aboutP1', 'aboutP2',
    'contactsTagline', 'contactsPhone', 'contactsEmail', 'contactsAddress',
    'seoHomeTitle', 'seoHomeDescription', 'seoBlogTitle', 'seoBlogDescription', 'seoBlogH1',
    'seoPortfolioTitle', 'seoPortfolioDescription', 'seoPortfolioH1', 'seoRobotsTxt',
    'analyticsYandexMetrika', 'analyticsGoogleAnalytics', 'analyticsYandexVerification', 'analyticsGoogleVerification'
  ].forEach((name) => fd.append(name, siteContentForm.elements[name].value));
  fd.append('stats', JSON.stringify(statsState));
  fd.append('values', JSON.stringify(valuesState));
  if (heroPhotoState.file) fd.append('heroPhoto', heroPhotoState.file);

  try {
    const res = await fetch('/api/site-content', { method: 'PUT', body: fd });
    const data = await res.json();
    if (!res.ok) {
      siteContentError.textContent = data.error || 'Не удалось сохранить настройки';
      siteContentError.hidden = false;
      return;
    }
    siteContentState = data;
    heroPhotoState = { file: null, existingSrc: data.hero.photo };
    statsState = (data.about.stats || []).map((s) => ({ ...s }));
    valuesState = (data.about.values || []).map((v) => ({ ...v }));
    renderHeroPhotoBox();
    renderStatsEditor();
    renderValuesEditor();
    siteContentSuccess.hidden = false;
    setTimeout(() => { siteContentSuccess.hidden = true; }, 3000);
  } catch (err) {
    siteContentError.textContent = 'Ошибка соединения с сервером';
    siteContentError.hidden = false;
  }
});

checkAuth();