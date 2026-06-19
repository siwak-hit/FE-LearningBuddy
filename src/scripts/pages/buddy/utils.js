export function safeParseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('[BuddyPage] Gagal parse JSON:', error);
    return fallback;
  }
}

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function stripAt(name = '') {
  return String(name).replace('@', '');
}

export function normalizeElementText(value = '', max = 220) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// [v0.9.25] Konversi list markdown (sudah ter-escape) → <ul>/<ol>. Baris yang bukan list
// dibiarkan apa adanya (nanti \n-nya jadi <br/>). Dipakai agar jawaban AI ber-poin rapi.
function mdListsToHtml(escaped = '') {
  const lines = String(escaped || '').split('\n');
  const out = [];
  let type = null; // 'ul' | 'ol'
  let items = [];
  const flush = () => {
    if (items.length) {
      const cls = type === 'ol' ? 'list-decimal' : 'list-disc';
      out.push(`<${type} class="${cls} pl-5 my-2 space-y-1">${items.map((it) => `<li>${it}</li>`).join('')}</${type}>`);
      items = [];
    }
    type = null;
  };
  for (const line of lines) {
    const ulM = line.match(/^\s*(?:[-*]|&#8226;|•|·)\s+(.+)$/);
    const olM = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ulM) { if (type && type !== 'ul') flush(); type = 'ul'; items.push(ulM[1].trim()); }
    else if (olM) { if (type && type !== 'ol') flush(); type = 'ol'; items.push(olM[1].trim()); }
    else { flush(); out.push(line); }
  }
  flush();
  return out.join('\n');
}

export function formatResponseText(text = '') {
  const htmlBlocks = [];
  const accordions = [];
  let parsedText = String(text || '');

  function stashHtml(block = '') {
    const key = `@@HTML_BLOCK_${htmlBlocks.length}@@`;
    htmlBlocks.push(block);
    return key;
  }

  function protectRegexBlocks(source, regex) {
    return source.replace(regex, (match) => stashHtml(match));
  }

  function protectBalancedBlocks(source, selectorRegex, tagName) {
    let output = '';
    let cursor = 0;
    const openRegex = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
    let match;

    while ((match = selectorRegex.exec(source)) !== null) {
      const startIndex = match.index;
      if (startIndex < cursor) continue;

      output += source.slice(cursor, startIndex);

      let depth = 0;
      let endIndex = match.index + match[0].length;
      const tagRegex = new RegExp(`</?${tagName}\\b[^>]*>`, 'gi');
      tagRegex.lastIndex = startIndex;
      let tagMatch;

      while ((tagMatch = tagRegex.exec(source)) !== null) {
        const tag = tagMatch[0];
        if (new RegExp(`^<${tagName}\\b`, 'i').test(tag)) depth += 1;
        else depth -= 1;
        endIndex = tagRegex.lastIndex;
        if (depth <= 0) break;
      }

      output += stashHtml(source.slice(startIndex, endIndex));
      cursor = endIndex;
    }

    output += source.slice(cursor);
    return output;
  }

  // 1. Isolasi blok HTML aman sebelum escape.
  parsedText = protectRegexBlocks(
    parsedText,
    /<details\b[^>]*class=["'][^"']*(?:alb-task-accordion|alb-html-block)[^"']*["'][\s\S]*?<\/details>/gi
  );

  // Div tabel Moodle. Wajib balanced, karena di dalamnya ada div tombol aksi.
  parsedText = protectBalancedBlocks(
    parsedText,
    /<div\b[^>]*class=["'][^"']*overflow-x-auto[^"']*["'][^>]*>/gi,
    'div'
  );

  // Kalau suatu saat tabel dikirim tanpa wrapper div.
  parsedText = protectBalancedBlocks(
    parsedText,
    /<table\b[^>]*class=["'][^"']*(?:alb-task-table|w-full)[^"']*["'][^>]*>/gi,
    'table'
  );

  // 2. Isolasi accordion custom berbasis teks.
  parsedText = parsedText.replace(
    /\[ACCORDION=([^\]]+)\]([\s\S]*?)\[\/ACCORDION\]/gi,
    (match, title, content) => {
      const key = `@@ACCORDION_BLOCK_${accordions.length}@@`;
      accordions.push({ title: String(title || '').trim(), content: String(content || '').trim() });
      return key;
    }
  );

  // 3. Escape teks biasa. (markdown bold → <b>, list → <ul>/<ol>, sisanya \n → <br/>)
  let safeText = this.escapeHtml(parsedText)
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  safeText = mdListsToHtml(safeText).replace(/\n/g, '<br/>');

  // 4. Balikin accordion custom.
  accordions.forEach((acc, idx) => {
    const safeTitle = this.escapeHtml(acc.title);
    const safeContent = mdListsToHtml(this.escapeHtml(acc.content)
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'))
      .replace(/\n/g, '<br/>');

    const openAttr = idx === 0 ? 'open' : '';
    const accHtml = `
      <details class="group bg-surface-card border border-hairline rounded-xl mb-3 mt-2 overflow-hidden shadow-sm" ${openAttr}>
        <summary class="p-3.5 bg-surface-strong hover:bg-hairline-strong cursor-pointer font-semibold text-[13px] text-ink flex justify-between items-center outline-none list-none [&::-webkit-details-marker]:hidden transition-colors">
          <span class="flex-1 pr-4">${safeTitle}</span>
          <i class="fa-solid fa-chevron-down text-[12px] text-muted-soft group-open:rotate-180 transition-transform duration-300 shrink-0"></i>
        </summary>
        <div class="p-4 text-[13px] text-body leading-relaxed border-t border-hairline bg-white">
          ${safeContent}
        </div>
      </details>`;

    safeText = safeText.replace(`@@ACCORDION_BLOCK_${idx}@@`, accHtml);
  });

  // 5. Balikin HTML aman.
  htmlBlocks.forEach((html, idx) => {
    safeText = safeText.replace(`@@HTML_BLOCK_${idx}@@`, html);
  });

  return safeText;
}
