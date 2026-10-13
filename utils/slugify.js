// Преобразует заголовок (в т.ч. кириллицу) в url-friendly slug
const translitMap = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
};

// isTaken может быть как обычной функцией, так и async (делает запрос к БД) —
// await на не-промисе просто отдаёт значение как есть, так что это работает
// в обоих случаях.
async function slugify(text, isTaken) {
  let base = String(text)
    .toLowerCase()
    .split('')
    .map((ch) => (translitMap[ch] !== undefined ? translitMap[ch] : ch))
    .join('');

  base = base
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  if (!base) base = 'post';

  let slug = base;
  if (typeof isTaken === 'function') {
    let i = 2;
    while (await isTaken(slug)) {
      slug = `${base}-${i}`;
      i += 1;
    }
  }
  return slug;
}

module.exports = slugify;
