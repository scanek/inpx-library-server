/**
 * Shared HTML fragment helpers for Flibusta sidecar / templates.
 * Keeps sanitizers free of circular imports with templates/shared.js.
 */

const VOID_HTML_TAGS = new Set(['br', 'hr', 'img']);

/**
 * Flibusta/FLibrary author & annotation markup uses image slots like:
 *   [float=right]$$0$$[/float]
 *   $$0$$
 * Portrait is rendered separately from etc/authors/pictures — strip these
 * placeholders so they never appear as literal text in bio HTML.
 */
export function stripFlibustaMediaPlaceholders(html) {
  let s = String(html || '');
  if (!s) return '';
  /*
   * Image slots from Flibusta author HTML / BBCode:
   *   $$0$$, $$1$$
   *   $$somefile.jpg$$
   *   [float=right]$$0$$[/float]
   * Portrait is shown separately — never leave these as visible text.
   */
  const slot = '\\$\\$[^$\\r\\n]{1,200}\\$\\$';
  s = s.replace(new RegExp(`\\[(?:float|img|photo|pic)(?:=[^\\]]*)?\\]\\s*${slot}\\s*\\[\\/(?:float|img|photo|pic)\\]`, 'gi'), '');
  s = s.replace(new RegExp(slot, 'g'), '');
  /* Empty / orphan float-style BBCode left after slot removal */
  s = s.replace(/\[(?:float|img|photo|pic)(?:=[^\]]*)?\]\s*\[\/(?:float|img|photo|pic)\]/gi, '');
  s = s.replace(/\[\/?(?:float|img|photo|pic)(?:=[^\]]*)?\]/gi, '');
  /* Collapse leftover leading breaks from a removed right-float portrait */
  s = s.replace(/^(?:\s*<br\s*\/?\s*>)+/i, '');
  s = s.replace(/(?:<br\s*\/?\s*>\s*){3,}/gi, '<br><br>');
  return s.trim();
}

/**
 * Append missing closing tags so an unclosed <a href> from Flibusta bio
 * cannot wrap later page controls (favorite / sort).
 */
export function balanceHtmlFragment(html) {
  const s = String(html || '');
  if (!s) return '';
  const stack = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let m;
  while ((m = re.exec(s))) {
    const full = m[0];
    const tag = m[1].toLowerCase();
    if (VOID_HTML_TAGS.has(tag) || /\/\s*>$/.test(full)) continue;
    if (full.startsWith('</')) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] === tag) {
          stack.splice(i, 1);
          break;
        }
      }
      continue;
    }
    stack.push(tag);
  }
  if (!stack.length) return s;
  let out = s;
  for (let i = stack.length - 1; i >= 0; i--) {
    out += `</${stack[i]}>`;
  }
  return out;
}

/**
 * Преобразует BB-коды (часто встречающиеся в раздачах Flibusta, Librusec, RuTracker)
 * в безопасную HTML-разметку:
 *   [b]...[/b] -> <strong>...</strong>
 *   [i]...[/i] -> <em>...</em>
 *   [u]...[/u] -> <u>...</u>
 *   [s]...[/s] -> <s>...</s>
 *   [spoiler=Название]...[/spoiler] -> <details><summary>Название</summary>...</details>
 *   [quote]...[/quote] -> <blockquote>...</blockquote>
 *   [url=https://...]текст[/url] -> <a href="...">текст</a>
 */
export function parseBbCode(text) {
  let s = String(text || '');
  if (!s) return '';

  // Если HTML-теги были закодированы в XML-сущности (&lt;p&gt;...), раскодируем их
  if (/&lt;(?:p|br|div|b|i|strong|em|span|ul|ol|li)\b/i.test(s)) {
    s = s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  // Обработка [spoiler=Заголовок]...[/spoiler] и [spoiler]...[/spoiler]
  for (let i = 0; i < 3; i++) {
    const prev = s;
    s = s.replace(/\[spoiler=([^\]]+)\]([\s\S]*?)\[\/spoiler\]/gi, (_m, title, content) => {
      const trimmedTitle = String(title || '').trim() || 'Спойлер';
      return `<details class="book-annotation-spoiler"><summary>${trimmedTitle}</summary><div class="book-annotation-spoiler-content">${content.trim()}</div></details>`;
    });
    s = s.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, (_m, content) => {
      return `<details class="book-annotation-spoiler"><summary>Спойлер</summary><div class="book-annotation-spoiler-content">${content.trim()}</div></details>`;
    });
    if (s === prev) break;
  }

  // Текстовое форматирование
  s = s.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>');
  s = s.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>');
  s = s.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>');
  s = s.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '<s>$1</s>');
  s = s.replace(/\[del\]([\s\S]*?)\[\/del\]/gi, '<del>$1</del>');
  s = s.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, '<blockquote>$1</blockquote>');
  s = s.replace(/\[quote=([^\]]+)\]([\s\S]*?)\[\/quote\]/gi, '<blockquote><cite>$1:</cite>$2</blockquote>');

  // Ссылки
  s = s.replace(/\[url=(https?:\/\/[^\s\]]+)\]([\s\S]*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>');
  s = s.replace(/\[url\](https?:\/\/[^\s\]]+)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

  // Очистка тегов форматирования цвета, шрифта и размера (чтобы не засорять страницу)
  s = s.replace(/\[(?:color|size|font)(?:=[^\]]*)?\]([\s\S]*?)\[\/(?:color|size|font)\]/gi, '$1');
  s = s.replace(/\[\/?(?:color|size|font)(?:=[^\]]*)?\]/gi, '');

  return s;
}

/** Удаляет все BB-коды для вывода в чистом тексте (OPDS plain text, уведомления). */
export function stripBbCode(text) {
  let s = String(text || '');
  if (!s) return '';
  s = s.replace(/\[spoiler(?:=[^\]]*)?\]([\s\S]*?)\[\/spoiler\]/gi, '$1');
  s = s.replace(/\[url=(https?:\/\/[^\s\]]+)\]([\s\S]*?)\[\/url\]/gi, '$2 ($1)');
  s = s.replace(/\[\/?[a-zA-Z][a-zA-Z0-9]*(?:=[^\]]*)?\]/g, '');
  return s;
}
