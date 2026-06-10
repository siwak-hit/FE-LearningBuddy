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

export function formatResponseText(text) {
  let accordions = [];
  let parsedText = text || '';

  parsedText = parsedText.replace(/\[ACCORDION=(.*?)\]([\s\S]*?)\[\/ACCORDION\]/g, (match, title, content) => {
    accordions.push({ title: title, content: content.trim() });
    return `___ACCORDION_${accordions.length - 1}___`;
  });

  let safeText = this.escapeHtml(parsedText)
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br/>');

  accordions.forEach((acc, idx) => {
    const safeTitle = this.escapeHtml(acc.title);
    const safeContent = this.escapeHtml(acc.content)
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/\n/g, '<br/>');

    const openAttr = idx === 0 ? 'open' : '';

    const accHtml = `
      <details class="group bg-surface-card border border-hairline rounded-xl mb-3 mt-2 overflow-hidden shadow-sm" ${openAttr}>
        <summary class="p-3.5 bg-surface-strong hover:bg-hairline-strong cursor-pointer font-semibold text-[13px] text-ink flex justify-between items-center outline-none list-none [&::-webkit-details-marker]:hidden transition-colors">
          <span class="flex-1 pr-4">${safeTitle}</span>
          <i class="fa-solid fa-chevron-down text-[12px] text-muted-soft group-open:rotate-180 transition-transform duration-300 shrink-0"></i>
        </summary>
        <div class="p-4 text-[13px] text-body border-t border-hairline bg-white leading-relaxed">
          ${safeContent}
        </div>
      </details>
    `;

    safeText = safeText
      .replace(`___ACCORDION_${idx}___<br/>`, accHtml)
      .replace(`___ACCORDION_${idx}___`, accHtml);
  });

  return safeText;
}
