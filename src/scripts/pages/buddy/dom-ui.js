import $ from 'jquery';
import { ApiService } from '../../fetch/api.js';
import Toast from '../../components/toast.js';
import { buildElementsForPage, resolvePageKeyFromContext, PAGE_ELEMENTS } from './pageElements.js';

function formatCooldownTime(seconds = 0) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
  const s = (safeSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function getCooldownStorageKey(sessionId = '') {
  return `alb_ai_cooldown_until_${sessionId || 'default'}`;
}

function saveCooldownEnd(sessionId, remainingSeconds = 0) {
  if (!sessionId || remainingSeconds <= 0) return;

  const endsAt = Date.now() + (Number(remainingSeconds) * 1000);
  localStorage.setItem(getCooldownStorageKey(sessionId), String(endsAt));
}

function getStoredCooldownRemaining(sessionId) {
  if (!sessionId) return 0;

  const raw = localStorage.getItem(getCooldownStorageKey(sessionId));
  const endsAt = Number(raw || 0);
  if (!endsAt) return 0;

  const remaining = Math.ceil((endsAt - Date.now()) / 1000);

  if (remaining <= 0) {
    localStorage.removeItem(getCooldownStorageKey(sessionId));
    return 0;
  }

  return remaining;
}

function clearStoredCooldown(sessionId) {
  if (!sessionId) return;
  localStorage.removeItem(getCooldownStorageKey(sessionId));
}

function getUsageChip($chatCountDisplay) {
  return $chatCountDisplay.closest('#btn-session-info, .session-info, button, div');
}

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
  this.$tabBtnGuide = $('#tab-btn-guide');
  this.$tabBtnElements = $('#tab-btn-elements');
  this.$tabContentGuide = $('#tab-content-guide');

  this.$modeToggleBtn = $('#btn-mode-dropdown-toggle');
  this.$modeMenu = $('#response-mode-menu');
  this.$currentModeLabel = $('#current-mode-label');
}

// [#6] Modal info konteks: tampilkan judul halaman lengkap (yang di mobile di-truncate)
// beserta keterangan singkat & sumber, supaya siswa tetap bisa membaca konteks penuh.
export function openContextInfoModal() {
  const fullTitle = (this.$elTitle?.text() || '').trim() || 'Halaman VClass';
  const sourceUrl = this.contextData?.sourceUrl || this.contextData?.url || '';
  const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  $('#alb-context-info-modal').remove();
  const sourceHtml = sourceUrl
    ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:text-primary-active break-all"><i class="fa-solid fa-up-right-from-square text-[11px]"></i> Buka di VClass</a>`
    : '';

  $('body').append(`
    <div id="alb-context-info-modal" class="fixed inset-0 z-[9760] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-surface-card w-full max-w-[460px] rounded-2xl shadow-2xl border border-hairline overflow-hidden">
        <div class="px-5 py-4 border-b border-hairline flex items-center justify-between gap-2">
          <span class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted flex items-center gap-2"><i class="fa-solid fa-circle-info text-primary"></i> Info Konteks Halaman</span>
          <button type="button" class="alb-context-info-close w-8 h-8 rounded-full hover:bg-surface-strong flex items-center justify-center text-muted border-0 bg-transparent cursor-pointer"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="p-5 space-y-3">
          <h3 class="font-serif text-xl text-ink leading-snug">${esc(fullTitle)}</h3>
          <p class="text-[13px] text-muted-soft leading-relaxed">Ini halaman VClass yang sedang aku baca. Pilih teks/elemen yang ingin kamu tanyakan, atau langsung ketik pertanyaanmu.</p>
          ${sourceHtml}
        </div>
        <div class="px-5 py-4 border-t border-hairline bg-canvas-soft flex justify-end">
          <button type="button" class="alb-context-info-close bg-primary hover:bg-primary-active text-white rounded-full px-5 py-2 text-[13px] font-bold border-0 cursor-pointer">Mengerti</button>
        </div>
      </div>
    </div>
  `);
  $('#alb-context-info-modal').on('click', (e) => { if (e.target.id === 'alb-context-info-modal') $('#alb-context-info-modal').remove(); });
  $('#alb-context-info-modal').on('click', '.alb-context-info-close', () => $('#alb-context-info-modal').remove());
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

export function updateAiUsageUI(usage = {}) {
  const max = Number(usage.max || 3);
  const used = Number(usage.used || 0);

  let remainingSeconds = Number(usage.cooldown_remaining_seconds || 0);

  // Pakai nilai terbesar antara backend dan localStorage.
  // Ini mencegah overlay hilang ketika refresh saat timer tinggal < 1 menit.
  const storedRemaining = getStoredCooldownRemaining(this.sessionId);
  remainingSeconds = Math.max(remainingSeconds, storedRemaining);

  const isLimitReached = used >= max || Boolean(usage.limit_reached);
  const isCooldownActive = Boolean(usage.cooldown_active) || remainingSeconds > 0;

  this.aiUsage = {
    ...usage,
    used,
    max,
    remaining: Math.max(0, max - used),
    cooldown_active: isCooldownActive,
    cooldown_remaining_seconds: remainingSeconds,
    canUseAI: !isCooldownActive && usage.canUseAI !== false
  };

  this.$chatCountDisplay.text(used);

  const $chip = getUsageChip(this.$chatCountDisplay);

  $chip.removeClass('border-red-300 bg-red-50 text-red-700 ring-2 ring-red-100');
  this.$chatCountDisplay.removeClass('text-red-600 font-black');

  if (isCooldownActive || isLimitReached) {
    $chip.addClass('border-red-300 bg-red-50 text-red-700 ring-2 ring-red-100');
    this.$chatCountDisplay.addClass('text-red-600 font-black');
  }

  if (isLimitReached && !isCooldownActive && !this._limitToastShown) {
    Toast.show('Kuota AI Buddy sudah mencapai 3/3. Request AI berikutnya akan menunggu cooldown.', 'warning');
    this._limitToastShown = true;
  }

  if (isCooldownActive) {
    this.triggerCooldown();
    return;
  }

  clearStoredCooldown(this.sessionId);
  this._cooldownToastShown = false;

  if (!isLimitReached) {
    this._limitToastShown = false;
  }

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
  this.$inputArea
    .prop('disabled', true)
    .attr('placeholder', 'AI sedang cooldown. Tunggu waktu jeda selesai...');

  this.$btnSend.prop('disabled', true);
  this.$cooldownOverlay.removeClass('hidden');

  let timeLeft = 0;

  if (this.aiUsage && Number(this.aiUsage.cooldown_remaining_seconds) > 0) {
    timeLeft = Number(this.aiUsage.cooldown_remaining_seconds);
  }

  const storedRemaining = getStoredCooldownRemaining(this.sessionId);
  timeLeft = Math.max(timeLeft, storedRemaining);

  if (!timeLeft || timeLeft <= 0) {
    timeLeft = 180;
  }

  saveCooldownEnd(this.sessionId, timeLeft);

  this.$timerDisplay.text(formatCooldownTime(timeLeft));

  clearInterval(this.cooldownInterval);

  this.cooldownInterval = setInterval(() => {
    timeLeft = Math.max(0, timeLeft - 1);

    if (this.aiUsage) {
      this.aiUsage.cooldown_remaining_seconds = timeLeft;
      this.aiUsage.cooldown_active = timeLeft > 0;
      this.aiUsage.canUseAI = false;
    }

    this.$timerDisplay.text(formatCooldownTime(timeLeft));

    if (timeLeft <= 0) {
      clearInterval(this.cooldownInterval);
      clearStoredCooldown(this.sessionId);

      if (this.aiUsage) {
        this.aiUsage.cooldown_active = false;
        this.aiUsage.cooldown_remaining_seconds = 0;
        this.aiUsage.used = 0;
        this.aiUsage.remaining = this.aiUsage.max || 3;
        this.aiUsage.canUseAI = true;
      }

      this.$chatCountDisplay.text('0');

      const $chip = getUsageChip(this.$chatCountDisplay);
      $chip.removeClass('border-red-300 bg-red-50 text-red-700 ring-2 ring-red-100');
      this.$chatCountDisplay.removeClass('text-red-600 font-black');

      this.$timerDisplay.text('00:00');
      this.$cooldownOverlay.addClass('hidden');

      if (!this.isLocked) {
        this.$inputArea
          .prop('disabled', false)
          .attr('placeholder', 'Tanya sesuatu atau pilih elemen...')
          .focus();

        this.$btnSend.prop('disabled', false);
      }

      this._cooldownToastShown = false;
      this._limitToastShown = false;

      Toast.show('Cooldown selesai. AI Buddy bisa digunakan lagi.', 'success');
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

  // [v0.4.2] Untuk halaman berbasis folder, SELALU bangun ulang elemen dari manifest.
  // Tujuannya: abaikan URL gambar lama yang ter-cache di sessionStorage/DB
  // (mis. base "/elements/" sebelum diperbaiki ke "/ELEMENTS/").
  let folderPageKey = this.contextData?.page_key;
  if (!folderPageKey) {
    const looksLikeFolderElements = (this.contextData?.elements || []).some((e) => typeof e?.image === 'string');
    if (looksLikeFolderElements) folderPageKey = resolvePageKeyFromContext(this.contextData || {});
  }
  if (folderPageKey && PAGE_ELEMENTS.some((p) => p.key === folderPageKey)) {
    const fresh = buildElementsForPage(folderPageKey);
    if (fresh.length) {
      this.contextData.elements = fresh;
      this.contextData.page_key = folderPageKey;
    }
  }

  const elements = this.contextData.elements || [];

  if (elements.length === 0) {
    // [v0.3.0] Coba petakan konteks (judul/heading dari widget) ke folder /elements.
    const pageKey = resolvePageKeyFromContext(this.contextData || {});
    if (pageKey) {
      this.applyPageElements(pageKey, { silent: true, keepTitle: true });
      return;
    }

    if (skipFallback) {
      // Dipanggil setelah user memilih template manual — jangan loop fallback lagi.
      this.$elList.html(`
        <div class="bg-surface-card border border-hairline rounded-xl p-4 text-center">
          <i class="fa-solid fa-circle-info text-muted-soft text-xl mb-2"></i>
          <p class="text-[13px] text-muted leading-relaxed">Halaman <span class="font-semibold text-ink">${this.escapeHtml(this.$elTitle.text())}</span> belum memiliki elemen terdaftar.</p>
          <p class="text-[12px] text-muted-soft mt-1">Kamu tetap bisa bertanya langsung di kolom chat, atau pilih konteks halaman lewat tombol "Ganti".</p>
        </div>
      `);
      return;
    }
    this.triggerManualFallback();
    return;
  }

  this._renderElementCards(elements);
}

// [v0.3.0] Pasang konteks "Element Halaman" dari folder /public/elements (statis-visual).
// Tidak bergantung ke template DB — sumber kebenaran adalah manifest pageElements.js.
export async function applyPageElements(pageKey, options = {}) {
  const page = PAGE_ELEMENTS.find((p) => p.key === pageKey);
  if (!page) return false;

  const elements = buildElementsForPage(pageKey);
  const displayTitle = options.keepTitle && this.contextData?.title ? this.contextData.title : page.label;

  this.contextData = {
    ...(this.contextData || {}),
    pageType: page.pageType,
    templateName: page.label,
    title: displayTitle,
    heading: displayTitle,
    sourceType: 'page_elements_folder',
    page_key: page.key,
    elements
  };

  this.selectedElement = null;
  this.$selectedBar?.addClass('hidden').removeClass('flex');
  this.$selectedText?.empty();
  this.$elTitle?.text(displayTitle);
  this.$elWelcome?.text(displayTitle);
  this.$suggestionChips?.empty();
  this.renderSuggestionChips?.(elements);
  // [v0.4.3] WAJIB kosongkan dulu — kalau tidak, elemen konteks lama menumpuk
  // dengan elemen konteks baru saat user pindah halaman (A→B menampilkan A+B).
  this.$elList.empty();
  this._renderElementCards(elements);

  if (!options.silent) {
    // [v0.9.8] Bukan jawaban chat — cukup divider penanda perpindahan konteks tab.
    this.appendContextSwitchDivider?.(page.label);
  }

  if (typeof this.syncSessionContext === 'function') {
    this.syncSessionContext(this.contextData).catch(() => {});
  }
  return true;
}

// [v0.7.0] Jawaban SISTEM untuk sebuah elemen (dipakai tombol "Tanya Sistem" & mention @elemen).
// userText = pertanyaan spesifik user (opsional, dipakai untuk tombol "Jelaskan dengan AI").
export function answerElementViaSystem(el = {}, userText = '') {
  const name = el.name || 'elemen ini';
  const onPage = el.page_label ? ` di ${el.page_label}` : '';
  const desc = (el.text && String(el.text).trim()) || 'Belum ada keterangan untuk elemen ini. Kamu bisa minta penjelasan AI di bawah.';
  const q = String(userText || '').trim() || `Apa fungsi "${name}"${onPage}?`;

  this.appendBubble(q, true, 'user', [], { image: el.image });

  const sysText = `**${name}**${el.page_label ? ` — ${el.page_label}` : ''}\n\n${desc}`;
  const aiMessage = userText
    ? `Tolong jelaskan "${name}"${onPage} secara singkat dan jelas, khususnya: ${userText}`
    : `Tolong jelaskan "${name}"${onPage} secara singkat dan jelas.`;

  this.appendBubble(sysText, false, 'system', [
    {
      type: 'ask_ai',
      label: 'Belum jelas? Jelaskan dengan AI',
      payload: { original_message: q, message: aiMessage, intent: 'penjelasan_materi', responseMode: 'short', forceAI: true, expectedSourceType: 'all' }
    },
    // Tombol SCORING (hijau): merekam apakah penjelasan ini benar-benar membantu.
    { type: 'feedback_resolved', label: 'Terbantu, sudah teratasi' }
  ]);

  this.scrollToBottom?.();
}

export function _renderElementCards(elements) {
  elements.forEach((el, idx) => {
    const safeName = this.escapeHtml(el.name || `@element${idx + 1}`);
    const safeType = this.escapeHtml(el.type || 'Elemen');
    const safeTitle = this.escapeHtml(el.title || '');
    const safeText = this.escapeHtml(el.text || 'Tidak ada teks konten.');
    const safeImage = el.image ? this.escapeHtml(el.image) : '';

    // Preview elemen wajib diisolasi. Jangan inject style/link template langsung ke DOM workspace.
    const previewSrcdoc = this.buildElementPreviewSrcdoc(el, this.activeTemplate);
    const safePreviewSrcdoc = this.escapeHtml(previewSrcdoc);

    // Kartu visual (punya gambar) selalu menampilkan gambar + keterangan + tombol.
    // Kartu non-visual tetap memakai accordion + preview iframe.
    const isVisualCard = !!safeImage;

    const headerHtml = `
      <div class="p-4 bg-surface-strong ${isVisualCard ? '' : 'cursor-pointer buddy-accordion-toggle'} flex justify-between items-center group">
        <div class="min-w-0">
          <div class="font-bold text-ink text-[14px]">${safeName}</div>
          <div class="text-[12px] text-muted-soft mt-0.5">${safeType} · ${safeTitle}</div>
        </div>
        ${isVisualCard
          ? '<i class="fa-solid fa-image text-muted-soft"></i>'
          : '<i class="fa-solid fa-chevron-down text-muted-soft transition-transform duration-300 buddy-accordion-icon"></i>'}
      </div>`;

    const imageBlockHtml = isVisualCard ? `
      <div class="alb-element-img-wrap border-t border-hairline bg-slate-50">
        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border-b border-hairline text-[10px] font-bold uppercase tracking-wide text-slate-500">
          <i class="fa-solid fa-camera"></i> Tangkapan layar — contoh tampilan
        </div>
        <div class="relative p-3">
          <img src="${safeImage}" alt="${safeName}" loading="lazy"
               class="alb-element-img btn-zoom-element-image w-full h-auto block rounded-md border border-slate-300 shadow-sm cursor-zoom-in"
               data-src="${safeImage}" data-title="${safeName}">
          <div class="absolute bottom-5 right-5 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1 pointer-events-none">
            <i class="fa-solid fa-magnifying-glass-plus"></i> klik perbesar
          </div>
        </div>
        <div class="px-3 pb-2 -mt-1 text-[10px] text-slate-400 text-center leading-snug">
          <i class="fa-regular fa-circle-info"></i> Ini hanya gambar ilustrasi, bukan tombol/kolom yang bisa diklik atau diisi.
        </div>
      </div>` : '';

    const buttonsHtml = `
      <div class="flex gap-2">
        <button type="button" class="btn-ask-element flex-1 bg-surface-strong text-ink border border-hairline-strong rounded-lg py-2 text-[13px] font-medium hover:bg-hairline-strong transition-colors">
          <i class="fa-solid fa-comments mr-1"></i> Tanya Sistem
        </button>
        <button type="button" class="btn-explain-element-ai flex-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg py-2 text-[13px] font-medium hover:bg-amber-100 transition-colors">
          <i class="fa-solid fa-sparkles mr-1"></i> Jelaskan AI
        </button>
        ${isVisualCard ? '' : `<button type="button" class="btn-visualize-element flex-1 bg-transparent text-ink border border-hairline-strong rounded-lg py-2 text-[13px] font-medium hover:bg-surface-strong transition-colors">
          <i class="fa-solid fa-eye mr-1"></i> Visual
        </button>`}
      </div>`;

    const bodyHtml = `
      <div class="${isVisualCard ? '' : 'hidden'} bg-white p-4 border-t border-hairline buddy-accordion-body">
        <div class="flex items-start gap-2 mb-4 text-[12px] text-body bg-canvas-soft border border-hairline rounded-lg px-3 py-2.5 leading-relaxed">
          <i class="fa-regular fa-circle-question mt-0.5 text-primary shrink-0"></i>
          <span>Bingung dengan ${isVisualCard ? 'tampilan' : 'elemen'} ini? Klik <b>Tanya Sistem</b> untuk penjelasan singkat, atau <b>Jelaskan AI</b> kalau ingin lebih dalam.</span>
        </div>
        ${buttonsHtml}
        ${isVisualCard ? '' : `
        <div class="visual-container hidden mt-3 p-2 border border-hairline rounded-lg bg-[#f9fafb] overflow-hidden relative">
           <iframe class="buddy-element-preview-frame w-full h-[220px] rounded-lg bg-white border-0" sandbox="" referrerpolicy="no-referrer" loading="lazy" srcdoc="${safePreviewSrcdoc}"></iframe>
        </div>`}
      </div>`;

    const cardHtml = `
      <div class="element-card bg-surface-card border border-hairline rounded-xl mb-3 overflow-hidden shadow-sm transition-all duration-300" id="accordion-${el.key}">
        ${headerHtml}${imageBlockHtml}${bodyHtml}
      </div>`;

    const $card = $(cardHtml);

    // Fallback gambar: jika 404/gagal, tampilkan placeholder + path (jangan hilang diam-diam).
    const $img = $card.find('.alb-element-img');
    if ($img.length) {
      const showImgFallback = () => {
        if ($card.find('.alb-img-fallback').length) return;
        $img.closest('.alb-element-img-wrap').html(
          `<div class="alb-img-fallback flex flex-col items-center justify-center gap-1 py-8 px-3 text-center text-muted-soft text-[12px]">
             <i class="fa-regular fa-image text-2xl"></i>
             <span>Gambar belum tersedia</span>
             <span class="text-[10px] break-all opacity-70">${this.escapeHtml(el.image || '')}</span>
           </div>`
        );
      };
      $img.on('error', showImgFallback);
      if ($img[0].complete && $img[0].naturalWidth === 0) showImgFallback();
    }

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

    // Event: Klik Tombol "Tanya Sistem" — JAWABAN SISTEM deterministik dari keterangan elemen.
    $card.find('.btn-ask-element').on('click', () => {
      this.answerElementViaSystem(el);
      if (window.innerWidth < 768) this.closeContextSidebar?.();
    });

    // Event: Klik Tombol "Jelaskan AI" — kirim LANGSUNG ke AI (tanpa mengisi kolom input).
    $card.find('.btn-explain-element-ai').on('click', () => {
      const where = el.page_label ? ` pada ${el.page_label}` : '';
      const q = `Tolong jelaskan "${el.name || 'elemen ini'}"${where} secara singkat dan jelas.`;
      this.sendDirectMessage?.({
        message: q,
        userImage: el.image || null,
        forceAI: true,
        forceFAQ: false,
        responseMode: 'short',
        intent: 'penjelasan_materi',
        expectedSourceType: 'all'
      });
      if (window.innerWidth < 768) this.closeContextSidebar?.();
    });

    // Event: Zoom gambar elemen (pakai overlay tutorial statis bila tersedia).
    $card.find('.btn-zoom-element-image').on('click', function (e) {
      e.stopPropagation();
      const src = $(this).attr('data-src');
      if (!src) return;
      const $overlay = $('#alb-static-image-zoom');
      if ($overlay.length) {
        $('#alb-static-image-zoom-img').attr('src', src);
        $overlay.removeClass('hidden');
      } else {
        window.open(src, '_blank');
      }
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
// Mengambil string saran berdasarkan keyword cepat
export function getTriggerSuggestions(text) {
  const value = String(text || '').toLowerCase();
  const isTanya = value.includes('tanya');
  const isMateri = value.includes('materi');
  const isBingung = value.includes('bingung');

  let suggestions = [];
  if (!isTanya && !isMateri && !isBingung) return suggestions;

  if (this.activeTemplate && Array.isArray(this.activeTemplate.question_suggestions_json)) {
      const templSugg = this.activeTemplate.question_suggestions_json.filter(q => value.includes((q.trigger_word || '').toLowerCase()));
      templSugg.forEach(q => suggestions.push(q.suggestion_text));
  }

  if (suggestions.length === 0) {
      if (isTanya) {
          suggestions.push("Tanya cara login/masuk");
          suggestions.push("Tanya cara mengumpulkan tugas");
      }
      if (isMateri) {
          suggestions.push("Buka ringkasan materi terbaru");
      }
      if (isBingung) {
          suggestions.push("Saya bingung, tolong hubungkan ke guru");
      }
  }
  return suggestions;
}

// Terpusat untuk menyembunyikan wrapper agar animasi tidak patah
export function hideSuggestionWrapper() {
  if (!this.isSuggestionHidden) {
    this.$suggestionWrapper.stop(true, true).slideUp(200, () => {
        this.$suggestionWrapper.addClass('hidden pointer-events-none');
    });
    this.isSuggestionHidden = true;
  }
  this.currentSuggestionSource = null;
}

// Terpusat untuk me-render chip dengan state Source
export function renderCentralSuggestionChips(suggestions, source) {
  this.$suggestionChips.empty();
  if (!suggestions || suggestions.length === 0) {
      this.hideSuggestionWrapper();
      return;
  }

  suggestions.forEach(text => {
      const icon = source === 'trigger' ? 'fa-lightbulb' : 'fa-wand-magic-sparkles';
      const colorClass = source === 'trigger'
          ? 'border-primary/30 text-primary hover:bg-primary hover:text-white'
          : 'border-hairline-strong text-ink hover:bg-surface-strong';

      const $btn = $(`<button type="button" class="shrink-0 bg-surface-card border ${colorClass} text-[13px] font-medium px-4 py-1.5 rounded-full transition-colors whitespace-nowrap shadow-sm"><i class="fa-solid ${icon} mr-1"></i> ${this.escapeHtml(text)}</button>`);

      $btn.on('click', () => {
         this.$inputArea.val(text);
         this.hideSuggestionWrapper();
         this.$inputArea.focus();

         // Sesuai aturan: Trigger auto-submit, sedangkan Canonical tidak
         if (source === 'trigger') {
             setTimeout(() => { this.$btnSend.click(); }, 100);
         }
      });
      this.$suggestionChips.append($btn);
  });

  this.$suggestionWrapper.removeClass('hidden pointer-events-none').stop(true, true).slideDown(200);
  this.isSuggestionHidden = false;
  this.currentSuggestionSource = source;
}



// TIMPA ATAU TAMBAHKAN FUNGSI INI DI PALING BAWAH FILE dom-ui.js
export function getResponseMode() {
  return this.currentResponseMode || 'default';
}
