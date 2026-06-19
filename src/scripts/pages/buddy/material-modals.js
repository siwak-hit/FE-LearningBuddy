// ============================================================
// material-modals.js — Modal preview VClass (iframe) & reader materi Moodle.
// [v0.9.7] Diekstrak dari events.js. Dipakai dari luar: openVclassPreviewModal,
// openMoodleMaterialModal (keduanya dipanggil dari bindChatActionButtons).
// ============================================================
import $ from 'jquery';
import Toast from '../../components/toast.js';

// [v0.9.16] Modal generik untuk menampilkan HTML mentah dari Moodle (mis. review jawaban
// kuis) sebagai bukti visual. HTML dirender di IFRAME sandbox (tanpa script) agar aman.
function ensureHtmlViewModal() {
  if ($('#alb-html-view-modal').length) return;
  $('body').append(`
    <div id="alb-html-view-modal" class="hidden fixed inset-0 z-[9750] bg-slate-950/70 backdrop-blur-sm p-2 md:p-6">
      <div class="bg-surface-card w-full h-full max-w-[920px] mx-auto rounded-2xl shadow-2xl border border-hairline flex flex-col overflow-hidden">
        <div class="px-4 py-3 border-b border-hairline bg-white flex items-center justify-between gap-3 shrink-0">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-8 h-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><i class="fa-solid fa-clipboard-check"></i></span>
            <div class="text-[14px] font-black text-ink truncate" id="alb-html-view-title">Review Jawaban</div>
          </div>
          <button type="button" id="alb-html-view-close" class="w-9 h-9 rounded-full bg-surface-strong border border-hairline text-ink hover:bg-hairline shrink-0"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="px-4 py-2 bg-blue-50 border-b border-blue-100 text-[12px] text-blue-800 shrink-0"><i class="fa-solid fa-circle-info mr-1"></i> Ini tampilan asli lembar jawabanmu dari VClass sebagai bukti.</div>
        <iframe id="alb-html-view-frame" class="w-full flex-1 bg-white border-0" sandbox="allow-same-origin" referrerpolicy="no-referrer"></iframe>
      </div>
    </div>
  `);
  const close = () => { $('#alb-html-view-frame').attr('srcdoc', ''); $('#alb-html-view-modal').addClass('hidden'); };
  $('#alb-html-view-close').on('click', close);
}

export function openHtmlViewModal(payload = {}) {
  const html = String(payload.html || '').trim();
  if (!html) { Toast.show('Review tidak tersedia.', 'warning'); return; }
  ensureHtmlViewModal();
  $('#alb-html-view-title').text(payload.title || 'Review Jawaban');
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Inter,system-ui,sans-serif;padding:16px;color:#0f172a;line-height:1.6;font-size:14px;}img{max-width:100%;height:auto;}table{border-collapse:collapse;}</style></head><body>${html}</body></html>`;
  $('#alb-html-view-frame').attr('srcdoc', doc);
  $('#alb-html-view-modal').removeClass('hidden');
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------- Preview VClass (iframe) ----------
function ensureVclassPreviewModal() {
  if ($('#alb-vclass-preview-modal').length) return;

  $('body').append(`
    <div id="alb-vclass-preview-modal" class="hidden fixed inset-0 z-[9400] bg-ink/50 backdrop-blur-sm p-3 md:p-6">
      <div class="bg-surface-card w-full h-full rounded-2xl shadow-2xl border border-hairline flex flex-col overflow-hidden">
        <div class="px-4 py-3 border-b border-hairline bg-canvas-soft flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[13px] font-bold text-ink truncate" id="alb-vclass-preview-title">Preview VClass</div>
            <div class="text-[11px] text-muted-soft truncate" id="alb-vclass-preview-url"></div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <a id="alb-vclass-preview-newtab" href="#" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-full text-[12px] font-bold"><i class="fa-solid fa-up-right-from-square"></i> Tab Baru</a>
            <button type="button" id="alb-vclass-preview-close" class="w-9 h-9 rounded-full bg-white border border-hairline text-ink hover:bg-surface-strong"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
        <div class="px-4 py-2 bg-amber-50 border-b border-amber-100 text-[12px] text-amber-800">
          <i class="fa-solid fa-circle-info"></i> Jika halaman VClass menolak ditampilkan di iframe, gunakan tombol <b>Tab Baru</b>.
        </div>
        <iframe id="alb-vclass-preview-frame" class="w-full flex-1 bg-white border-0" sandbox="allow-same-origin allow-scripts allow-forms allow-popups" referrerpolicy="no-referrer"></iframe>
      </div>
    </div>
  `);

  $('#alb-vclass-preview-close').on('click', () => {
    $('#alb-vclass-preview-frame').attr('src', 'about:blank');
    $('#alb-vclass-preview-modal').addClass('hidden');
  });
}

export function openVclassPreviewModal(url = '', title = 'Preview VClass') {
  const targetUrl = String(url || '').trim();
  if (!targetUrl || targetUrl === '#') {
    Toast.show('Link VClass belum tersedia untuk aktivitas ini.', 'warning');
    return;
  }

  ensureVclassPreviewModal();
  $('#alb-vclass-preview-title').text(title || 'Preview VClass');
  $('#alb-vclass-preview-url').text(targetUrl);
  $('#alb-vclass-preview-newtab').attr('href', targetUrl);
  $('#alb-vclass-preview-frame').attr('src', targetUrl);
  $('#alb-vclass-preview-modal').removeClass('hidden');
}

// ---------- Reader materi Moodle ----------
function buildMoodleMaterialReaderHtml(item = {}) {
  const title = escapeHtml(item.title || 'Materi Moodle');
  const topic = escapeHtml(item.topic || item.class_code || 'Materi');
  const badge = escapeHtml((item.modname || item.file_type || 'html').toString().toUpperCase());
  const sourceUrl = escapeHtml(item.url || item.source_url || item.file_url || '');

  // [v0.9.9] Kutipan yang dirujuk AI (fitur @materi) — disorot di dalam materi.
  const highlight = String(item.highlight || '').replace(/\s+/g, ' ').trim();
  const applyHighlight = (escaped) => {
    if (!highlight) return escaped;
    const escHl = escapeHtml(highlight).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return escaped.replace(new RegExp(escHl, 'gi'), (m) => `<mark class="bg-yellow-200 text-ink rounded px-0.5">${m}</mark>`);
    } catch (_) { return escaped; }
  };

  const snippets = (Array.isArray(item.snippets) && item.snippets.length ? item.snippets : [item.content || item.preview || 'Materi ini sudah tersinkron ke AI Buddy.'])
    .map((v) => String(v || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 8);
  const sections = snippets.map((text, idx) => `
    <section class="bg-white border border-hairline rounded-2xl p-4 md:p-5 shadow-sm">
      <div class="text-[11px] font-black text-muted-soft uppercase tracking-wider mb-2">Bagian ${idx + 1}</div>
      <p class="text-[14px] md:text-[15px] leading-7 text-ink whitespace-pre-wrap">${applyHighlight(escapeHtml(text))}</p>
    </section>`).join('');
  const highlightBanner = highlight ? `
      <div class="mt-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-2xl p-3 flex items-start gap-2 text-[13px]">
        <i class="fa-solid fa-highlighter mt-0.5 shrink-0"></i>
        <div>Bagian yang <mark class="bg-yellow-200 text-ink rounded px-0.5">disorot kuning</mark> adalah kutipan yang dipakai AI untuk menjawab pertanyaanmu.</div>
      </div>` : '';
  return `
    <div class="max-w-[920px] mx-auto p-4 md:p-7 space-y-4 md:space-y-5">
      <section class="bg-white border border-hairline rounded-3xl p-5 md:p-7 shadow-sm">
        <div class="inline-flex items-center gap-2 bg-primary/10 text-primary border border-primary/15 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider">${badge} · Materi tersinkron</div>
        <h1 class="mt-4 text-[26px] md:text-[38px] leading-tight font-black text-ink tracking-tight">${title}</h1>
        <div class="mt-1 text-[13px] md:text-[15px] text-muted-soft">${topic}</div>
        ${highlightBanner}
        <div class="alb-reader-note mt-5 bg-amber-50 border border-amber-100 text-amber-800 rounded-2xl p-4 flex items-start gap-3">
          <i class="fa-solid fa-circle-info mt-1 shrink-0"></i>
          <div class="flex-1 text-[13px] md:text-[14px] leading-6"><b>Catatan desain:</b> tampilan ini adalah reader dari materi yang sudah tersinkron. Catatan ini bisa ditutup dan akan muncul lagi setelah halaman di-refresh.</div>
          <button type="button" class="alb-reader-note-close w-8 h-8 rounded-full bg-white/70 border border-amber-100 text-amber-800 hover:bg-white shrink-0"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </section>
      ${sections || '<section class="bg-white border border-hairline rounded-2xl p-5 text-body">Belum ada cuplikan materi untuk ditampilkan.</section>'}
      ${sourceUrl ? `<div class="text-[12px] text-muted-soft break-all px-1">Sumber Moodle: ${sourceUrl}</div>` : ''}
    </div>`;
}

function ensureMoodleMaterialModal() {
  if ($('#alb-moodle-material-modal').length) return;
  $('body').append(`
    <div id="alb-moodle-material-modal" class="hidden fixed inset-0 z-[9800] bg-slate-950/70 backdrop-blur-sm p-2 md:p-6">
      <div class="relative bg-surface-card w-full h-full rounded-2xl shadow-2xl border border-hairline flex flex-col overflow-hidden">
        <div class="px-3 md:px-4 py-3 border-b border-hairline bg-white flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 min-w-0">
            <button type="button" id="alb-moodle-material-menu" class="md:hidden w-9 h-9 rounded-full bg-surface-strong border border-hairline text-ink hover:bg-hairline shrink-0"><i class="fa-solid fa-bars"></i></button>
            <div class="min-w-0"><div id="alb-moodle-material-title" class="text-[14px] font-black text-ink truncate">Materi Terkait</div><div id="alb-moodle-material-subtitle" class="text-[11px] text-muted-soft truncate">Pilih materi</div></div>
          </div>
          <div class="flex items-center gap-2 shrink-0"><button type="button" id="alb-moodle-material-open-tab" class="hidden inline-flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-full text-[12px] font-bold"><i class="fa-solid fa-up-right-from-square"></i> Tab Baru</button><button type="button" id="alb-moodle-material-close" class="w-9 h-9 rounded-full bg-surface-strong border border-hairline text-ink hover:bg-hairline"><i class="fa-solid fa-xmark"></i></button></div>
        </div>
        <div class="relative grid grid-cols-1 md:grid-cols-[300px_1fr] flex-1 min-h-0 overflow-hidden">
          <div id="alb-moodle-material-sidebar-shade" class="hidden md:hidden absolute inset-0 z-20 bg-slate-950/45"></div>
          <aside id="alb-moodle-material-sidebar" class="absolute md:relative inset-y-0 left-0 z-30 w-[82%] max-w-[320px] md:w-auto md:max-w-none -translate-x-full md:translate-x-0 transition-transform duration-300 border-r border-hairline bg-canvas-soft overflow-y-auto p-3 shadow-2xl md:shadow-none">
            <div class="flex items-center justify-between gap-2 mb-3"><div class="text-[11px] font-black text-muted-soft uppercase tracking-wider">Daftar Materi</div><button type="button" id="alb-moodle-material-sidebar-close" class="md:hidden w-8 h-8 rounded-full bg-white border border-hairline text-ink"><i class="fa-solid fa-xmark"></i></button></div>
            <div id="alb-moodle-material-list" class="space-y-2"></div>
          </aside>
          <section class="flex flex-col min-h-0 bg-canvas"><div id="alb-moodle-material-reader" class="w-full flex-1 overflow-y-auto bg-canvas"></div></section>
        </div>
      </div>
    </div>
  `);
  const closeSidebar = () => { $('#alb-moodle-material-sidebar').addClass('-translate-x-full'); $('#alb-moodle-material-sidebar-shade').addClass('hidden'); };
  const openSidebar = () => { $('#alb-moodle-material-sidebar').removeClass('-translate-x-full'); $('#alb-moodle-material-sidebar-shade').removeClass('hidden'); };
  $('#alb-moodle-material-menu').on('click', openSidebar);
  $('#alb-moodle-material-sidebar-close, #alb-moodle-material-sidebar-shade').on('click', closeSidebar);
  $('#alb-moodle-material-close').on('click', () => { $('#alb-moodle-material-reader').empty(); $('#alb-moodle-material-modal').addClass('hidden'); closeSidebar(); $('body').css('overflow', ''); });
  $('#alb-moodle-material-open-tab').on('click', () => { const url = $('#alb-moodle-material-open-tab').attr('data-url') || ''; if (url) window.open(url, '_blank', 'noopener,noreferrer'); });
  $('#alb-moodle-material-reader').on('click', '.alb-reader-note-close', function () { $(this).closest('.alb-reader-note').slideUp(160, function () { $(this).remove(); }); });
}

export function openMoodleMaterialModal(payload = {}) {
  ensureMoodleMaterialModal();
  const materials = Array.isArray(payload.materials) ? payload.materials.filter(Boolean).slice(0, 3) : [];
  $('#alb-moodle-material-title').text(payload.title || 'Materi Terkait');
  if (!materials.length) {
    $('#alb-moodle-material-list').html('<div class="text-[13px] text-muted-soft bg-white border border-hairline rounded-xl p-3">Belum ada materi yang bisa dibuka.</div>');
    $('#alb-moodle-material-reader').empty();
    $('#alb-moodle-material-open-tab').addClass('hidden').attr('data-url', '');
    $('#alb-moodle-material-modal').removeClass('hidden');
    $('body').css('overflow', 'hidden');
    return;
  }
  const renderList = (activeIndex = 0) => {
    $('#alb-moodle-material-list').html(materials.map((item, idx) => {
      const active = idx === activeIndex;
      return `<button type="button" class="alb-material-item w-full text-left rounded-xl border ${active ? 'border-primary bg-primary/10' : 'border-hairline bg-white hover:bg-surface-strong'} p-3 transition-colors" data-index="${idx}"><div class="text-[13px] font-bold text-ink leading-snug">${escapeHtml(item.title || `Materi ${idx + 1}`)}</div><div class="text-[11px] text-muted-soft mt-1">${escapeHtml(item.topic || item.class_code || 'Moodle')}</div></button>`;
    }).join(''));
  };
  const showMaterial = (index = 0) => {
    const safeIndex = Math.max(0, Math.min(materials.length - 1, Number(index || 0)));
    const item = materials[safeIndex] || {};
    const url = item.url || item.source_url || item.file_url || '';
    renderList(safeIndex);
    $('#alb-moodle-material-subtitle').text(`${item.topic || 'Materi'} ${materials.length > 1 ? `• ${safeIndex + 1}/${materials.length}` : ''}`);
    $('#alb-moodle-material-reader').html(buildMoodleMaterialReaderHtml(item));
    if (url) $('#alb-moodle-material-open-tab').removeClass('hidden').attr('data-url', url);
    else $('#alb-moodle-material-open-tab').addClass('hidden').attr('data-url', '');
  };
  $('#alb-moodle-material-list').off('click', '.alb-material-item').on('click', '.alb-material-item', (e) => { showMaterial(Number($(e.currentTarget).attr('data-index') || 0)); $('#alb-moodle-material-sidebar').addClass('-translate-x-full'); $('#alb-moodle-material-sidebar-shade').addClass('hidden'); });
  $('#alb-moodle-material-modal').removeClass('hidden'); $('body').css('overflow', 'hidden'); showMaterial(0);
}
