// Parses a tutorial HTML string, injects stable `id` attributes into
// every <h2>/<h3>, and returns the list of headings for a TOC sidebar.
//
// The HTML is authored in the repo itself (trusted), so a lightweight
// regex pass is enough — no DOM parsing required.

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, "")
    .replace(/&[a-z]+;/g, "")
    .trim();
}

export function buildToc(html) {
  if (!html) return { html: "", headings: [] };

  const headings = [];
  const seen = new Map();
  const HEADING_RE = /<(h2|h3)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;

  const patched = html.replace(HEADING_RE, (match, tag, attrs = "", inner) => {
    const level = tag.toLowerCase() === "h2" ? 2 : 3;
    const text = stripTags(inner);
    let id = slugify(text);
    if (!id) return match;

    const count = seen.get(id) || 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}-${count + 1}`;

    headings.push({ id, text, level });

    if (/\sid\s*=/.test(attrs)) return match;
    return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
  });

  return { html: patched, headings };
}
