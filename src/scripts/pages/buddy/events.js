import $ from 'jquery';
import Toast from '../../components/toast.js';
import { Modal } from '../../components/modal.js';
import { ApiService } from '../../fetch/api.js';

const LMS_BASE_URL = 'https://lms.smpn167jakarta.sch.id';
const DEFAULT_COURSE_ID = '2';
const AI_COOLDOWN_FALLBACK_SECONDS = 180;

const RESPONSE_MODES = {
  system: {
    label: 'Jawaban Sistem',
    responseMode: 'system',
    forceFAQ: true,
    forceAI: false,
    activeClass: 'border-slate-200 bg-slate-50/70'
  },
  ai_short: {
    label: 'AI Singkat',
    responseMode: 'short',
    forceFAQ: false,
    forceAI: true,
    activeClass: 'border-amber-200 bg-amber-50/70'
  },
  ai_detail: {
    label: 'AI Detail',
    responseMode: 'detail',
    forceFAQ: false,
    forceAI: true,
    activeClass: 'border-sky-200 bg-sky-50/70'
  }
};

const MODE_BUTTON_CLASSES = [
  'bg-surface-strong',
  'border-slate-200',
  'bg-slate-50/70',
  'border-amber-200',
  'bg-amber-50/70',
  'border-sky-200',
  'bg-sky-50/70'
].join(' ');

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
        <iframe id="alb-vclass-preview-frame" class="w-full flex-1 bg-white border-0" sandbox="allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation" referrerpolicy="no-referrer"></iframe>
      </div>
    </div>
  `);

  $('#alb-vclass-preview-close').on('click', () => {
    $('#alb-vclass-preview-frame').attr('src', 'about:blank');
    $('#alb-vclass-preview-modal').addClass('hidden');
  });
}

function openVclassPreviewModal(url = '', title = 'Preview VClass') {
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

function bindIfExists($el, eventName, handler) {
  if ($el && $el.length) $el.off(eventName).on(eventName, handler);
}

function getModeConfig(mode = 'system') {
  const aliases = { short: 'ai_short', detail: 'ai_detail', faq: 'system' };
  const normalizedMode = aliases[mode] || mode || 'system';
  return RESPONSE_MODES[normalizedMode] || RESPONSE_MODES.system;
}

function normalizePageType(pageType = '') {
  return String(pageType || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '');
}

function showCooldownToast(context, remainingOverride = null) {
  const remainingSeconds = Number(
    remainingOverride || context.aiUsage?.cooldown_remaining_seconds || AI_COOLDOWN_FALLBACK_SECONDS
  );

  const minutes = Math.floor(remainingSeconds / 60).toString().padStart(2, '0');
  const seconds = (remainingSeconds % 60).toString().padStart(2, '0');

  Toast.show(`Kuota AI Buddy sudah habis. Tunggu ${minutes}:${seconds} lagi.`, 'warning');

  // Pastikan overlay cooldown benar-benar muncul walaupun backend hanya mengirim teks fallback.
  context.aiUsage = {
    ...(context.aiUsage || {}),
    used: Number(context.aiUsage?.used || context.aiUsage?.max || 3),
    max: Number(context.aiUsage?.max || 3),
    remaining: 0,
    limit_reached: true,
    cooldown_active: true,
    cooldown_remaining_seconds: remainingSeconds,
    canUseAI: false
  };

  if (typeof context.updateAiUsageUI === 'function') {
    context.updateAiUsageUI(context.aiUsage);
  } else if (typeof context.triggerCooldown === 'function') {
    context.triggerCooldown();
  }
}

function isCooldownBlocking(context) {
  return Boolean(context.aiUsage?.cooldown_active) || Number(context.aiUsage?.cooldown_remaining_seconds || 0) > 0;
}

function isLikelyMaterialQuestion(message = '') {
  const text = String(message || '').toLowerCase();

  // Pertanyaan materi/konsep harus diarahkan ke RAG dokumen, bukan FAQ teknis VClass.
  if (/\b(apa itu|pengertian|definisi|maksud|artinya|jelaskan|dampak|contoh|jenis|manfaat|risiko|bahaya|mengapa|kenapa|bagaimana)\b/i.test(text)) return true;

  // Topik materi yang sering muncul di kelas.
  if (/\b(media sosial|sosial media|sosmed|hoax|hoaks|cyberbullying|perundungan|cms|wordpress|plugin|html|css|database|xampp)\b/i.test(text)) return true;

  return false;
}

function getCanonicalSuggestions(rawInput = '') {
  const text = String(rawInput || '').toLowerCase().trim();
  if (text.length < 6) return [];

  const suggestions = [];

  // Materi: Media sosial
  if (/\b(media sosial|sosial media|sosmed)\b/i.test(text)) {
    const asksImpact = /\b(dampak|pengaruh|efek|akibat|positif|negatif|manfaat|risiko|bahaya)\b/i.test(text);
    const asksAddiction = /\b(kecanduan|ketagihan|terlalu sering|mengurangi|membatasi|supaya gak|biar gak)\b/i.test(text);
    const asksExample = /\b(contoh|jenis|macam|aplikasi)\b/i.test(text);

    if (asksImpact) {
      suggestions.push('Apa dampak penggunaan media sosial?');
      suggestions.push('Apa saja dampak positif dan negatif media sosial?');
    } else if (asksAddiction) {
      suggestions.push('Bagaimana cara agar tidak kecanduan media sosial?');
      suggestions.push('Bagaimana cara membatasi penggunaan media sosial?');
    } else if (asksExample) {
      suggestions.push('Apa saja contoh media sosial?');
      suggestions.push('Apa saja jenis-jenis media sosial?');
    } else {
      suggestions.push('Apa itu media sosial?');
      suggestions.push('Apa dampak penggunaan media sosial?');
    }
  }

  // Bantuan teknis VClass
  if (/\b(forum|diskusi|reply|balas|postingan)\b/i.test(text)) {
    suggestions.push('Cara membuat atau menjawab forum di VClass');
    suggestions.push('Cara reply forum di VClass');
  }

  if (/\b(quiz|kuis|ujian|soal)\b/i.test(text)) {
    suggestions.push('Cara Mengerjakan Quiz');
    suggestions.push('Cara submit quiz di VClass');
  }

  if (/\b(tugas|assignment|upload|kumpul|mengumpulkan)\b/i.test(text)) {
    suggestions.push('Cara Mengumpulkan Tugas');
    suggestions.push('Cara upload tugas di VClass');
  }

  return [...new Set(suggestions)].slice(0, 4);
}

function updateModeUI(context, selectedMode = 'system') {
  const aliases = { short: 'ai_short', detail: 'ai_detail', faq: 'system' };
  const normalizedMode = aliases[selectedMode] || selectedMode || 'system';
  const modeConfig = getModeConfig(normalizedMode);

  context.currentResponseMode = normalizedMode;
  context.$currentModeLabel?.text(modeConfig.label);
  context.$modeToggleBtn?.removeClass(MODE_BUTTON_CLASSES).addClass(modeConfig.activeClass);

  $('.opt-response-mode').removeClass('text-primary').addClass('text-ink');
  $(`.opt-response-mode[data-mode="${normalizedMode}"]`).removeClass('text-ink').addClass('text-primary');
}

async function sendChatMessage(context, options = {}) {
  const modeConfig = getModeConfig(context.currentResponseMode);
  const messageText = String(options.message ?? context.$inputArea?.val() ?? '').trim();

  if (!messageText || context.isRequesting) return;

  context.isRequesting = true;
  context.lastUserQuestion = messageText;
  context.currentUserQuestion = messageText;

  context.appendBubble(messageText, true, 'user');
  context.$inputArea?.val('');
  context.resetInputHeight?.();
  context.hideSuggestionWrapper?.();
  context.appendTypingIndicator?.();
  context.scrollToBottom?.();

  const selectedResponseMode = options.responseMode || modeConfig.responseMode;
  const selectedForceAI = options.forceAI ?? modeConfig.forceAI;
  const materialQuestion = isLikelyMaterialQuestion(messageText);

  // Kalau user mengetik pertanyaan materi secara manual, jangan kunci retrieval ke FAQ teknis.
  // Mode tetap dihormati: AI Singkat/Detail => forceAI true, Jawaban Sistem => forceAI false.
  const payload = {
    sessionId: context.sessionId,
    message: messageText,
    projectKey: context.projectKey,
    pageContext: options.pageContext || context.contextData || {},
    elementContext: options.elementContext ?? context.selectedElement ?? null,
    expectedSourceType: options.expectedSourceType || (materialQuestion ? 'all' : (modeConfig.forceFAQ ? 'faq' : 'document_chunk')),
    responseMode: selectedResponseMode,
    forceFAQ: options.forceFAQ ?? (materialQuestion ? false : modeConfig.forceFAQ),
    forceAI: selectedForceAI,
    intent: options.intent || null
  };

  try {
    const res = await ApiService.post('/chat/send', payload);

    context.removeTypingIndicator?.();

    if (res?.status === 'success' && res.data) {
      const botMessage = res.data.botMessage || res.data;
      const cooldownSecondsFromText = Number(String(botMessage?.message || '').match(/Tunggu\s+(\d+)\s+detik/i)?.[1] || 0);

      if (res.data.ai_usage && typeof context.updateAiUsageUI === 'function') {
        context.updateAiUsageUI(res.data.ai_usage);
      } else if (cooldownSecondsFromText > 0) {
        showCooldownToast(context, cooldownSecondsFromText);
      }

      if (typeof context.handleBotResponse === 'function') {
        context.handleBotResponse(res.data);
      } else {
        const botMessage = res.data.botMessage || res.data;
        context.appendBubble(botMessage.message || 'Jawaban berhasil diterima.', false, res.data.response_source || 'system', botMessage.actions || []);
      }

      if (res.data.is_locked && typeof context.handleLockdown === 'function') {
        context.handleLockdown(true);
      }
    } else {
      context.appendBubble(res?.message || 'Maaf, terjadi kesalahan saat menghubungi server.', false, 'system');
    }
  } catch (err) {
    console.error('[Buddy External] Gagal mengirim chat:', err);
    context.removeTypingIndicator?.();
    context.appendBubble('Gagal terhubung ke server AI Buddy.', false, 'system');
  } finally {
    context.isRequesting = false;
    context.forceNextAI = false;

    // Jika pertanyaan baru dari sidebar/shortcut menimpa jawaban lama yang menunggu tombol "Sudah jelas",
    // aktifkan kembali input setelah response baru selesai, kecuali response baru juga menunggu feedback.
    if (context._unlockInputAfterCurrentResponse && !context._lastBotMessageWaitsForFeedback) {
      enableChatInputAfterFeedback(context);
    }
    context._unlockInputAfterCurrentResponse = false;

    context.scrollToBottom?.();
  }
}

export function getLmsCourseIdFromSource(url = '') {
  try {
    const sourceUrl = url || this.contextData?.sourceUrl || this.contextData?.url || window.location.href;
    const parsed = new URL(sourceUrl, window.location.href);
    return parsed.searchParams.get('id') || DEFAULT_COURSE_ID;
  } catch (_) {
    return DEFAULT_COURSE_ID;
  }
}

export function resolveLmsActionUrl(targetUrl = '', pageType = '', courseId = '') {
  const cleanType = normalizePageType(pageType);
  const id = courseId || this.getLmsCourseIdFromSource?.() || DEFAULT_COURSE_ID;
  const rawUrl = String(targetUrl || '').trim();

  if (rawUrl) {
    try {
      if (rawUrl.startsWith('/web/') || rawUrl.startsWith('/mod/')) {
        return `${LMS_BASE_URL}${rawUrl}`;
      }

      if (rawUrl.startsWith('web/') || rawUrl.startsWith('mod/')) {
        return `${LMS_BASE_URL}/${rawUrl}`;
      }

      if (rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1')) {
        const parsed = new URL(rawUrl);
        const cleanPath = parsed.pathname.replace(/^\/web\//, '/');
        return `${LMS_BASE_URL}${cleanPath}${parsed.search}`;
      }

      const resolved = new URL(rawUrl, LMS_BASE_URL).href;
      if (resolved.includes('/login/logout.php')) return `${LMS_BASE_URL}/login/logout.php`;
      return resolved;
    } catch (_) {
      return rawUrl;
    }
  }

  if (['login', 'masuk'].includes(cleanType)) return `${LMS_BASE_URL}/login/index.php`;

  if (['dashboard', 'beranda', 'mycourses', 'kursussaya'].includes(cleanType)) {
    return `${LMS_BASE_URL}/my/courses.php`;
  }

  if (['course', 'kursus', 'detailkursus', 'kelas', 'quiz', 'kuis', 'activityquiz', 'activities', 'activity', 'aktivitas', 'listaktivitas', 'materi', 'modul', 'resource'].includes(cleanType)) {
    return `${LMS_BASE_URL}/course/view.php?id=${encodeURIComponent(id)}`;
  }

  if (['grade', 'nilai', 'lihatnilai'].includes(cleanType)) {
    return `${LMS_BASE_URL}/grade/report/user/index.php?id=${encodeURIComponent(id)}`;
  }

  if (['logout', 'keluar'].includes(cleanType)) return `${LMS_BASE_URL}/login/logout.php`;

  return this.contextData?.sourceUrl || this.contextData?.url || `${LMS_BASE_URL}/my/courses.php`;
}

export function navigateSourceTab(targetUrl = '', pageType = '', options = {}) {
  const courseId = options.courseId || options.course_id || this.getLmsCourseIdFromSource?.();
  const destination = this.resolveLmsActionUrl
    ? this.resolveLmsActionUrl(targetUrl, pageType, courseId)
    : targetUrl;

  if (!destination) {
    Toast.show('Link tujuan belum tersedia.', 'warning');
    return;
  }

  const payload = {
    type: 'ALB_NAVIGATE_SOURCE',
    url: destination,
    pageType,
    courseId,
    closeWorkspace: false
  };

  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage(payload, '*');
      window.opener.focus();
      Toast.show('Halaman VClass sudah diarahkan. Workspace AI tetap terbuka.', 'success');
      return;
    } catch (error) {
      console.warn('[Buddy External] Gagal mengarahkan tab asal:', error);
    }
  }

  const opened = window.open(destination, '_blank');
  if (opened) {
    try {
      opened.focus();
    } catch (_) {}
    Toast.show('Tab asal tidak ditemukan. Link dibuka di tab baru.', 'warning');
  } else {
    Toast.show('Browser memblokir tab baru. Silakan buka link secara manual.', 'warning');
  }
}

export function bindWorkspaceEvents() {
  let suggestionTimer = null;

  bindSidebarTabs(this);
  bindContextDrawer(this);
  bindInputEvents(this, () => suggestionTimer, (timer) => { suggestionTimer = timer; });
  bindFormSubmit(this);
  bindFastGuideButtons(this);
  bindBasicButtons(this);
  bindUnlockForm(this);
  bindChatActionButtons(this);
  bindModeSelector(this);
}

function bindSidebarTabs(context) {
  bindIfExists(context.$tabBtnGuide, 'click', () => {
    context.$tabBtnGuide
      .addClass('font-bold text-primary border-primary')
      .removeClass('font-semibold text-muted border-transparent');

    context.$tabBtnElements
      .addClass('font-semibold text-muted border-transparent')
      .removeClass('font-bold text-primary border-primary');

    context.$tabContentGuide.removeClass('hidden');
    context.$elList.addClass('hidden');
  });

  bindIfExists(context.$tabBtnElements, 'click', () => {
    context.$tabBtnElements
      .addClass('font-bold text-primary border-primary')
      .removeClass('font-semibold text-muted border-transparent');

    context.$tabBtnGuide
      .addClass('font-semibold text-muted border-transparent')
      .removeClass('font-bold text-primary border-primary');

    context.$elList.removeClass('hidden');
    context.$tabContentGuide.addClass('hidden');
  });
}

function bindContextDrawer(context) {
  bindIfExists(context.$btnOpenContext, 'click', () => {
    const isDesktop = window.innerWidth >= 768;

    if (isDesktop) context.$contextSidebar.toggleClass('desktop-collapsed');
    else context.openContextSidebar();
  });

  bindIfExists(context.$btnCloseContext, 'click', () => context.closeContextSidebar());
  bindIfExists(context.$contextBackdrop, 'click', () => context.closeContextSidebar());
}

function bindInputEvents(context, getSuggestionTimer, setSuggestionTimer) {
  bindIfExists(context.$inputArea, 'input keyup paste', () => {
    setTimeout(() => {
      const val = context.$inputArea.val();
      const trimmedVal = val.trim();

      if (!val.match(/@\w+/)) {
        context.selectedElement = null;
        context.$selectedBar.addClass('hidden').removeClass('flex');
      }

      if (!trimmedVal) {
        clearTimeout(getSuggestionTimer());
        context.hideSuggestionWrapper?.();
        return;
      }

      if (context.isRequesting || context.aiUsage?.cooldown_active) return;

      const triggerSuggestions = context.getTriggerSuggestions?.(trimmedVal) || [];
      if (triggerSuggestions.length > 0) {
        context.renderCentralSuggestionChips?.(triggerSuggestions, 'trigger');
      }

      clearTimeout(getSuggestionTimer());
      setSuggestionTimer(setTimeout(() => {
        const latestValue = context.$inputArea.val().trim();
        if (!latestValue || context.isRequesting || context.aiUsage?.cooldown_active) return;

        const canonicalSuggestions = getCanonicalSuggestions(latestValue);
        if (canonicalSuggestions.length > 0) {
          context.renderCentralSuggestionChips?.(canonicalSuggestions, 'canonical');
          return;
        }

        const currentTriggers = context.getTriggerSuggestions?.(latestValue) || [];
        if (currentTriggers.length === 0) {
          context.hideSuggestionWrapper?.();
        } else if (context.currentSuggestionSource === 'canonical') {
          context.renderCentralSuggestionChips?.(currentTriggers, 'trigger');
        }
      }, 700));
    }, 0);
  });

  bindIfExists(context.$btnClearSelected, 'click', (e) => {
    e.preventDefault();
    context.selectedElement = null;
    context.$selectedBar.addClass('hidden').removeClass('flex');
    context.$selectedText.empty();

    const cleanedValue = context.$inputArea.val().replace(/@\w+\s?/g, '');
    context.$inputArea.val(cleanedValue).focus().trigger('input');
  });
}

function bindFormSubmit(context) {
  bindIfExists(context.$form, 'submit', (e) => {
    e.preventDefault();

    const text = context.$inputArea.val().trim();
    if (!text || context.isRequesting) return;

    const currentElementContext = context.selectedElement;
    const modeConfig = getModeConfig(context.currentResponseMode);

    context.selectedElement = null;
    context.$selectedBar.addClass('hidden').removeClass('flex');
    context.hideSuggestionWrapper?.();
    context.toggleSuggestions?.();

    sendChatMessage(context, {
      message: text,
      elementContext: currentElementContext,
      forceAI: context.forceNextAI === true ? true : modeConfig.forceAI,
      forceFAQ: context.forceNextAI === true ? false : modeConfig.forceFAQ,
      responseMode: modeConfig.responseMode
    });
  });
}


function ensureExtendedFastGuideButtons(context) {
  const $guide = context.$tabContentGuide && context.$tabContentGuide.length
    ? context.$tabContentGuide
    : $('#tab-content-guide');

  if (!$guide.length || $guide.find('[data-alb-extra-guide="1"]').length || $guide.find('[data-intent="tutorial_buat_forum"]').length) return;

  const groups = [
    {
      title: 'Panduan Penggunaan Tambahan',
      subtitle: 'Tutorial sistem dengan visual elemen VClass.',
      items: [
        { icon: 'fa-pen-to-square', color: 'text-violet-500', msg: 'Cara membuat forum diskusi di VClass', intent: 'tutorial_buat_forum', label: 'Cara Buat Forum Diskusi' },
        { icon: 'fa-comments', color: 'text-fuchsia-500', msg: 'Cara reply atau balas diskusi forum di VClass', intent: 'tutorial_reply_forum', label: 'Cara Reply/Balas Diskusi' },
        { icon: 'fa-cloud-arrow-up', color: 'text-emerald-500', msg: 'Cara mengumpulkan tugas di VClass', intent: 'tutorial_kumpulin_tugas', label: 'Cara Mengumpulkan Tugas' },
        { icon: 'fa-clipboard-question', color: 'text-amber-500', msg: 'Cara mengerjakan kuis di VClass', intent: 'tutorial_kuis', label: 'Cara Mengerjakan Kuis' },
        { icon: 'fa-right-from-bracket', color: 'text-rose-500', msg: 'Cara logout dari VClass', intent: 'tutorial_logout', label: 'Cara Logout' },
        { icon: 'fa-list-check', color: 'text-blue-500', msg: 'Cara melihat aktivitas di VClass', intent: 'tutorial_lihat_aktivitas', label: 'Cara Melihat Aktivitas' },
        { icon: 'fa-chart-simple', color: 'text-emerald-600', msg: 'Cara melihat nilai di VClass', intent: 'tutorial_lihat_nilai', label: 'Cara Melihat Nilai' }
      ]
    }
  ];

  const html = `
    <div data-alb-extra-guide="1" class="mt-5 pt-4 border-t border-hairline space-y-4">
      ${groups.map((group) => `
        <section class="space-y-2.5">
          <div class="px-1">
            <div class="text-[10px] font-black uppercase tracking-[0.12em] text-muted flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-primary/60"></span>
              ${group.title}
            </div>
            <div class="text-[11px] text-muted-soft mt-0.5 leading-snug">${group.subtitle}</div>
          </div>
          <div class="space-y-2.5">
            ${group.items.map((item) => `
              <button type="button"
                class="btn-fast-guide w-full bg-white border border-hairline hover:border-primary/30 hover:bg-primary/5 rounded-xl px-4 py-3 text-left flex items-center gap-3 shadow-sm transition-all"
                data-msg="${item.msg}"
                data-intent="${item.intent}">
                <i class="fa-solid ${item.icon} ${item.color} w-5 text-center"></i>
                <span class="font-semibold text-[14px] text-ink">${item.label}</span>
              </button>
            `).join('')}
          </div>
        </section>
      `).join('')}
    </div>
  `;

  $guide.append(html);
}

function bindFastGuideButtons(context) {
  ensureExtendedFastGuideButtons(context);

  $('.btn-fast-guide').off('click').on('click', (e) => {
    if (window.innerWidth < 768) context.closeContextSidebar?.();

    const intent = $(e.currentTarget).data('intent') || null;
    const message = $(e.currentTarget).data('msg') || '';
    const isLmsCheck = Boolean(intent && String(intent).startsWith('cek_'));

    // Tanya Cepat/sidebar TIDAK BOLEH mengubah mode dropdown.
    // Panduan penggunaan dan data kelas selalu dijawab sistem/template deterministik.
    sendChatMessage(context, {
      message,
      intent,
      forceFAQ: false,
      forceAI: false,
      responseMode: 'system',
      expectedSourceType: isLmsCheck ? 'lms' : 'template'
    });
  });
}

function bindBasicButtons(context) {
  bindIfExists(context.$btnReload, 'click', () => window.location.reload());
  bindIfExists(context.$btnSessionInfo, 'click', () => Modal.open('modal-session-info'));

  if (!(context.mode === 'external' && context.urlSessionId)) {
    bindIfExists(context.$btnBack, 'click', () => Modal.open('modal-confirm-back'));
    bindIfExists(context.$btnConfirmLeave, 'click', () => {
      window.location.href = `/buddy?projectKey=${context.projectKey}`;
    });
  }
}

function bindUnlockForm(context) {
  bindIfExists($('#btn-unlock-chat'), 'click', async () => {
    const name = $('#unlock-name-input').val().trim();
    const key = $('#unlock-key-input').val().trim();

    if (!name) {
      Toast.show('Harap masukkan nama panggilanmu!', 'error');
      $('#unlock-name-input').addClass('border-semantic-error');
      return;
    }

    $('#unlock-name-input').removeClass('border-semantic-error');

    if (!key) {
      Toast.show('Harap masukkan key dari guru!', 'error');
      return;
    }

    $('#btn-unlock-chat').html('<i class="fa-solid fa-spinner fa-spin"></i>').prop('disabled', true);

    try {
      try {
        await ApiService.patch(`/chat/session/${context.sessionId}/profile`, { student_name: name });
        sessionStorage.setItem('alb_student_name', name);
      } catch (err) {
        console.warn('[Buddy External] Gagal update nama siswa, lanjut unlock:', err);
      }

      const res = await ApiService.post('/chat/unlock', { sessionId: context.sessionId, key });

      if (res?.status === 'success') {
        context.handleLockdown(false);
        Toast.show('Chat berhasil dibuka kembali.', 'success');
        context.appendBubble(
          `Akses chat telah dibuka kembali. Mari kita lanjutkan belajar dengan baik dan sopan ya, ${context.escapeHtml(name)}!`,
          false,
          'system'
        );
      } else {
        Toast.show(res?.message || 'Key salah atau kedaluwarsa!', 'error');
      }
    } catch (err) {
      console.error('[Buddy External] Gagal unlock chat:', err);
      Toast.show('Gagal menghubungi server.', 'error');
    } finally {
      $('#btn-unlock-chat').html('Verifikasi & Buka Akses').prop('disabled', false);
      $('#unlock-key-input').val('');
    }
  });
}


let albActiveStaticTutorial = null;
let albActiveStaticTutorialIndex = 0;

function safeTutorialText(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeStaticAssetUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `/${raw}`;
}

function ensureStaticTutorialModal() {
  if ($('#alb-static-tutorial-modal').length) return;

  $('body').append(`
    <style>
      #alb-static-tutorial-modal {
        font-family: inherit;
      }
      #alb-static-tutorial-modal .alb-tut-image-wrap {
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      }
      #alb-static-tutorial-image {
        transition: opacity 0.2s ease;
      }
      #alb-static-tutorial-image.loading {
        opacity: 0;
      }
      .alb-tut-step-list-item {
        transition: background 0.15s, border-color 0.15s;
        cursor: pointer;
      }
      .alb-tut-step-list-item.active {
        background: #eff6ff;
        border-color: #93c5fd;
      }
      .alb-tut-step-list-item:not(.active):hover {
        background: #f8fafc;
      }
      .alb-tut-nav-btn {
        transition: opacity 0.15s, background 0.15s, transform 0.1s;
      }
      .alb-tut-nav-btn:not(:disabled):active {
        transform: scale(0.93);
      }
      @media (max-width: 640px) {
        #alb-static-tutorial-modal .alb-tut-sidebar {
          display: none !important;
        }
        #alb-static-tutorial-modal .alb-tut-mobile-info {
          display: block !important;
        }
      }
    </style>

    <div id="alb-static-tutorial-modal" class="hidden fixed inset-0 z-[9700] flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4">
      <div class="flex w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl" style="max-height: 96dvh; height: 96dvh;">

        <!-- Header -->
        <div class="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-white">
          <div class="flex items-center gap-3 min-w-0">
            <div class="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-[14px]">
              <i class="fa-solid fa-book-open-reader"></i>
            </div>
            <div class="min-w-0">
              <div class="text-[10px] font-black uppercase tracking-[0.12em] text-primary leading-none mb-0.5">Tutorial VClass</div>
              <div id="alb-static-tutorial-title" class="text-[15px] sm:text-[16px] font-black text-slate-900 leading-tight truncate"></div>
            </div>
          </div>
          <button type="button" id="alb-static-tutorial-close" class="shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Tutup tutorial">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Body -->
        <div class="flex flex-1 min-h-0">

          <!-- Left: Image area -->
          <div class="flex flex-col flex-1 min-w-0 min-h-0 bg-slate-50">

            <!-- Image viewer -->
            <div class="alb-tut-image-wrap relative flex-1 flex items-center justify-center min-h-0 p-3 sm:p-5">
              <!-- Nav: Prev -->
              <button type="button" id="alb-static-tutorial-prev" aria-label="Langkah sebelumnya"
                class="alb-tut-nav-btn absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-white shadow-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-25 disabled:cursor-not-allowed">
                <i class="fa-solid fa-chevron-left text-[13px]"></i>
              </button>

              <!-- Image -->
              <img id="alb-static-tutorial-image" src="" alt=""
                class="max-h-full w-auto max-w-full object-contain rounded-xl shadow-sm cursor-zoom-in select-none"
                style="max-height: calc(96dvh - 200px);"
                loading="lazy" draggable="false" />

              <!-- Nav: Next -->
              <button type="button" id="alb-static-tutorial-next" aria-label="Langkah berikutnya"
                class="alb-tut-nav-btn absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-white shadow-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-25 disabled:cursor-not-allowed">
                <i class="fa-solid fa-chevron-right text-[13px]"></i>
              </button>
            </div>

            <!-- Mobile info (hidden on desktop via CSS) -->
            <div class="alb-tut-mobile-info hidden border-t border-slate-100 bg-white px-4 py-3">
              <div class="flex items-center justify-between gap-3 mb-2">
                <span id="alb-static-tutorial-counter-mobile" class="inline-flex items-center gap-1.5 text-[11px] font-black text-primary bg-primary/8 px-2.5 py-1 rounded-full">Langkah 1/1</span>
                <div id="alb-static-tutorial-dots" class="flex items-center gap-1.5 flex-wrap justify-end"></div>
              </div>
              <div id="alb-static-tutorial-step-title-mobile" class="text-[14px] font-black text-slate-900 leading-snug mb-1"></div>
              <div id="alb-static-tutorial-step-text-mobile" class="text-[12px] text-slate-600 leading-relaxed"></div>
              <div id="alb-static-tutorial-step-note-mobile" class="hidden mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-relaxed"></div>
            </div>

            <!-- Bottom dots (desktop, hidden on mobile) -->
            <div class="alb-tut-sidebar hidden sm:flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-2.5">
              <span id="alb-static-tutorial-counter" class="text-[11px] font-black text-primary whitespace-nowrap">Langkah 1/1</span>
              <div id="alb-static-tutorial-dots-desktop" class="flex items-center gap-1.5 flex-wrap justify-end"></div>
              <span class="text-[10px] text-slate-400 whitespace-nowrap hidden md:block"><i class="fa-solid fa-keyboard mr-1"></i>← →</span>
            </div>
          </div>

          <!-- Right: Step sidebar (desktop only) -->
          <aside class="alb-tut-sidebar hidden sm:flex flex-col w-[260px] md:w-[300px] shrink-0 border-l border-slate-100 bg-white overflow-y-auto">
            <div class="px-4 pt-4 pb-2">
              <p id="alb-static-tutorial-intro" class="text-[12px] text-slate-500 leading-relaxed"></p>
            </div>
            <div id="alb-static-tutorial-step-list" class="flex flex-col gap-1 px-3 py-2 flex-1"></div>
            <div id="alb-static-tutorial-note" class="shrink-0 mx-3 mb-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-500"></div>
          </aside>
        </div>
      </div>
    </div>

    <!-- Zoom overlay -->
    <div id="alb-static-image-zoom" class="hidden fixed inset-0 z-[9800] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-10" style="cursor:zoom-out;">
      <button type="button" id="alb-static-image-zoom-close" class="absolute right-4 top-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors border border-white/20" aria-label="Tutup gambar">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <img id="alb-static-image-zoom-img" src="" alt="Preview gambar tutorial" class="max-h-full max-w-full object-contain rounded-xl shadow-2xl" style="cursor:default;" />
    </div>
  `);

  $('#alb-static-tutorial-close').on('click', closeStaticTutorialModal);
  $('#alb-static-tutorial-prev').on('click', () => showStaticTutorialStep(albActiveStaticTutorialIndex - 1));
  $('#alb-static-tutorial-next').on('click', () => showStaticTutorialStep(albActiveStaticTutorialIndex + 1));
  $('#alb-static-tutorial-image').on('click', () => {
    const src = $('#alb-static-tutorial-image').attr('src') || '';
    if (!src) return;
    $('#alb-static-image-zoom-img').attr('src', src);
    $('#alb-static-image-zoom').removeClass('hidden');
  });
  $('#alb-static-image-zoom-close, #alb-static-image-zoom').on('click', (e) => {
    if (e.target.id === 'alb-static-image-zoom' || e.currentTarget.id === 'alb-static-image-zoom-close') {
      $('#alb-static-image-zoom').addClass('hidden');
      $('#alb-static-image-zoom-img').attr('src', '');
    }
  });

  $(document).off('keydown.albStaticTutorial').on('keydown.albStaticTutorial', (e) => {
    if ($('#alb-static-tutorial-modal').hasClass('hidden')) return;
    if (e.key === 'Escape') closeStaticTutorialModal();
    if (e.key === 'ArrowLeft') showStaticTutorialStep(albActiveStaticTutorialIndex - 1);
    if (e.key === 'ArrowRight') showStaticTutorialStep(albActiveStaticTutorialIndex + 1);
  });
}

function closeStaticTutorialModal() {
  $('#alb-static-tutorial-modal').addClass('hidden');
  $('body').css('overflow', '');
}

function showStaticTutorialStep(index = 0) {
  if (!albActiveStaticTutorial || !Array.isArray(albActiveStaticTutorial.steps)) return;

  const steps = albActiveStaticTutorial.steps;
  const maxIndex = Math.max(0, steps.length - 1);
  albActiveStaticTutorialIndex = Math.max(0, Math.min(maxIndex, Number(index) || 0));

  const step = steps[albActiveStaticTutorialIndex] || {};
  const imageUrl = normalizeStaticAssetUrl(step.image || '');
  const counterText = `Langkah ${albActiveStaticTutorialIndex + 1}/${steps.length}`;
  const stepTitle = step.title || `Langkah ${albActiveStaticTutorialIndex + 1}`;
  const stepText = step.text || 'Ikuti bagian yang ditunjukkan pada gambar.';

  // Counter
  $('#alb-static-tutorial-counter').text(counterText);
  $('#alb-static-tutorial-counter-mobile').text(counterText);

  // Image with fade transition
  const $img = $('#alb-static-tutorial-image');
  $img.addClass('loading');
  const newImg = new Image();
  newImg.onload = () => {
    $img.attr('src', imageUrl).attr('alt', step.alt || stepTitle || 'Gambar tutorial VClass').removeClass('loading');
  };
  newImg.onerror = () => $img.attr('src', imageUrl).removeClass('loading');
  newImg.src = imageUrl;

  // Mobile info
  $('#alb-static-tutorial-step-title-mobile').text(stepTitle);
  $('#alb-static-tutorial-step-text-mobile').text(stepText);
  if (step.note) {
    $('#alb-static-tutorial-step-note-mobile').removeClass('hidden').text(step.note);
  } else {
    $('#alb-static-tutorial-step-note-mobile').addClass('hidden').text('');
  }

  // Nav buttons
  $('#alb-static-tutorial-prev').prop('disabled', albActiveStaticTutorialIndex <= 0);
  $('#alb-static-tutorial-next').prop('disabled', albActiveStaticTutorialIndex >= maxIndex);

  // Dots (desktop bottom bar)
  const dotsHtml = steps.map((_, i) => `
    <button type="button"
      class="alb-static-tutorial-dot h-2 rounded-full transition-all duration-200 ${i === albActiveStaticTutorialIndex ? 'w-6 bg-primary' : 'w-2 bg-slate-300 hover:bg-slate-400'}"
      data-step="${i}" aria-label="Langkah ${i + 1}"></button>
  `).join('');
  $('#alb-static-tutorial-dots-desktop').html(dotsHtml);

  // Dots (mobile)
  const dotsHtmlMobile = steps.map((_, i) => `
    <button type="button"
      class="alb-static-tutorial-dot h-1.5 rounded-full transition-all duration-200 ${i === albActiveStaticTutorialIndex ? 'w-5 bg-primary' : 'w-1.5 bg-slate-300'}"
      data-step="${i}" aria-label="Langkah ${i + 1}"></button>
  `).join('');
  $('#alb-static-tutorial-dots').html(dotsHtmlMobile);

  $('.alb-static-tutorial-dot').off('click').on('click', (e) => {
    showStaticTutorialStep(Number($(e.currentTarget).attr('data-step')) || 0);
  });

  // Sidebar step list
  const listHtml = steps.map((s, i) => {
    const isActive = i === albActiveStaticTutorialIndex;
    const isDone = i < albActiveStaticTutorialIndex;
    return `
      <button type="button" class="alb-tut-step-list-item w-full text-left rounded-xl border px-3 py-2.5 ${isActive ? 'active border-blue-200 bg-blue-50' : 'border-transparent'}" data-step="${i}">
        <div class="flex items-start gap-2.5">
          <div class="shrink-0 w-5 h-5 rounded-full mt-0.5 flex items-center justify-center text-[10px] font-black
            ${isActive ? 'bg-primary text-white' : isDone ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}">
            ${isDone ? '<i class="fa-solid fa-check" style="font-size:9px;"></i>' : i + 1}
          </div>
          <div class="min-w-0">
            <div class="text-[12px] font-bold leading-snug ${isActive ? 'text-slate-900' : isDone ? 'text-slate-500' : 'text-slate-700'}">${safeTutorialText(s.title || `Langkah ${i + 1}`)}</div>
            ${isActive && s.text ? `<div class="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">${safeTutorialText(s.text)}</div>` : ''}
          </div>
        </div>
      </button>`;
  }).join('');
  const $list = $('#alb-static-tutorial-step-list');
  $list.html(listHtml);
  $list.find('.alb-tut-step-list-item').off('click').on('click', (e) => {
    showStaticTutorialStep(Number($(e.currentTarget).attr('data-step')) || 0);
  });

  // Scroll active step into view in sidebar
  const $activeItem = $list.find('.alb-tut-step-list-item.active');
  if ($activeItem.length) {
    const listEl = $list[0];
    const itemEl = $activeItem[0];
    const itemTop = itemEl.offsetTop - listEl.offsetTop;
    listEl.scrollTo({ top: itemTop - 40, behavior: 'smooth' });
  }
}

function openStaticTutorialModal(payload = {}) {
  const tutorial = payload || {};
  const steps = Array.isArray(tutorial.steps) ? tutorial.steps : [];

  if (!steps.length) {
    Toast.show('Data tutorial belum tersedia.', 'warning');
    return;
  }

  ensureStaticTutorialModal();
  albActiveStaticTutorial = tutorial;
  albActiveStaticTutorialIndex = 0;

  $('#alb-static-tutorial-title').text(tutorial.title || 'Tutorial VClass');
  $('#alb-static-tutorial-intro').text(tutorial.intro || '');
  $('#alb-static-tutorial-note').text(tutorial.note || 'Isi teks pada gambar hanya contoh. Ikuti instruksi guru dan data akunmu sendiri.');
  $('#alb-static-tutorial-modal').removeClass('hidden');
  $('body').css('overflow', 'hidden');
  showStaticTutorialStep(0);
}

function markSingleChatButtonClicked($btn, options = {}) {
  if (!$btn || !$btn.length) return;
  if (options.disable === false) return;

  $btn
    .prop('disabled', true)
    .addClass('opacity-60 cursor-not-allowed pointer-events-none')
    .removeClass('hover:bg-primary-active hover:bg-surface-strong hover:bg-emerald-100 hover:bg-sky-100');
}


function enableChatInputAfterFeedback(context) {
  if (!context?.$inputArea?.length || !context?.$btnSend?.length) return;
  if (context.isLocked) return;
  context.$inputArea
    .prop('disabled', false)
    .attr('placeholder', 'Tanya sesuatu atau pilih elemen...')
    .focus();
  context.$btnSend.prop('disabled', false);
}

function paginateLmsTableFromButton($btn) {
  const $wrap = $btn.closest('[data-alb-lms-table]');
  if (!$wrap.length) return;

  const max = Math.max(1, Number($wrap.attr('data-total-pages') || 1));
  const current = Math.max(1, Number($wrap.attr('data-page') || 1));
  const direction = Number($btn.attr('data-dir') || 0);
  const nextPage = Math.max(1, Math.min(max, current + direction));

  $wrap.attr('data-page', String(nextPage));
  $wrap.find('[data-alb-page]').each((_, row) => {
    const $row = $(row);
    $row.css('display', Number($row.attr('data-alb-page')) === nextPage ? '' : 'none');
  });

  $wrap.find('[data-page-info]').text(`Halaman ${nextPage} dari ${max}`);
  $wrap.find('.alb-lms-page-btn[data-dir="-1"]').prop('disabled', nextPage <= 1);
  $wrap.find('.alb-lms-page-btn[data-dir="1"]').prop('disabled', nextPage >= max);
}


function buildMaterialReaderHtml(item = {}) {
  const title = escapeHtml(item.title || 'Materi Moodle');
  const topic = escapeHtml(item.topic || item.class_code || 'Materi');
  const badge = escapeHtml((item.modname || item.file_type || 'html').toString().toUpperCase());
  const sourceUrl = escapeHtml(item.url || item.source_url || item.file_url || '');
  const rawSnippets = Array.isArray(item.snippets) && item.snippets.length
    ? item.snippets
    : [item.content || item.preview || 'Materi ini sudah tersinkron ke AI Buddy. Untuk halaman Moodle asli, gunakan tombol Tab Baru.'];

  const normalizedSnippets = rawSnippets
    .map((snippet) => String(snippet || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 8);

  const bodyHtml = normalizedSnippets
    .map((snippet, index) => {
      const text = escapeHtml(snippet);
      return `
        <section class="alb-reader-section bg-white border border-hairline rounded-2xl p-4 md:p-5 shadow-sm">
          <div class="text-[11px] font-black text-muted-soft uppercase tracking-wider mb-2">Bagian ${index + 1}</div>
          <p class="text-[14px] md:text-[15px] leading-7 text-ink whitespace-pre-wrap">${text}</p>
        </section>`;
    })
    .join('');

  return `
    <div class="alb-reader-local max-w-[920px] mx-auto p-4 md:p-7 space-y-4 md:space-y-5">
      <section class="bg-white border border-hairline rounded-3xl p-5 md:p-7 shadow-sm">
        <div class="inline-flex items-center gap-2 bg-primary/10 text-primary border border-primary/15 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider">
          ${badge} · Materi tersinkron
        </div>
        <h1 class="mt-4 text-[26px] md:text-[38px] leading-tight font-black text-ink tracking-tight">${title}</h1>
        <div class="mt-1 text-[13px] md:text-[15px] text-muted-soft">${topic}</div>

        <div class="alb-reader-note mt-5 bg-amber-50 border border-amber-100 text-amber-800 rounded-2xl p-4 flex items-start gap-3">
          <i class="fa-solid fa-circle-info mt-1 shrink-0"></i>
          <div class="flex-1 text-[13px] md:text-[14px] leading-6">
            <b>Catatan desain:</b> tampilan ini adalah versi reader yang sudah diperbaiki dari materi tersinkron, bukan iframe Moodle asli. Catatan ini bisa ditutup dengan tombol silang, dan akan muncul lagi setelah halaman di-refresh.
          </div>
          <button type="button" class="alb-reader-note-close w-8 h-8 rounded-full bg-white/70 border border-amber-100 text-amber-800 hover:bg-white shrink-0" aria-label="Tutup catatan">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </section>

      ${bodyHtml || '<section class="bg-white border border-hairline rounded-2xl p-5 text-body">Belum ada cuplikan materi untuk ditampilkan.</section>'}

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
            <button type="button" id="alb-moodle-material-menu" class="md:hidden w-9 h-9 rounded-full bg-surface-strong border border-hairline text-ink hover:bg-hairline shrink-0" aria-label="Buka daftar materi">
              <i class="fa-solid fa-bars"></i>
            </button>
            <div class="min-w-0">
              <div id="alb-moodle-material-title" class="text-[14px] font-black text-ink truncate">Materi Moodle</div>
              <div id="alb-moodle-material-subtitle" class="text-[11px] text-muted-soft truncate">Pilih materi untuk dibuka</div>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button type="button" id="alb-moodle-material-open-tab" class="hidden inline-flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-full text-[12px] font-bold">
              <i class="fa-solid fa-up-right-from-square"></i> Tab Baru
            </button>
            <button type="button" id="alb-moodle-material-close" class="w-9 h-9 rounded-full bg-surface-strong border border-hairline text-ink hover:bg-hairline">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <div class="relative grid grid-cols-1 md:grid-cols-[300px_1fr] flex-1 min-h-0 overflow-hidden">
          <div id="alb-moodle-material-sidebar-shade" class="hidden md:hidden absolute inset-0 z-20 bg-slate-950/45"></div>

          <aside id="alb-moodle-material-sidebar" class="absolute md:relative inset-y-0 left-0 z-30 w-[82%] max-w-[320px] md:w-auto md:max-w-none -translate-x-full md:translate-x-0 transition-transform duration-300 border-r border-hairline bg-canvas-soft overflow-y-auto p-3 shadow-2xl md:shadow-none">
            <div class="flex items-center justify-between gap-2 mb-3">
              <div class="text-[11px] font-black text-muted-soft uppercase tracking-wider">Daftar Materi</div>
              <button type="button" id="alb-moodle-material-sidebar-close" class="md:hidden w-8 h-8 rounded-full bg-white border border-hairline text-ink">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div id="alb-moodle-material-list" class="space-y-2"></div>
          </aside>

          <section class="flex flex-col min-h-0 bg-canvas">
            <div id="alb-moodle-material-reader" class="w-full flex-1 overflow-y-auto bg-canvas"></div>
          </section>
        </div>
      </div>
    </div>
  `);

  const closeSidebar = () => {
    $('#alb-moodle-material-sidebar').addClass('-translate-x-full');
    $('#alb-moodle-material-sidebar-shade').addClass('hidden');
  };

  const openSidebar = () => {
    $('#alb-moodle-material-sidebar').removeClass('-translate-x-full');
    $('#alb-moodle-material-sidebar-shade').removeClass('hidden');
  };

  $('#alb-moodle-material-menu').on('click', openSidebar);
  $('#alb-moodle-material-sidebar-close, #alb-moodle-material-sidebar-shade').on('click', closeSidebar);

  $('#alb-moodle-material-close').on('click', () => {
    $('#alb-moodle-material-reader').empty();
    $('#alb-moodle-material-modal').addClass('hidden');
    closeSidebar();
    $('body').css('overflow', '');
  });

  $('#alb-moodle-material-open-tab').on('click', () => {
    const url = $('#alb-moodle-material-open-tab').attr('data-url') || '';
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  });

  $('#alb-moodle-material-reader').on('click', '.alb-reader-note-close', function () {
    $(this).closest('.alb-reader-note').slideUp(160, function () { $(this).remove(); });
  });
}

function openMoodleMaterialModal(payload = {}) {
  ensureMoodleMaterialModal();
  const materials = Array.isArray(payload.materials) ? payload.materials.filter(Boolean) : [];

  $('#alb-moodle-material-title').text(payload.title || 'Materi Moodle');

  if (!materials.length) {
    $('#alb-moodle-material-list').html(`<div class="text-[13px] text-muted-soft bg-white border border-hairline rounded-xl p-3">Belum ada materi yang bisa dibuka.</div>`);
    $('#alb-moodle-material-reader').empty();
    $('#alb-moodle-material-open-tab').addClass('hidden').attr('data-url', '');
    $('#alb-moodle-material-modal').removeClass('hidden');
    $('body').css('overflow', 'hidden');
    return;
  }

  const renderList = (activeIndex = 0) => {
    const html = materials.map((item, index) => {
      const active = index === activeIndex;
      const title = escapeHtml(item.title || `Materi ${index + 1}`);
      const topic = escapeHtml(item.topic || item.class_code || 'Moodle');
      const badge = escapeHtml((item.modname || item.file_type || 'html').toString().toUpperCase());
      return `
        <button type="button" class="alb-material-item w-full text-left rounded-xl border ${active ? 'border-primary bg-primary/8' : 'border-hairline bg-white hover:bg-surface-strong'} p-3 transition-colors" data-index="${index}">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-[13px] font-bold text-ink leading-snug line-clamp-2">${title}</div>
              <div class="text-[11px] text-muted-soft mt-1 truncate">${topic}</div>
            </div>
            <span class="text-[10px] font-black px-2 py-1 rounded-full bg-canvas-soft text-muted border border-hairline">${badge}</span>
          </div>
        </button>`;
    }).join('');
    $('#alb-moodle-material-list').html(html);
  };

  const showMaterial = (index = 0) => {
    const safeIndex = Math.max(0, Math.min(materials.length - 1, Number(index || 0)));
    const item = materials[safeIndex] || {};
    const url = item.url || item.source_url || item.file_url || '';
    renderList(safeIndex);
    $('#alb-moodle-material-subtitle').text(`${item.topic || 'Materi'} ${materials.length > 1 ? `• ${safeIndex + 1}/${materials.length}` : ''}`);

    // VClass memakai X-Frame-Options SAMEORIGIN, jadi konten ditampilkan sebagai reader lokal dari chunk materi tersinkron.
    $('#alb-moodle-material-reader').html(buildMaterialReaderHtml(item));

    if (url) $('#alb-moodle-material-open-tab').removeClass('hidden').attr('data-url', url);
    else $('#alb-moodle-material-open-tab').addClass('hidden').attr('data-url', '');
  };

  $('#alb-moodle-material-list').off('click', '.alb-material-item').on('click', '.alb-material-item', (e) => {
    showMaterial(Number($(e.currentTarget).attr('data-index') || 0));
    $('#alb-moodle-material-sidebar').addClass('-translate-x-full');
    $('#alb-moodle-material-sidebar-shade').addClass('hidden');
  });

  $('#alb-moodle-material-modal').removeClass('hidden');
  $('body').css('overflow', 'hidden');
  showMaterial(0);
}

function bindChatActionButtons(context) {
  context.$chatArea
    .off('click', '.btn-static-tutorial')
    .on('click', '.btn-static-tutorial', (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      const rawPayload = $btn.attr('data-payload') || '';

      try {
        const payload = JSON.parse(decodeURIComponent(rawPayload));
        openStaticTutorialModal(payload);

        // Tandai sudah pernah dibuka — tetap bisa dibuka ulang
        $btn
          .addClass('border-primary/30 bg-primary/5')
          .find('span.text-\\[10px\\]').text('sudah dibuka · klik untuk buka lagi');
      } catch (err) {
        console.error('[Buddy External] Gagal membuka tutorial statis:', err);
        Toast.show('Gagal membuka tutorial visual.', 'error');
      }
    });

  context.$chatArea
    .off('click', '.btn-open-moodle-materials')
    .on('click', '.btn-open-moodle-materials', (e) => {
      e.preventDefault();
      const rawPayload = $(e.currentTarget).attr('data-payload') || '';
      try {
        const payload = JSON.parse(decodeURIComponent(rawPayload));
        openMoodleMaterialModal(payload);
      } catch (err) {
        console.error('[Buddy External] Gagal membuka materi Moodle:', err);
        Toast.show('Gagal membuka materi Moodle.', 'error');
      }
    });

  context.$chatArea
    .off('click', '.alb-lms-page-btn')
    .on('click', '.alb-lms-page-btn', (e) => {
      e.preventDefault();
      e.stopPropagation();
      paginateLmsTableFromButton($(e.currentTarget));
    });

  context.$chatArea
    .off('click', '.btn-open-vclass-modal')
    .on('click', '.btn-open-vclass-modal', (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      openVclassPreviewModal($btn.attr('data-url') || '', $btn.attr('data-title') || 'Preview VClass');
    });

  context.$chatArea
    .off('click', '.btn-return-source')
    .on('click', '.btn-return-source', (e) => {
      e.preventDefault();

      const $btn = $(e.currentTarget);
      const targetUrl = $btn.attr('data-url') || '';
      const pageType = $btn.attr('data-page-type') || '';
      const courseId = $btn.attr('data-course-id') || '';

      markSingleChatButtonClicked($btn);

      if (context.navigateSourceTab) {
        context.navigateSourceTab(targetUrl, pageType, { courseId });
      } else if (targetUrl) {
        window.open(targetUrl, '_blank');
      } else {
        Toast.show('Tab asal tidak ditemukan. Silakan kembali ke halaman VClass secara manual.', 'warning');
      }
    });

  context.$chatArea
    .off('click', '.btn-wa-action')
    .on('click', '.btn-wa-action', (e) => {
      e.preventDefault();
      openWaFormOnce(context, e.currentTarget);
    });

  context.$chatArea
    .off('click', '.btn-wa-specific-task')
    .on('click', '.btn-wa-specific-task', (e) => {
      e.preventDefault();
      const taskName = $(e.currentTarget).attr('data-task') || '';
      openWaFormOnce(context, e.currentTarget, taskName);
    });

  context.$chatArea
    .off('click', '.btn-system-feedback-ok')
    .on('click', '.btn-system-feedback-ok', (e) => {
      e.preventDefault();

      const $btn = $(e.currentTarget);
      const $wrap = $btn.closest('.alb-system-message-wrap');

      $wrap.find('.alb-action-group button')
        .prop('disabled', true)
        .addClass('opacity-60 cursor-not-allowed');

      $btn
        .removeClass('bg-emerald-50 opacity-60 cursor-not-allowed')
        .addClass('bg-emerald-600 text-white')
        .html('<i class="fa-solid fa-check"></i> Sip, masalah selesai');

      enableChatInputAfterFeedback(context);
      Toast.show('Terima kasih. Jawaban sistem ditandai membantu.', 'success');
    });

  context.$chatArea
    .off('click', '.btn-system-feedback-ai')
    .on('click', '.btn-system-feedback-ai', (e) => handleSystemFeedbackAi(context, e));

  context.$chatArea
    .off('click', '.btn-continue-prompt')
    .on('click', '.btn-continue-prompt', (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      const prompt = $btn.attr('data-prompt') || '';
      markSingleChatButtonClicked($btn);
      context.$inputArea.val(prompt).focus();
      context.toggleSuggestions?.();
    });

  context.$chatArea
    .off('click', '.btn-tutorial-action')
    .on('click', '.btn-tutorial-action', (e) => {
      e.preventDefault();

      const $btn = $(e.currentTarget);
      const rawSteps = $btn.attr('data-steps');
      if (!rawSteps) return;

      try {
        const steps = JSON.parse(decodeURIComponent(rawSteps));
        if (steps.length > 0) {
          context.highlightElementInPreview?.(steps[0].element_key);
          $btn
            .removeClass('bg-primary')
            .addClass('bg-green-500 hover:bg-green-600')
            .html('<i class="fa-solid fa-check-circle"></i> Menampilkan Visual');
        }
      } catch (err) {
        console.error('[Buddy External] Gagal parse tutorial steps:', err);
      }
    });

  context.$chatArea
    .off('click', '.btn-switch-context')
    .on('click', '.btn-switch-context', (e) => handleSwitchContext(context, e));

  context.$chatArea
    .off('click', '.btn-ask-ai-fallback')
    .on('click', '.btn-ask-ai-fallback', (e) => handleAskAiFallback(context, e));
}

function openWaFormOnce(context, btnNode, specificTaskContext = null) {
  const existingForm = $('.alb-wa-help-form');
  if (existingForm.length) {
    existingForm[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  context.renderWaForm(btnNode, specificTaskContext);
}

async function handleSystemFeedbackAi(context, event) {
  event.preventDefault();

  const $btn = $(event.currentTarget);
  const rawPrompt = $btn.attr('data-prompt') || '';
  const cleanPrompt = rawPrompt
    .replace(/^Belum,\s*jelaskan\s*dengan\s*AI\s*:\s*/i, '')
    .replace(/^Tolong\s+jelaskan\s+lebih\s+detail\s+dengan\s+AI\s*[:.]?\s*/i, '')
    .trim();
  const aiPrompt = cleanPrompt || context.lastUserQuestion || context.currentUserQuestion || 'Tolong jelaskan pertanyaan saya tadi dengan lebih jelas.';

  if (isCooldownBlocking(context)) {
    showCooldownToast(context);
    return;
  }

  if (context.isRequesting) return;

  const $wrap = $btn.closest('.alb-system-message-wrap');
  $wrap.find('.alb-action-group button')
    .prop('disabled', true)
    .addClass('opacity-60 cursor-not-allowed');

  $btn
    .removeClass('bg-sky-50')
    .addClass('bg-sky-600 text-white')
    .html('<i class="fa-solid fa-spinner fa-spin"></i> Meminta AI...');

  updateModeUI(context, 'ai_short');
  context.updateResponseModeUI?.();

  await sendChatMessage(context, {
    message: aiPrompt,
    elementContext: null,
    expectedSourceType: 'all',
    responseMode: 'short',
    forceFAQ: false,
    forceAI: true
  });

  enableChatInputAfterFeedback(context);
}

async function handleSwitchContext(context, event) {
  event.preventDefault();

  const $btn = $(event.currentTarget);
  const rawTemplate = $btn.attr('data-template');
  const pendingMessage = $btn.attr('data-message') || '';

  if (!rawTemplate) return;

  $btn
    .removeClass('bg-primary hover:bg-primary-active')
    .addClass('bg-emerald-600 text-white')
    .html('<i class="fa-solid fa-spinner fa-spin"></i> Memindahkan...');

  $btn.closest('.alb-action-group').find('button').prop('disabled', true);

  try {
    const template = JSON.parse(decodeURIComponent(rawTemplate));

    await context.applyTemplateToWorkspace(template, {
      displayTitle: template.template_name || template.page_type
    });

    Toast.show('Konteks berhasil dipindahkan. Sedang menjawab pertanyaan...', 'success');
    $btn.html('<i class="fa-solid fa-check"></i> Konteks Terpasang');

    setTimeout(() => {
      context.$inputArea.val(pendingMessage);
      context.$btnSend.click();
    }, 500);
  } catch (err) {
    console.error('[Buddy External] Gagal memindahkan konteks:', err);
    Toast.show('Gagal memindahkan konteks', 'error');
    $btn.html('<i class="fa-solid fa-triangle-exclamation"></i> Gagal');
  }
}

function handleAskAiFallback(context, event) {
  event.preventDefault();

  const $btn = $(event.currentTarget);
  const rawPayload = $btn.attr('data-payload');

  if (!rawPayload || context.isRequesting) return;

  if (isCooldownBlocking(context)) {
    showCooldownToast(context);
    return;
  }

  $btn
    .removeClass('bg-amber-50 hover:bg-amber-100')
    .addClass('bg-amber-600 text-white border-amber-600')
    .html('<i class="fa-solid fa-spinner fa-spin"></i> Menghubungi AI...');

  $btn.closest('.alb-action-group')
    .find('button')
    .prop('disabled', true)
    .addClass('opacity-60 cursor-not-allowed');

  try {
    let payloadData = JSON.parse(decodeURIComponent(rawPayload));
    if (typeof payloadData === 'string') {
      payloadData = JSON.parse(decodeURIComponent(payloadData));
    }

    const aiMessage = String(
      payloadData.original_message ||
      payloadData.message ||
      payloadData.ai_message ||
      context.lastUserQuestion ||
      context.currentUserQuestion ||
      ''
    ).trim();

    if (!aiMessage) {
      Toast.show('Pertanyaan awal tidak terbaca. Tulis ulang pertanyaannya ya.', 'warning');
      $btn.closest('.alb-action-group').find('button')
        .prop('disabled', false)
        .removeClass('opacity-60 cursor-not-allowed');
      return;
    }

    const sourceAnswer = payloadData.source_answer || '';
    const targetMode = payloadData.responseMode === 'detail' ? 'ai_detail' : 'ai_short';

    updateModeUI(context, targetMode);
    context.updateResponseModeUI?.();

    sendChatMessage(context, {
      message: aiMessage,
      forceAI: payloadData.forceAI !== false,
      forceFAQ: false,
      intent: payloadData.intent || null,
      expectedSourceType: payloadData.expectedSourceType || 'document_chunk',
      responseMode: payloadData.responseMode || 'short',
      pageContext: {
        ...(context.contextData || {}),
        previous_system_answer: sourceAnswer,
        ai_followup_type: 'material_followup',
        original_user_question: aiMessage
      }
    }).finally(() => enableChatInputAfterFeedback(context));
  } catch (err) {
    console.error('[Buddy External] Gagal parsing payload AI FAQ:', err);
    Toast.show('Gagal membaca data tombol AI.', 'error');
  }
}

function bindModeSelector(context) {
  bindIfExists(context.$modeToggleBtn, 'click', (e) => {
    e.stopPropagation();
    context.$modeMenu.toggleClass('hidden');
  });

  $(document).off('click.albResponseMode').on('click.albResponseMode', () => {
    context.$modeMenu?.addClass('hidden');
  });

  $('.opt-response-mode').off('click').on('click', function onSelectMode(e) {
    e.preventDefault();
    e.stopPropagation();

    const selectedMode = $(this).data('mode') || 'system';
    updateModeUI(context, selectedMode);
    context.$modeMenu?.addClass('hidden');
  });

  if (!context.currentResponseMode) updateModeUI(context, 'system');
}

export function renderWaForm(btnNode, specificTaskContext = null) {
  $('.alb-wa-help-form').remove();
  $('.btn-wa-action, .btn-wa-specific-task')
    .not(':disabled')
    .css({ opacity: '1', cursor: 'pointer', pointerEvents: 'auto' });

  $(btnNode).prop('disabled', true).css({ opacity: '0.5', cursor: 'not-allowed' });

  const savedName = sessionStorage.getItem('alb_student_name') || '';

  const formHtml = `
    <div class="alb-wa-help-form wa-mini-form bg-canvas-soft border border-hairline p-4 rounded-xl mt-3 md:max-w-[85%] shadow-sm transition-all animate-in fade-in slide-in-from-top-2">
      <p class="text-[13px] font-semibold text-ink mb-3">Form Hubungi Pak Ilyas</p>

      <label class="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Nama Siswa</label>
      <input type="text" class="wa-input-name w-full bg-white border border-hairline rounded-lg px-3 py-2 text-[13px] mb-3 focus:border-primary outline-none text-ink" value="${this.escapeHtml(savedName)}" placeholder="Nama Kamu...">

      <label class="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Kategori Kendala</label>
      <select class="wa-select-issue w-full bg-white border border-hairline rounded-lg px-3 py-2 text-[13px] mb-3 focus:border-primary outline-none text-ink cursor-pointer">
        <option value="Lupa Password / Akun terkunci">Lupa Password / Akun terkunci</option>
        <option value="Tanya Jadwal / Deadline Tugas">Tanya Jadwal / Deadline Tugas</option>
        <option value="Materi / Tugas tidak bisa diakses">Materi / Tugas tidak bisa diakses</option>
        <option value="Lainnya">Lainnya...</option>
      </select>

      <div class="wa-manual-issue-wrap hidden">
        <label class="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Jelaskan Detail Kendala</label>
        <textarea class="wa-input-issue w-full bg-white border border-hairline rounded-lg px-3 py-2 text-[13px] mb-3 focus:border-primary outline-none min-h-[60px] resize-y text-ink" placeholder="Tulis kendala spesifikmu..."></textarea>
      </div>

      <div class="flex gap-2">
        <button type="button" class="wa-cancel-btn flex-1 bg-transparent border border-hairline-strong text-muted hover:text-ink hover:bg-white rounded-lg px-3 py-2 text-[12px] font-medium transition-colors">Batal</button>
        <button type="button" class="wa-submit-btn flex-1 bg-green-500 hover:bg-green-600 text-white rounded-lg px-3 py-2 text-[12px] font-medium transition-colors shadow-sm"><i class="fa-brands fa-whatsapp mr-1"></i> Kirim</button>
      </div>
    </div>
  `;

  const $form = $(formHtml);
  const $wrap = $(btnNode).closest('.alb-system-message-wrap');

  if ($wrap.length) $wrap.append($form);
  else $(btnNode).parent().append($form);

  this.scrollToBottom?.();

  if (specificTaskContext) {
    $form.find('.wa-select-issue').val('Tanya Jadwal / Deadline Tugas');
    $form.find('.wa-manual-issue-wrap').removeClass('hidden');
    $form.find('.wa-input-issue').val(`Mohon info batas waktu (deadline) untuk aktivitas: ${specificTaskContext}`);
  }

  $form.find('.wa-select-issue').off('change').on('change', function onIssueChange() {
    if ($(this).val() === 'Lainnya' || specificTaskContext) {
      $form.find('.wa-manual-issue-wrap').removeClass('hidden');
    } else {
      $form.find('.wa-manual-issue-wrap').addClass('hidden');
    }
  });

  if (!specificTaskContext) $form.find('.wa-select-issue').trigger('change');

  $form.find('.wa-cancel-btn').off('click').on('click', () => {
    $form.remove();
    $(btnNode).prop('disabled', false).css({ opacity: '1', cursor: 'pointer' });
  });

  $form.find('.wa-submit-btn').off('click').on('click', () => {
    const name = $form.find('.wa-input-name').val().trim() || 'Siswa';
    const selectedIssue = $form.find('.wa-select-issue').val();
    const manualIssue = $form.find('.wa-input-issue').val().trim();
    const issue = selectedIssue === 'Lainnya' || manualIssue !== ''
      ? manualIssue || 'Kendala lainnya di sistem'
      : selectedIssue;

    sessionStorage.setItem('alb_student_name', name);

    const text = [
      'Halo Pak Ilyas, saya ingin meminta bantuan.',
      '',
      `Nama: ${name}`,
      `Kendala: ${issue}`,
      `Halaman: ${window.location.href}`,
      '',
      'Mohon bantuannya Pak. Terima kasih.'
    ].join('\n');

    window.open(`https://api.whatsapp.com/send/?phone=628989807094&text=${encodeURIComponent(text)}`, '_blank');

    $form.html('<div class="text-[13px] text-green-600 text-center py-4 font-medium"><i class="fa-solid fa-check mr-1"></i> Membuka WhatsApp...</div>');

    setTimeout(() => {
      $form.remove();
      $(btnNode).prop('disabled', false).css({ opacity: '1', cursor: 'pointer' });
    }, 2500);
  });
}
