import $ from 'jquery';
import { ApiService } from '../../fetch/api.js';

export function cacheWorkspaceDOM() {
  this.$elTitle = $('#context-title');
  this.$elWelcome = $('#welcome-context-title');
  this.$elList = $('#element-list');
  this.$chatTitle = $('#chat-title');
  this.$chatSubtitle = $('#chat-subtitle');
  this.$contextSidebar = $('#context-sidebar');
  this.$contextBackdrop = $('#context-backdrop');
  this.$btnOpenContext = $('#btn-open-context');
  this.$btnCloseContext = $('#btn-close-context');
  this.$inputArea = $('#chat-input');
  this.$form = $('#chat-form');
  this.$chatArea = $('#chat-area');
  this.$btnSend = $('#btn-send');
  this.$selectedBar = $('#selected-bar');
  this.$selectedText = $('#selected-text');
  this.$btnClearSelected = $('#btn-clear-selected');
  this.$suggestionWrapper = $('#suggestion-wrapper');
  this.$suggestionChips = $('#suggestion-chips');
  this.$btnReload = $('#btn-reload');
  this.$chatCountDisplay = $('#chat-count');
  this.$cooldownOverlay = $('#cooldown-overlay');
  this.$timerDisplay = $('#timer-display');
  this.$btnBack = $('#btn-back');
  this.$btnSessionInfo = $('#btn-session-info');
  this.$btnConfirmLeave = $('#btn-confirm-leave');
  this.$lockdownOverlay = $('#lockdown-overlay');
  this.$unlockKeyInput = $('#unlock-key-input');
}

export function handleLockdown(isLocked) {
  this.isLocked = isLocked;
  if (isLocked) {
    this.$inputArea.prop('disabled', true).attr('placeholder', 'Chat dikunci. Silakan hubungi instruktur.');
    this.$btnSend.prop('disabled', true);
    this.$lockdownOverlay.removeClass('hidden'); // Munculkan layar
  } else {
    this.$inputArea.prop('disabled', false).attr('placeholder', 'Tanya sesuatu atau pilih elemen...');
    this.$btnSend.prop('disabled', false);
    this.$lockdownOverlay.addClass('hidden'); // Sembunyikan layar
  }
}

export function updateAiUsageUI(usage) {
  this.aiUsage = usage;
  // FIX: Kembalikan agar hanya mencetak angka (karena "/ 3" sudah ada di HTML)
  this.$chatCountDisplay.text(usage.used);

  if (!this.isLocked) {
    this.$inputArea.prop('disabled', false).attr('placeholder', 'Tanya sesuatu atau pilih elemen...');
    this.$btnSend.prop('disabled', false);
  }
  this.$cooldownOverlay.addClass('hidden');
}

export function startCooldownTimer() {
  this.triggerCooldown();
}

export function triggerCooldown() {
  this.$inputArea.prop('disabled', true);
  this.$btnSend.prop('disabled', true);
  this.$cooldownOverlay.removeClass('hidden');

  let timeLeft = (this.aiUsage && this.aiUsage.cooldown_remaining_seconds > 0)
    ? this.aiUsage.cooldown_remaining_seconds
    : 120;

  clearInterval(this.cooldownInterval);

  this.cooldownInterval = setInterval(() => {
    timeLeft--;
    if (this.aiUsage) this.aiUsage.cooldown_remaining_seconds = timeLeft;

    let m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    let s = (timeLeft % 60).toString().padStart(2, '0');
    this.$timerDisplay.text(`${m}:${s}`);

    if (timeLeft <= 0) {
      clearInterval(this.cooldownInterval);
      if (this.aiUsage) {
         this.aiUsage.cooldown_active = false;
         this.aiUsage.used = 0;
         // FIX: Kembalikan agar hanya mereset ke angka '0'
         this.$chatCountDisplay.text('0');
      }
      this.$timerDisplay.parent().html('Waktu jeda selesai.');
      $('.fa-hourglass-half').removeClass('fa-spin');
      this.$btnReload.removeClass('hidden');

      this.$inputArea.prop('disabled', false).focus();
      this.$btnSend.prop('disabled', false);
      this.$cooldownOverlay.addClass('hidden');
    }
  }, 1000);
}

export function openContextSidebar() {
  this.$contextBackdrop.removeClass('hidden');
  this.$contextBackdrop[0]?.offsetHeight;
  this.$contextBackdrop.removeClass('opacity-0');
  this.$contextSidebar.removeClass('-translate-x-full');
}

export function closeContextSidebar() {
  this.$contextSidebar.addClass('-translate-x-full');
  this.$contextBackdrop.addClass('opacity-0');
  setTimeout(() => { this.$contextBackdrop.addClass('hidden'); }, 300);
}

export function toggleSuggestions() {
  const value = this.$inputArea.val().trim().toLowerCase();
  const hasValue = value.length > 0;
  let shouldShow = !this.hasStartedChat ? !hasValue : value.startsWith('tanya');

  if (!shouldShow && !this.isSuggestionHidden) {
    this.isSuggestionHidden = true;
    this.$suggestionWrapper.stop(true, true).animate({ opacity: 0, height: 0, paddingBottom: 0 }, 220, () => {
      this.$suggestionWrapper.addClass('pointer-events-none hidden');
    });
    return;
  }
  if (shouldShow && this.isSuggestionHidden) {
    this.isSuggestionHidden = false;
    this.$suggestionWrapper.removeClass('pointer-events-none hidden').stop(true, true).animate({ opacity: 1, height: this.$suggestionChips.outerHeight(true), paddingBottom: 16 }, 220, () => {
      this.$suggestionWrapper.css('height', 'auto');
    });
  }
}

export function handleSelectElement(el) {
  this.selectedElement = el;
  const elementName = el.name || '@element';
  const elementText = this.normalizeElementText(el.text || el.title || 'Teks elemen tidak tersedia.', 160);
  const promptText = `${elementName} Tanya tentang elemen yang bertuliskan: "${elementText}" `;

  this.$inputArea.val(promptText).focus();
  this.$selectedText.html(`
    <span class="inline-flex items-center bg-primary text-white rounded-full px-3 py-1 text-[12px] font-semibold mr-2">${this.escapeHtml(elementName)}</span>
    <span class="text-[14px] text-ink font-medium">Teks: ${this.escapeHtml(elementText)}</span>
  `);
  this.$selectedBar.removeClass('hidden').addClass('flex');
  this.closeContextSidebar();
  this.toggleSuggestions();
}

export function getPreviewScale(el) {
  const rect = el.rect || {};
  const originalWidth = Number(rect.width) || 0;
  const defaultScale = 0.82;
  const availableWidth = 320;
  if (!originalWidth) return defaultScale;
  if (originalWidth * defaultScale <= availableWidth) return defaultScale;
  return Math.max(0.25, Math.min(defaultScale, availableWidth / originalWidth));
}

export function getPreviewHeight(el, scale) {
  const rect = el.rect || {};
  const originalHeight = Number(rect.height) || 120;
  return Math.max(100, Math.min(240, Math.ceil(originalHeight * scale)));
}

export function fixPreviewElements() {
  this.$elList.find('.buddy-preview-inner > *').each(function() {
    const $previewRoot = $(this);
    $previewRoot.css({ width: '100%', maxWidth: '100%', minWidth: '0', position: 'relative', left: 'auto', right: 'auto', top: 'auto', bottom: 'auto', transform: 'none', boxSizing: 'border-box' });
    $previewRoot.find('*').each(function() {
      const $child = $(this);
      const position = $child.css('position');
      if (position === 'fixed' || position === 'absolute' || position === 'sticky') {
        $child.css({ position: 'relative', left: 'auto', right: 'auto', top: 'auto', bottom: 'auto' });
      }
      $child.css({ maxWidth: '100%', boxSizing: 'border-box' });
    });
  });
}

export function adjustPreviewHeights() {
  this.$elList.find('.buddy-preview-wrap').each(function() {
    const $wrap = $(this);
    const $inner = $wrap.find('.buddy-preview-inner');
    if (!$inner.length) return;
    const transform = $inner.css('transform');
    let scale = 1;
    if (transform && transform !== 'none') {
      const values = transform.match(/matrix\(([^)]+)\)/);
      if (values && values[1]) scale = parseFloat(values[1].split(',')[0]) || 1;
    }
    const innerHeight = $inner[0].scrollHeight || $inner.outerHeight() || 120;
    const safeHeight = Math.max(100, Math.min(240, Math.ceil(innerHeight * scale)));
    $wrap.css({ minHeight: `${safeHeight}px`, height: `${safeHeight}px`, overflow: 'hidden' });
  });
}

export function renderSuggestionChips(elements = []) {
  if (!elements.length) return;
  const chip1 = $(`<button type="button" class="shrink-0 bg-primary text-white text-[13px] font-medium px-5 py-2 rounded-full hover:bg-primary-active transition-colors whitespace-nowrap">Jelaskan ${this.escapeHtml(elements[0].name)}</button>`);
  chip1.on('click', () => { this.$inputArea.val(chip1.text().trim()).focus(); this.toggleSuggestions(); });
  this.$suggestionChips.append(chip1);

  if (elements[1]) {
    const chip2 = $(`<button type="button" class="shrink-0 bg-surface-card text-ink border border-hairline-strong text-[13px] font-medium px-5 py-2 rounded-full hover:bg-surface-strong transition-colors whitespace-nowrap">Apa itu ${this.escapeHtml(elements[1].name)}?</button>`);
    chip2.on('click', () => { this.$inputArea.val(chip2.text().trim()).focus(); this.toggleSuggestions(); });
    this.$suggestionChips.append(chip2);
  }
}


export function parseTemplateJson(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed || fallback;
  } catch (e) {
    console.warn('[BuddyPage] Gagal parse data template:', e);
    return fallback;
  }
}

export function normalizeMatchText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/log\s*in/g, 'login')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function unwrapTemplateResponse(payload) {
  if (!payload) return null;

  // Support beberapa bentuk response backend:
  // 1) res.data = template
  // 2) res.data = { template }
  // 3) res.data = { matchedTemplate }
  // 4) res.data = { data: template }
  return payload.template || payload.matchedTemplate || payload.pageTemplate || payload.data || payload;
}

export function extractTemplateList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.templates)) return payload.templates;
  if (Array.isArray(payload.pageTemplates)) return payload.pageTemplates;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

export function normalizeTemplatePayload(template = {}) {
  const unwrapped = this.unwrapTemplateResponse(template) || {};
  const normalized = { ...unwrapped };
  normalized.elements_json = this.parseTemplateJson(unwrapped.elements_json, []);
  normalized.tutorial_steps_json = this.parseTemplateJson(unwrapped.tutorial_steps_json, []);
  normalized.question_suggestions_json = this.parseTemplateJson(unwrapped.question_suggestions_json, []);
  return normalized;
}

export function getPreviewApiBase() {
  const safeTrim = (value) => String(value || '').trim().replace(/\/$/, '');

  // Urutan ini sengaja longgar karena project Astro/Vite tiap environment bisa beda.
  const candidates = [
    window.__ALB_API_BASE__,
    window.__API_BASE__,
    window.API_BASE,
    window.ALB_API_BASE,
    typeof import.meta !== 'undefined' ? import.meta.env?.PUBLIC_API_BASE : '',
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_BASE : '',
    typeof import.meta !== 'undefined' ? import.meta.env?.PUBLIC_API_URL : '',
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : ''
  ].map(safeTrim).filter(Boolean);

  return candidates[0] || '';
}

export function normalizeExternalAssetUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `${window.location.protocol}${raw}`;
  try {
    return new URL(raw, window.location.href).href;
  } catch (_) {
    return raw;
  }
}

export function buildPreviewProxyUrl(url = '') {
  const normalizedUrl = this.normalizeExternalAssetUrl(url);
  if (!normalizedUrl) return '';

  const apiBase = this.getPreviewApiBase();

  // Kalau API base tidak ketemu, tetap load URL aslinya di dalam iframe.
  // Ini tetap tidak meluber, hanya mungkin font eksternal kena CORS.
  if (!apiBase) return normalizedUrl;

  return `${apiBase}/page-templates/proxy-asset?url=${encodeURIComponent(normalizedUrl)}`;
}

export function getTemplateStyles(template = this.activeTemplate) {
  const html = template?.html_preview || '';
  if (!html) return '';

  const styles = [];

  // 1) Ambil stylesheet eksternal asli, tetapi href diarahkan ke proxy BE.
  // Karena stylesheet ini diletakkan di iframe srcdoc, CSS tidak akan meluber ke AI Workspace.
  const linkRegex = /<link\b(?=[^>]*rel=["']?stylesheet["']?)[^>]*>/gi;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const tag = linkMatch[0];
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i) || tag.match(/href=([^\s>]+)/i);
    const href = hrefMatch?.[1];
    const proxiedHref = this.buildPreviewProxyUrl(href);
    if (proxiedHref) {
      styles.push(`<link rel="stylesheet" href="${this.escapeHtml(proxiedHref)}">`);
    }
  }

  // 2) Ambil inline style asli. Ini aman karena masuk iframe, bukan DOM utama.
  const styleRegex = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
  let styleMatch;
  while ((styleMatch = styleRegex.exec(html)) !== null) {
    const cleanedStyle = String(styleMatch[0] || '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .trim();
    if (cleanedStyle) styles.push(cleanedStyle);
  }

  return styles.join('\n');
}

export function sanitizePreviewHtml(html = '') {
  return String(html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<link\b(?=[^>]*rel=["']?stylesheet["']?)[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, '')
    .replace(/@font-face\s*{[\s\S]*?}/gi, '')
    .replace(/url\(["']?[^)"']*font\.php[^)]*\)/gi, 'none')
    .trim();
}

export function stripTemplateStylesFromHtml(html = '') {
  return this.sanitizePreviewHtml(
    String(html || '')
      .replace(/<!--\s*styles:start\s*-->[\s\S]*?<!--\s*styles:end\s*-->/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  );
}

export function getPreviewBaseCss() {
  return `
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100%;
      background: transparent;
      /* Fallback font jika CSS web asli gagal dimuat */
      font-family: system-ui, -apple-system, sans-serif;
    }

    /* Cegah interaksi di dalam preview */
    *, *::before, *::after {
      pointer-events: none !important;
    }

    .buddy-preview-root {
      width: 100%;
      padding: 10px;
      overflow: hidden;
      box-sizing: border-box;
    }

    /* * FALLBACK STRUKTUR:
     * Hanya memberi dimensi dasar pada form.
     * Dilarang memberi warna dominan agar tidak menimpa CSS web asli.
     */
    input, select, textarea {
      width: 100%;
      min-height: 36px;
      border: 1px solid #d6d3d1;
      border-radius: 6px;
      margin-top: 4px;
      box-sizing: border-box;
    }

    button, .btn {
      min-height: 36px;
      border-radius: 6px;
    }

    img, svg {
      max-width: 100%;
      height: auto;
    }

    /* MATIKAN LOADING SCREEN DARI WEB ASLI */
    .preloader, .loader, #loader, .spinner, [id*="loading"] {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
    }
  `;
}

export function buildElementPreviewSrcdoc(matchedEl) {
  // Masukkan link CDN Moodle SMPN 167 Jakarta secara eksplisit di dalam iframe
  // Iframe secara otomatis "mengurung" (isolate) CSS ini agar tidak bocor ke luar

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <link rel="stylesheet" type="text/css" href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,300..700&display=swap">
  <link rel="stylesheet" type="text/css" href="https://lms.smpn167jakarta.sch.id/theme/yui_combo.php?rollup/3.18.1/yui-moodlesimple-min.css">
  <link rel="stylesheet" type="text/css" href="https://lms.smpn167jakarta.sch.id/theme/styles.php/mb2nl/1776930830_1/all">

  <style>
    /* Isolasi Tambahan: Pastikan canvas iframe bersih */
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
    }

    /* CEGAH INTERAKSI (KLIK) DI DALAM PREVIEW */
    *, *::before, *::after {
      pointer-events: none !important;
    }

    /* Container khusus elemen agar rapi */
    .buddy-preview-root {
      width: 100%;
      padding: 12px;
      box-sizing: border-box;
      overflow: hidden;
    }

    /* Sembunyikan elemen loader bawaan Moodle jika terbawa */
    .preloader, .loader, #loader, [id*="loading"] {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
    }
  </style>
</head>
<body>
  <div class="buddy-preview-root">
    ${matchedEl.html || matchedEl.text}
  </div>
</body>
</html>`;
}

export function buildTemplatePreviewSrcdoc(template = this.activeTemplate) {
  const htmlPreview = this.sanitizePreviewHtml(template?.html_preview || '');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base target="_blank">
  <style>
    ${this.getPreviewBaseCss()}
    body { transform: scale(0.60); transform-origin: top left; width: 166%; background: #fff; }
  </style>
</head>
<body>
  ${htmlPreview}
</body>
</html>`;
}

export function scoreTemplateAgainstContext(template = {}, context = {}) {
  const title = this.normalizeMatchText(context.title || '');
  const heading = this.normalizeMatchText(context.heading || '');
  const url = this.normalizeMatchText(context.sourceUrl || context.url || '');
  const summary = this.normalizeMatchText(context.summary || '');
  const haystack = [title, heading, url, summary].filter(Boolean).join(' ');

  const matchTitle = this.normalizeMatchText(template.match_title_contains || '');
  const matchHeading = this.normalizeMatchText(template.match_heading_contains || '');
  const matchUrl = this.normalizeMatchText(template.match_url_contains || '');
  const pageType = this.normalizeMatchText(template.page_type || '');
  const templateName = this.normalizeMatchText(template.template_name || '');

  let score = 0;

  // Pencocokan KETAT: Title & Heading
  if (matchTitle && title.includes(matchTitle)) score += 100;
  if (matchHeading && heading.includes(matchHeading)) score += 90;

  // URL diturunkan drastis skornya agar tidak memicu false positive
  if (matchUrl && url.includes(matchUrl)) score += 30;

  if (pageType && haystack.includes(pageType)) score += 20;
  if (templateName && haystack.includes(templateName)) score += 10;

  const contextHasLogin = title.includes('login') || heading.includes('login') || url.includes('login') || summary.includes('login');
  const templateIsLogin = pageType === 'login' || matchTitle === 'login' || matchHeading === 'login' || matchUrl === 'login' || templateName.includes('login');

  // KILLER SWITCH: Jika template adalah Login, tapi judul halamannya BUKAN login,
  // hancurkan skor menjadi 0. Ini memastikan form login tidak akan nyasar ke form lain.
  if (templateIsLogin && !title.includes('login') && !heading.includes('login')) {
      return 0;
  }

  if (contextHasLogin && templateIsLogin) {
    score += 150;
  }

  return score;
}

// FUNGSI BARU: Sinkronisasi ke Backend
export async function syncSessionContext(pageContext) {
  if (!this.sessionId) return;
  try {
    // Pastikan ApiService.patch tersedia di modul fetch kamu. Jika belum, gunakan .put atau .post
    await ApiService.patch(`/chat/session/${this.sessionId}/context`, {
      pageContext,
      sourceUrl: pageContext.url || pageContext.sourceUrl || null
    });

    // Update storage sebagai fallback
    sessionStorage.setItem('alb_external_context', JSON.stringify(pageContext));
  } catch (err) {
    console.error('[BuddyPage] Gagal sync context ke server:', err);
  }
}

// PERBARUI FUNGSI INI
export async function applyTemplateToWorkspace(template, options = {}) {
  const normalized = this.normalizeTemplatePayload(template);
  this.activeTemplate = normalized;

  const elements = Array.isArray(normalized.elements_json) ? normalized.elements_json : [];

  // 1. Bentuk Konteks Baru
  const displayTitle = options.displayTitle || normalized.template_name || this.contextData?.title || 'Halaman VClass';

  this.contextData = {
    ...(this.contextData || {}),
    pageType: normalized.page_type || this.contextData?.pageType,
    templateName: normalized.template_name || this.contextData?.templateName,
    title: displayTitle,
    heading: displayTitle,
    sourceType: 'manual_template',
    elements
  };

  // 2. Bersihkan Selected Element Lama
  this.selectedElement = null;
  this.$selectedBar.addClass('hidden').removeClass('flex');
  this.$selectedText.empty();

  // 3. Update Title di UI (Sidebar & Welcome Message)
  this.$elTitle.text(displayTitle);
  this.$elWelcome.text(displayTitle);

  // 4. Render Ulang Chips dan List Elemen
  this.$suggestionChips.empty();
  this.renderSuggestionChips(elements);
  this.renderElementList(true);

  if (typeof this.renderTemplatePreview === 'function') {
    this.renderTemplatePreview(normalized);
  }

  // 5. Sinkronisasi ke Backend
  await this.syncSessionContext(this.contextData);
}

export async function autoMatchTemplateFromContext() {
  const context = this.contextData || {};
  const contextText = [context.title, context.heading, context.sourceUrl, context.url, context.summary].filter(Boolean).join(' ').trim();
  if (!contextText || !this.projectKey) return false;

  const applyIfValid = async (payload) => {
    const candidate = this.normalizeTemplatePayload(payload);
    const hasElements = Array.isArray(candidate.elements_json) && candidate.elements_json.length > 0;
    const hasPreview = !!candidate.html_preview;
    if (!candidate || (!hasElements && !hasPreview)) return false;

    // EVALUASI ULANG SECARA LOKAL: Jangan percaya mentah-mentah respons Backend
    const localScore = this.scoreTemplateAgainstContext(candidate, context);

    // Kalau skornya anjlok di bawah 50, tolak dan kembalikan false
    if (localScore < 50) {
      console.warn('[BuddyPage] Template ditolak karena skor lokal terlalu rendah:', localScore);
      return false;
    }

    await this.applyTemplateToWorkspace(candidate, {
      displayTitle: context.heading || context.title || candidate.template_name
    });
    return true;
  };

  // Coba match via endpoint backend
  try {
    if (this.sessionId) {
      const res = await ApiService.get(`/page-templates/match?projectKey=${this.projectKey}&sessionId=${this.sessionId}`);
      if (res.status === 'success' && res.data) {
        const ok = await applyIfValid(res.data);
        if (ok) return true;
      }
    }
  } catch (e) {
    console.warn('[BuddyPage] Auto match via endpoint gagal:', e);
  }

  // Fallback client-side matching
  try {
    const resList = await ApiService.get(`/page-templates/list?projectKey=${this.projectKey}&full=1`);
    const templates = this.extractTemplateList(resList.data);
    const ranked = templates
      .map(t => ({ template: t, score: this.scoreTemplateAgainstContext(t, context) }))
      .filter(item => item.score >= 50)
      .sort((a, b) => b.score - a.score);

    if (ranked.length > 0) {
      await this.applyTemplateToWorkspace(ranked[0].template, {
        displayTitle: context.heading || context.title || ranked[0].template.template_name
      });
      return true;
    }
  } catch (e) {
    console.warn('[BuddyPage] Auto match via list template gagal:', e);
  }

  return false;
}
export function renderElementList(skipFallback = false) {
  this.$elList.empty();
  const elements = this.contextData.elements || [];

  if (elements.length === 0) {
    if (skipFallback) {
      // Dipanggil setelah user memilih template manual — jangan loop fallback lagi.
      // Template ini memang belum punya elements_json, tampilkan pesan informatif saja.
      this.$elList.html(`
        <div class="bg-surface-card border border-hairline rounded-xl p-4 text-center">
          <i class="fa-solid fa-circle-info text-muted-soft text-xl mb-2"></i>
          <p class="text-[13px] text-muted leading-relaxed">Template <span class="font-semibold text-ink">${this.escapeHtml(this.$elTitle.text())}</span> belum memiliki elemen terdaftar.</p>
          <p class="text-[12px] text-muted-soft mt-1">Kamu tetap bisa bertanya langsung di kolom chat.</p>
        </div>
      `);
      return;
    }
    this.triggerManualFallback();
    return;
  }

  this._renderElementCards(elements);
}

export function _renderElementCards(elements) {
  elements.forEach((el, idx) => {
    const safeName = this.escapeHtml(el.name || `@element${idx + 1}`);
    const safeType = this.escapeHtml(el.type || 'Elemen');
    const safeTitle = this.escapeHtml(el.title || '');
    const safeText = this.escapeHtml(el.text || 'Tidak ada teks konten.');

    // Preview elemen wajib diisolasi. Jangan inject style/link template langsung ke DOM workspace.
    const previewSrcdoc = this.buildElementPreviewSrcdoc(el, this.activeTemplate);
    const safePreviewSrcdoc = this.escapeHtml(previewSrcdoc);

    // Perhatikan tambahan atribut data-key dan ID agar mudah di-highlight oleh sistem tutorial
    const cardHtml = `
      <div class="element-card bg-surface-card border border-hairline rounded-xl mb-3 overflow-hidden shadow-sm transition-all duration-300" id="accordion-${el.key}">

        <div class="p-4 bg-surface-strong cursor-pointer buddy-accordion-toggle flex justify-between items-center group">
          <div>
            <div class="font-bold text-ink text-[14px]">${safeName}</div>
            <div class="text-[12px] text-muted-soft mt-0.5">${safeType} · ${safeTitle}</div>
          </div>
          <i class="fa-solid fa-chevron-down text-muted-soft transition-transform duration-300 buddy-accordion-icon"></i>
        </div>

        <div class="hidden bg-white p-4 border-t border-hairline buddy-accordion-body">
          <div class="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Konten Teks</div>
          <div class="text-[13px] text-body leading-relaxed mb-4 line-clamp-4">${safeText}</div>

          <div class="flex gap-2 mb-2">
            <button type="button" class="btn-ask-element flex-1 bg-surface-strong text-ink border border-hairline-strong rounded-lg py-2 text-[13px] font-medium hover:bg-hairline-strong transition-colors">
              <i class="fa-solid fa-comments mr-1"></i> Tanya
            </button>
            <button type="button" class="btn-visualize-element flex-1 bg-transparent text-ink border border-hairline-strong rounded-lg py-2 text-[13px] font-medium hover:bg-surface-strong transition-colors">
              <i class="fa-solid fa-eye mr-1"></i> Visual
            </button>
          </div>

          <div class="visual-container hidden mt-3 p-2 border border-hairline rounded-lg bg-[#f9fafb] overflow-hidden relative">
             <iframe
               class="buddy-element-preview-frame w-full h-[220px] rounded-lg bg-white border-0"
               sandbox=""
               referrerpolicy="no-referrer"
               loading="lazy"
               srcdoc="${safePreviewSrcdoc}"
             ></iframe>
          </div>
        </div>
      </div>
    `;

    const $card = $(cardHtml);

    // Event: Buka Tutup Accordion Utama
    $card.find('.buddy-accordion-toggle').on('click', function() {
      const $body = $card.find('.buddy-accordion-body');
      const $icon = $(this).find('.buddy-accordion-icon');

      // Tutup accordion lain yang sedang terbuka
      $('.buddy-accordion-body').not($body).slideUp(200).addClass('hidden');
      $('.buddy-accordion-icon').not($icon).removeClass('rotate-180');

      if ($body.hasClass('hidden')) {
        $body.removeClass('hidden').hide().slideDown(200);
        $icon.addClass('rotate-180');
      } else {
        $body.slideUp(200, function() { $(this).addClass('hidden'); });
        $icon.removeClass('rotate-180');
      }
    });

    // Event: Klik Tombol "Tanya"
    $card.find('.btn-ask-element').on('click', () => {
       this.handleSelectElement(el);
       if(window.innerWidth < 768) this.closeContextSidebar(); // Auto tutup di mobile
    });

    // Event: Klik Tombol "Visual" (munculin HTML)
    $card.find('.btn-visualize-element').on('click', function() {
       const $vis = $card.find('.visual-container');
       if ($vis.hasClass('hidden')) {
          $vis.removeClass('hidden').hide().slideDown(200);
          $(this).addClass('bg-surface-strong');
       } else {
          $vis.slideUp(200, function(){ $(this).addClass('hidden'); });
          $(this).removeClass('bg-surface-strong');
       }
    });

    this.$elList.append($card);
  });
}

export function showOnboardingCarousel() {
  // 1. Siapkan Style CSS Global untuk efek Highlight/Glow
  if (!$('#tour-style').length) {
    $('head').append(`
      <style id="tour-style">
        #tour-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(2px);
          z-index: 9000;
          transition: opacity 0.3s ease;
        }

        .tour-highlight {
          position: relative !important;
          z-index: 9001 !important;
          box-shadow: 0 0 0 4px #3b82f6, 0 10px 25px rgba(0,0,0,0.35) !important;
          pointer-events: none !important;
          transition: all 0.3s ease;
        }

        #context-sidebar.tour-highlight {
          background-color: #fafaf9 !important;
          border-radius: 0 16px 16px 0 !important;
        }

        #chat-form.tour-highlight {
          background-color: #ffffff !important;
          border-radius: 24px !important;
        }

        #btn-session-info.tour-highlight {
          background-color: #ffffff !important;
          border-radius: 9999px !important;
        }

        .tour-spotlight-clone {
          position: fixed !important;
          z-index: 9003 !important;
          pointer-events: none !important;
          box-shadow: 0 0 0 4px #3b82f6, 0 10px 25px rgba(0,0,0,0.35) !important;
          border-radius: 9999px !important;
          background: #ffffff !important;
        }

        .tour-label {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          margin: 0 2px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.4;
          white-space: nowrap;
          vertical-align: middle;
        }

        .tour-label-primary {
          color: #1d4ed8;
          background: #dbeafe;
          border: 1px solid #93c5fd;
        }

        .tour-label-warning {
          color: #92400e;
          background: #fef3c7;
          border: 1px solid #fbbf24;
        }

        .tour-label-danger {
          color: #b91c1c;
          background: #fee2e2;
          border: 1px solid #fca5a5;
        }

        .tour-label-success {
          color: #047857;
          background: #d1fae5;
          border: 1px solid #6ee7b7;
        }

        .tour-card {
          position: fixed !important;
        }
      </style>
    `);
  }

  // 2. Buat Overlay jika belum ada
  if (!$('#tour-overlay').length) {
    $('body').append('<div id="tour-overlay" class="hidden"></div>');
  }

  const $overlay = $('#tour-overlay');
  const $modalWrapper = $('#onboarding-modal');
  const $slidesContainer = $('#onboarding-slides');

  $modalWrapper
    .removeClass('hidden bg-canvas/95 backdrop-blur-md')
    .css('z-index', '9002')
    .addClass('pointer-events-none');

  $overlay.removeClass('hidden');

  const steps = [
    {
      title: "Selamat Datang di AI Buddy!",
      icon: "fa-robot",
      desc: `
        Asisten belajarmu siap membantu saat belajar di VClass.
        <br><br>
        <span class="tour-label tour-label-primary">
          <i class="fa-solid fa-circle-info"></i> Catatan
        </span>
        AI ini bukan untuk memberikan jawaban instan, tapi membantumu memahami materi dan menemukan jawabannya sendiri.
      `,
      target: null,
      placement: "center"
    },
    {
      title: "Panel Konteks Halaman",
      icon: "fa-list",
      desc: `
        Panel di sebelah kiri berisi daftar bagian penting dari halaman VClass yang sedang kamu buka.
        <br><br>
        Kamu bisa memilih salah satu item di panel tersebut agar AI tahu bagian mana yang ingin kamu tanyakan.
      `,
      target: "#context-sidebar",
      placement: "center",
      mobilePlacement: "mobile-sidebar",
      onEnter: () => {
        if (window.innerWidth < 768) {
          $('#btn-open-context').click();
        }
      }
    },
    {
      title: "Batas Sesi Chat",
      icon: "fa-battery-three-quarters",
      desc: `
        Sistem dibatasi
        <span class="tour-label tour-label-warning">
          <i class="fa-solid fa-bolt"></i> 3 chat berurut
        </span>
        agar server tetap stabil.
        <br><br>
        Jika batas tercapai, AI Buddy akan masuk mode
        <span class="tour-label tour-label-danger">
          <i class="fa-solid fa-hourglass-half"></i> cooldown 3 menit
        </span>.
        <br><br>
        Selama cooldown berjalan, AI tidak bisa digunakan sampai waktu jeda selesai.
      `,
      target: "#btn-session-info",
      placement: "center",
      cloneTarget: true,
      onEnter: () => {
        if (window.innerWidth < 768) {
          $('#btn-close-context').click();
        }
      }
    },
    {
      title: "Input & Shortcut Pintasan",
      icon: "fa-keyboard",
      desc: `
        Ketik pertanyaanmu di kolom input ini.
        <br><br>
        Gunakan kata sandi
        <span class="tour-label tour-label-primary">
          <i class="fa-solid fa-message"></i> tanya
        </span>
        atau
        <span class="tour-label tour-label-success">
          <i class="fa-solid fa-book-open"></i> materi
        </span>
        untuk memunculkan saran pertanyaan kilat secara otomatis.
      `,
      target: "#chat-form",
      placement: "center"
    },
    {
      title: "Aturan & Bantuan Instruktur",
      icon: "fa-shield-halved",
      desc: `
        Gunakan AI Buddy dengan sopan saat belajar.
        <br><br>
        Jika terdeteksi kata kasar, sistem bisa memberi
        <span class="tour-label tour-label-danger">
          <i class="fa-solid fa-triangle-exclamation"></i> strike Lockdown
        </span>
        dan chat akan dikunci.
        <br><br>
        Jika terkena Lockdown, kamu harus menunggu guru memberikan
        <span class="tour-label tour-label-warning">
          <i class="fa-solid fa-key"></i> unlock key
        </span>
        untuk membuka kembali chat.
        <br><br>
        Kalau benar-benar kesulitan, ketik
        <span class="tour-label tour-label-primary">
          <i class="fa-solid fa-circle-question"></i> bingung
        </span>
        agar muncul bantuan menuju
        <span class="tour-label tour-label-success">
          <i class="fa-brands fa-whatsapp"></i> WhatsApp Guru
        </span>.
      `,
      target: null,
      placement: "center"
    }
  ];

  let currentStep = 0;

  const clearHighlight = () => {
    $('.tour-highlight').removeClass('tour-highlight');
    $('.tour-spotlight-clone').remove();
  };

  const createSpotlightClone = (targetSelector) => {
    const $target = $(targetSelector);
    if (!$target.length) return;

    const rect = $target[0].getBoundingClientRect();
    const $clone = $target.clone(false, false);

    $clone
      .removeAttr('id')
      .addClass('tour-spotlight-clone')
      .css({
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: 0,
        transform: 'none'
      });

    $('body').append($clone);
  };

  const positionCard = ($card, step) => {
    const isMobile = window.innerWidth < 768;

    // Desktop: modal selalu di tengah, tidak pindah-pindah
    if (!isMobile) {
      $card.css({
        top: '50%',
        left: '50%',
        right: 'auto',
        bottom: 'auto',
        transform: 'translate(-50%, -50%)'
      });
      return;
    }

    // Mobile khusus tahap sidebar: diturunkan lagi sekitar 30px
    if (step.mobilePlacement === 'mobile-sidebar') {
      $card.css({
        top: 'calc(58% + 30px)',
        left: '50%',
        right: 'auto',
        bottom: 'auto',
        transform: 'translate(-50%, -50%)'
      });
      return;
    }

    // Mobile default tetap tengah
    $card.css({
      top: '50%',
      left: '50%',
      right: 'auto',
      bottom: 'auto',
      transform: 'translate(-50%, -50%)'
    });
  };

  const renderStep = () => {
    clearHighlight();

    const step = steps[currentStep];
    const isLast = currentStep === steps.length - 1;

    if (step.onEnter) step.onEnter();

    $slidesContainer.html(`
      <div class="tour-card bg-surface-card border border-hairline p-6 md:p-8 rounded-2xl shadow-2xl max-w-[400px] w-[90vw] transition-all duration-300 ease-in-out pointer-events-auto">
        <div class="absolute top-4 right-5 text-[12px] font-bold text-muted-soft bg-canvas border border-hairline rounded-full px-3 py-1">
          ${currentStep + 1} / ${steps.length}
        </div>

        <div class="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center text-2xl mb-5">
          <i class="fa-solid ${step.icon}"></i>
        </div>

        <h2 class="text-xl font-serif text-ink mb-3 font-semibold">
          ${step.title}
        </h2>

        <div class="text-body text-[14px] mb-8 leading-relaxed">
          ${step.desc}
        </div>

        <div class="flex gap-3">
          ${currentStep > 0 ? `
            <button id="btn-prev-step" class="flex-1 border border-hairline-strong text-ink rounded-xl py-2.5 text-[14px] font-medium hover:bg-surface-strong transition">
              Kembali
            </button>
          ` : ''}

          <button id="btn-next-step" class="flex-1 bg-primary text-white rounded-xl py-2.5 text-[14px] font-semibold hover:bg-primary-active transition shadow-sm">
            ${isLast ? 'Mulai Belajar <i class="fa-solid fa-check ml-1"></i>' : 'Lanjut <i class="fa-solid fa-arrow-right ml-1"></i>'}
          </button>
        </div>
      </div>
    `);

    if (step.target && $(step.target).length) {
      if (step.cloneTarget) {
        createSpotlightClone(step.target);
      } else {
        $(step.target).addClass('tour-highlight');
      }
    }

    const $card = $slidesContainer.find('.tour-card');
    positionCard($card, step);

    $('#btn-next-step').off('click').on('click', () => {
      if (isLast) {
        finishTour();
      } else {
        currentStep++;
        renderStep();
      }
    });

    $('#btn-prev-step').off('click').on('click', () => {
      currentStep--;
      renderStep();
    });
  };

  const finishTour = () => {
    localStorage.setItem('alb_external_onboarding_seen', '1');
    clearHighlight();

    $overlay.addClass('hidden');

    $modalWrapper
      .addClass('hidden bg-canvas/95 backdrop-blur-md')
      .removeClass('pointer-events-none')
      .css('z-index', '');
  };

  renderStep();
}

// --- FUNGSI BARU: RENDER TEMPLATE PREVIEW ---
export function renderTemplatePreview(template) {
  const $panel = $('#template-preview-panel');
  const $iframe = $('#template-preview-iframe');
  const $badge = $('#template-name-badge');

  if (template.html_preview) {
     $panel.removeClass('hidden');
     $badge.text(template.template_name);
     $iframe.attr('sandbox', '');
     $iframe.attr('referrerpolicy', 'no-referrer');

     const htmlContent = this.buildTemplatePreviewSrcdoc(template);
     $iframe.attr('srcdoc', htmlContent);
  }
}

// --- FUNGSI BARU: HIGHLIGHT ELEMENT (TUTORIAL) ---
export function highlightElementInPreview(elementKey) {
  const $targetCard = $(`#accordion-${elementKey}`);

  // Jika tidak ditemukan di sidebar, batalkan
  if (!$targetCard.length) return;

  // 1. Gulung sidebar agar elemen terlihat (Scroll to view)
  $('#element-list').animate({
      scrollTop: $('#element-list').scrollTop() + $targetCard.position().top - 20
  }, 500);

  // 2. Jika accordion masih tertutup, buka!
  const $body = $targetCard.find('.buddy-accordion-body');
  if ($body.hasClass('hidden')) {
      $targetCard.find('.buddy-accordion-toggle').click();
  }

  // 3. Tambahkan efek glow (Highlight) berwarna biru primary
  $targetCard.css({
      'box-shadow': '0 0 0 4px rgba(59, 130, 246, 0.4)',
      'border-color': '#3b82f6',
      'transform': 'scale(1.02)'
  });

  // 4. Hilangkan efek highlight secara halus setelah 3 detik
  setTimeout(() => {
      $targetCard.css({
          'box-shadow': '',
          'border-color': '',
          'transform': 'scale(1)'
      });
  }, 3000);
}

// --- FUNGSI BARU: TRIGGER CHIPS ---
export function handleTriggerWords(text) {
  const value = text.toLowerCase();
  const isTanya = value.includes('tanya');
  const isMateri = value.includes('materi');
  const isBingung = value.includes('bingung');

  // Jika tidak ada trigger word, tutup area chips secara halus
  if (!isTanya && !isMateri && !isBingung) {
     this.$suggestionWrapper.stop(true, true).slideUp(200, () => {
         this.$suggestionWrapper.addClass('hidden pointer-events-none');
     });
     this.isSuggestionHidden = true;
     return;
  }

  let suggestions = [];

  // Deteksi trigger dari template yang aktif
  if (this.activeTemplate && Array.isArray(this.activeTemplate.question_suggestions_json)) {
      suggestions = this.activeTemplate.question_suggestions_json.filter(q => value.includes((q.trigger_word || '').toLowerCase()));
  }

  // Jika belum ada template aktif, gunakan fallback bawaan
  if (suggestions.length === 0) {
      if (isTanya) {
          suggestions.push({ suggestion_text: "Tanya cara login/masuk" });
          suggestions.push({ suggestion_text: "Tanya cara mengumpulkan tugas" });
      }
      if (isMateri) {
          suggestions.push({ suggestion_text: "Buka ringkasan materi terbaru" });
      }
      if (isBingung) {
          suggestions.push({ suggestion_text: "Saya bingung, tolong hubungkan ke guru" });
      }
  }

  if (suggestions.length > 0) {
     this.$suggestionChips.empty();

     suggestions.forEach(q => {
       const $btn = $(`<button type="button" class="shrink-0 bg-surface-card border border-primary/30 text-[13px] font-medium text-primary px-4 py-1.5 rounded-full hover:bg-primary hover:text-white transition-colors whitespace-nowrap shadow-sm"><i class="fa-solid fa-lightbulb mr-1"></i> ${this.escapeHtml(q.suggestion_text)}</button>`);

       $btn.on('click', () => {
        this.$inputArea.val(q.suggestion_text);

        // Sembunyikan chips saat diklik
        this.$suggestionWrapper.stop(true, true).slideUp(200, () => {
            this.$suggestionWrapper.addClass('hidden pointer-events-none');
        });
        this.isSuggestionHidden = true;

        // LANGSUNG KIRIM PESAN SETELAH CHIP DIKLIK
        setTimeout(() => {
           this.$btnSend.click();
        }, 100);
     });

       this.$suggestionChips.append($btn);
     });

     // PAKSA Munculkan chips dengan mulus
     this.$suggestionWrapper.removeClass('hidden pointer-events-none').stop(true, true).slideDown(200);
     this.isSuggestionHidden = false;
  }
}

export async function renderPersistentManualContextSelector() {
  if (!this.$contextSidebar?.length || !this.projectKey) return;

  const $header = this.$contextSidebar.children().first();
  if (!$header.length) return;

  let $box = $('#manual-context-switcher');
  if (!$box.length) {
    $box = $(`
      <details id="manual-context-switcher" class="mt-5 pt-4 border-t border-hairline group">
        <summary class="list-none cursor-pointer select-none rounded-xl border border-hairline bg-white/70 hover:bg-white transition-colors px-3.5 py-3 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <div class="min-w-0">
            <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted flex items-center gap-2">
              <i class="fa-solid fa-right-left text-[11px] text-muted-soft"></i>
              Ganti Konteks Manual
            </div>
            <div class="text-[11px] text-muted-soft mt-0.5 leading-snug">Opsional, buka kalau deteksi otomatis kurang sesuai.</div>
          </div>
          <i class="fa-solid fa-chevron-down text-muted-soft text-[12px] shrink-0 transition-transform duration-200 group-open:rotate-180"></i>
        </summary>

        <div class="pt-3 pl-0.5 pr-0.5">
          <select id="persistent-context-select" class="w-full bg-white border border-hairline rounded-lg px-3 py-2 text-[12px] text-ink focus:outline-none focus:border-primary">
            <option value="" selected disabled>Memuat konteks...</option>
          </select>
          <div id="persistent-context-help" class="mt-2 text-[11px] text-muted-soft leading-snug">
            Pilihan ini tidak mengubah halaman asli. Ini hanya mengganti konteks visual dan bantuan AI di sidebar.
          </div>
        </div>
      </details>
    `);
    $header.append($box);
  }

  const $select = $('#persistent-context-select');
  $select.prop('disabled', true).html('<option value="" selected disabled>Memuat konteks...</option>');

  try {
    const res = await ApiService.get(`/page-templates/list?projectKey=${this.projectKey}&full=1`);
    const templates = this.extractTemplateList(res.data)
      .map(t => this.normalizeTemplatePayload(t))
      .filter(t => t && (t.page_type || t.template_name));

    this.availablePageTemplates = templates;

    if (!templates.length) {
      $select.html('<option value="" selected disabled>Template belum tersedia</option>');
      return;
    }

    let options = '<option value="" selected>-- Pilih / pindah konteks --</option>';
    templates.forEach((t, idx) => {
      const label = t.template_name || t.page_type || `Template ${idx + 1}`;
      const typeBadge = t.page_type ? ` (${t.page_type})` : '';
      options += `<option value="${idx}">${this.escapeHtml(label + typeBadge)}</option>`;
    });

    $select.prop('disabled', false).html(options);

    // Di dalam fungsi renderPersistentManualContextSelector()
    $select.off('change').on('change', async (e) => {
      const selectedIndex = e.target.value;
      if (selectedIndex === '') return;
      const template = templates[Number(selectedIndex)];
      if (!template) return;

      const oldHtml = $select.html();
      $select.prop('disabled', true).html('<option selected>Memasang konteks...</option>');

      try {
        await this.applyTemplateToWorkspace(template, {
          // KETIKA DIPILIH MANUAL: PAKSA TIMPA JUDUL DENGAN NAMA TEMPLATE
          displayTitle: template.template_name || template.page_type
        });
        this.appendBubble(`Konteks halaman diganti manual ke: ${template.template_name || template.page_type}.`, false, 'system');
      } catch (err) {
        console.error('[BuddyPage] Gagal ganti konteks manual:', err);
        this.appendBubble('Konteks manual gagal dipasang. Coba pilih konteks lain atau refresh halaman.', false, 'system');
      } finally {
        $select.prop('disabled', false).html(oldHtml).val('');
      }
    });
  } catch (err) {
    console.error('[BuddyPage] Gagal memuat daftar konteks manual:', err);
    $select.html('<option value="" selected disabled>Gagal memuat konteks</option>');
  }
}


export function renderManualTemplateSelector(availableTemplates = []) {
  this.$elList.empty();
  $('#template-preview-panel').addClass('hidden');

  const templates = this.extractTemplateList(availableTemplates)
    .map(t => this.normalizeTemplatePayload(t))
    .filter(t => t && (t.page_type || t.template_name));

  const contextTitle = this.contextData?.heading || this.contextData?.title || 'halaman ini';
  const contextInfo = this.escapeHtml(contextTitle);

  if (!templates.length) {
    this.$elList.html(`
      <div class="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-4">
        <div class="text-[13px] text-amber-800 font-semibold mb-2">
          <i class="fa-solid fa-triangle-exclamation mr-1"></i> Konteks belum tersedia
        </div>
        <p class="text-[12px] text-amber-700 leading-relaxed">
          Sistem membaca judul <span class="font-semibold">${contextInfo}</span>, tetapi daftar template tidak berhasil dimuat dari server.
        </p>
      </div>
    `);
    return;
  }

  let optionsHtml = '<option value="" disabled selected>-- Pilih konteks halaman --</option>';
  templates.forEach((t, idx) => {
    const label = t.template_name || t.page_type || `Template ${idx + 1}`;
    const typeBadge = t.page_type ? ` (${t.page_type})` : '';
    optionsHtml += `<option value="${idx}">${this.escapeHtml(label + typeBadge)}</option>`;
  });

  const fallbackHtml = `
    <div class="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-3">
      <div class="text-[13px] text-amber-800 font-semibold mb-2">
        <i class="fa-solid fa-triangle-exclamation mr-1"></i> Konteks halaman belum cocok otomatis
      </div>
      <p class="text-[12px] text-amber-700 leading-relaxed mb-3">
        Sistem membaca judul <span class="font-semibold">${contextInfo}</span>, tetapi elemen halaman belum berhasil dipasang otomatis.
        Kamu bisa ganti / pindah konteks halaman secara manual di bawah ini.
      </p>

      <select id="manual-page-select" class="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-amber-500">
        ${optionsHtml}
      </select>

      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" id="btn-auto-rematch-context" class="bg-white border border-amber-300 text-amber-800 rounded-lg px-3 py-2 text-[12px] font-semibold hover:bg-amber-100 transition-colors">
          <i class="fa-solid fa-rotate mr-1"></i> Coba deteksi ulang
        </button>
        <button type="button" id="btn-suggest-change-context" class="bg-white border border-amber-300 text-amber-800 rounded-lg px-3 py-2 text-[12px] font-semibold hover:bg-amber-100 transition-colors">
          <i class="fa-solid fa-lightbulb mr-1"></i> Saran ganti konteks
        </button>
      </div>
    </div>
    <div id="manual-elements-area" class="space-y-3"></div>
  `;

  this.$elList.append(fallbackHtml);

// Di dalam fungsi renderManualTemplateSelector()
const applySelectedTemplate = async (selectedIndex) => {
  const template = templates[Number(selectedIndex)];
  if (!template) return;

  $('#loading-manual, .manual-load-error').remove();
  $('#manual-elements-area').html('<div id="loading-manual" class="text-center py-4 text-muted text-[12px]"><i class="fa-solid fa-spinner fa-spin"></i> Memuat elemen...</div>');

  try {
    await this.applyTemplateToWorkspace(template, {
      // PERBAIKAN: Karena ini dipilih manual, paksa ganti judul ke nama template
      displayTitle: template.template_name || template.page_type
    });

    this.appendBubble(`Konteks halaman diganti ke: ${template.template_name || template.page_type}.`, false, 'system');
  } catch (err) {
    $('#loading-manual').remove();
    $('#manual-elements-area').html('<div class="manual-load-error text-semantic-error text-[12px] text-center mt-2">Gagal memasang template pilihan.</div>');
    console.error('[BuddyPage] Gagal apply template manual:', err);
  }
};

  $('#manual-page-select').off('change').on('change', (e) => {
    applySelectedTemplate(e.target.value);
  });

  $('#btn-auto-rematch-context').off('click').on('click', async () => {
    $('#manual-elements-area').html('<div id="loading-manual" class="text-center py-4 text-muted text-[12px]"><i class="fa-solid fa-spinner fa-spin"></i> Mendeteksi ulang...</div>');
    const ok = await this.autoMatchTemplateFromContext();
    if (!ok) {
      $('#loading-manual').remove();
      $('#manual-elements-area').html('<div class="manual-load-error text-[12px] text-amber-700 text-center mt-2">Belum ketemu otomatis. Pilih konteks lewat dropdown di atas.</div>');
    }
  });

  $('#btn-suggest-change-context').off('click').on('click', () => {
    this.$suggestionChips.empty();

    templates.slice(0, 6).forEach((t, idx) => {
      const label = t.template_name || t.page_type || `Template ${idx + 1}`;
      const $btn = $(`<button type="button" class="shrink-0 bg-surface-card border border-amber-300 text-[13px] font-medium text-amber-800 px-4 py-1.5 rounded-full hover:bg-amber-100 transition-colors whitespace-nowrap shadow-sm"><i class="fa-solid fa-right-left mr-1"></i> ${this.escapeHtml(label)}</button>`);
      $btn.on('click', () => applySelectedTemplate(idx));
      this.$suggestionChips.append($btn);
    });

    this.$suggestionWrapper.removeClass('hidden pointer-events-none').stop(true, true).slideDown(200);
    this.isSuggestionHidden = false;
  });
}
