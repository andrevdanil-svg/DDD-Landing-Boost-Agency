const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Почта, ссылки и @telegram в юридических текстах — снова кликабельные
const PATTERN = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(https?:\/\/[^\s,;)]+[^\s,;).])|(^|\s)@(v1lats)\b/g;

export function linkify(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    out += escape(text.slice(last, m.index));
    if (m[1]) out += `<a href="mailto:${escape(m[1])}">${escape(m[1])}</a>`;
    else if (m[2]) out += `<a href="${escape(m[2])}">${escape(m[2])}</a>`;
    else out += `${m[3]}<a href="https://t.me/${m[4]}">@${m[4]}</a>`;
    last = (m.index ?? 0) + m[0].length;
  }
  return out + escape(text.slice(last));
}
