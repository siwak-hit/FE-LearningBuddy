import $ from 'jquery';
import Toast from '../../components/toast.js';
import { Modal } from '../../components/modal.js';
import { ApiService } from '../../fetch/api.js';
import { resolvePageKeyFromText, PAGE_ELEMENTS } from './pageElements.js';
import { openStaticTutorialModal, openVideoTutorialModal } from './static-tutorial.js';
import { openVclassPreviewModal, openMoodleMaterialModal, openHtmlViewModal } from './material-modals.js';
import {
  showCooldownToast,
  isCooldownBlocking,
  applyPersistedCooldownIfNeeded,
  applyPersistedLockdownIfNeeded,
  ensureLocalLockOverlay,
  persistLockdown,
  readPersistedLockdown
} from './safety-overlays.js';
import { ensureStudentNotesMenu } from './student-notes.js';
import {
  readActiveStudentIdentity,
  persistReusableStudentSession,
  hydrateReusableSessionIfAvailable,
  ensureDeleteSessionButton,
  bindExternalSessionGate
} from './student-session.js';

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
  if (!text) return [];

  const words = text.split(/\s+/).filter(Boolean);
  // Saran pertanyaan hanya aman saat input masih pendek. Kalau user sudah menulis panjang,
  // jangan dipaksa generate karena sering berubah jadi chip kosong/tanda tanya.
  if (words.length > 5 || text.length > 48) return [];

  const questionWords = ['apa', 'bagaimana', 'gimana', 'kenapa', 'mengapa', 'siapa', 'kapan', 'dimana', 'di mana', 'berapa'];
  const firstWord = words[0] || '';
  const isGreenFlag = questionWords.includes(firstWord) || text.endsWith('?');
  const suggestions = [];

  const pushClean = (value) => {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    if (!clean || clean === '?' || clean.length < 8) return;
    suggestions.push(clean);
  };

  const seed = words.slice(0, 5).join(' ');

  if (/\b(media sosial|sosial media|sosmed)\b/i.test(seed)) {
    if (/\b(dampak|pengaruh|positif|negatif|bahaya|risiko)\b/i.test(seed)) {
      pushClean('Apa dampak media sosial?');
      pushClean('Apa dampak positif dan negatif media sosial?');
    } else {
      pushClean('Apa itu media sosial?');
      pushClean('Apa saja contoh media sosial?');
    }
  } else if (/\b(hoax|hoaks)\b/i.test(seed)) {
    pushClean('Apa itu hoax?');
    pushClean('Bagaimana cara mengecek hoax?');
  } else if (/\b(cyberbullying|perundungan)\b/i.test(seed)) {
    pushClean('Apa itu cyberbullying?');
    pushClean('Bagaimana cara mencegah cyberbullying?');
  } else if (/\b(cms|wordpress|plugin)\b/i.test(seed)) {
    const topic = /wordpress/i.test(seed) ? 'WordPress' : /plugin/i.test(seed) ? 'plugin' : 'CMS';
    pushClean(`Apa itu ${topic}?`);
    pushClean(`Apa fungsi ${topic}?`);
    pushClean(`Buka materi ${topic}`);
  } else if (/\b(forum|diskusi|reply|balas)\b/i.test(seed)) {
    pushClean(isGreenFlag ? 'Bagaimana cara menjawab forum?' : 'Apa cara menjawab forum?');
  } else if (/\b(quiz|kuis|ujian|soal)\b/i.test(seed)) {
    pushClean(isGreenFlag ? 'Bagaimana cara mengerjakan kuis?' : 'Apa cara mengerjakan kuis?');
  } else if (/\b(tugas|assignment|upload|kumpul)\b/i.test(seed)) {
    pushClean(isGreenFlag ? 'Bagaimana cara mengumpulkan tugas?' : 'Apa cara mengumpulkan tugas?');
  }

  // Yellow flag: kalau bukan diawali kata tanya, usahakan bentuk saran diawali "Apa".
  if (!isGreenFlag) {
    return [...new Set(suggestions.map((item) => {
      if (/^(apa|bagaimana|gimana|kenapa|mengapa|siapa|kapan|dimana|di mana|berapa)\b/i.test(item)) return item;
      return `Apa ${item.charAt(0).toLowerCase()}${item.slice(1)}`;
    }))].slice(0, 3);
  }

  return [...new Set(suggestions)].slice(0, 3);
}

function sanitizeSuggestionList(list = []) {
  return [...new Set((list || [])
    .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
    .filter((item) => item && item !== '?' && item.length >= 8)
  )].slice(0, 4);
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

  updateModeReminder(context);
}

// [v0.4.0] Banner pengingat mode di atas kolom input. Mencegah "yah kepencet AI"
// dengan menyorot ketika user sedang di mode AI (yang memakai kuota).
function updateModeReminder(context) {
  const mode = context?.currentResponseMode || 'system';
  const isAi = mode === 'ai_short' || mode === 'ai_detail';

  let $bar = $('#alb-mode-reminder');
  if (!$bar.length) {
    if (!$('#chat-form').length) return;
    $('#chat-form').before('<div id="alb-mode-reminder" class="mb-1.5 hidden"></div>');
    $bar = $('#alb-mode-reminder');
  }

  if (isAi) {
    const modeName = mode === 'ai_detail' ? 'AI Detail' : 'AI Singkat';
    // [v0.9.2] Dibuat 1 baris ringkas supaya area bawah tidak penuh.
    $bar.html(`
      <div class="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2.5 py-1 text-[11px]">
        <span class="flex items-center gap-1.5 min-w-0"><i class="fa-solid fa-sparkles shrink-0 text-[10px]"></i> <span class="truncate">Mode <b>${modeName}</b> — pakai kuota AI</span></span>
        <button type="button" id="alb-switch-to-system" class="shrink-0 bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 rounded-full px-2 py-0.5 font-semibold transition-colors">Pakai Sistem</button>
      </div>`).removeClass('hidden');
  } else {
    $bar.addClass('hidden').empty();
  }

  $(document).off('click.albModeSwitch').on('click.albModeSwitch', '#alb-switch-to-system', () => {
    updateModeUI(context, 'system');
    Toast.show('Beralih ke Jawaban Sistem. Kuota AI aman.', 'success');
  });
}

// [v0.4.3] Kirim pesan secara langsung TANPA mengisi kolom input & tanpa
// mengandalkan $btnSend.click() (yang tidak selalu memicu submit form di jQuery).
// Dipanggil sebagai method: this.sendDirectMessage({ message, forceAI, ... }).
export function sendDirectMessage(options = {}) {
  return sendChatMessage(this, options);
}

async function sendChatMessage(context, options = {}) {
  const modeConfig = getModeConfig(context.currentResponseMode);
  const messageText = String(options.message ?? context.$inputArea?.val() ?? '').trim();

  // [v0.4.3] Ambil & reset gambar elemen lebih awal supaya kalau kirim dibatalkan,
  // gambar tidak ikut terbawa ke pesan berikutnya.
  const pendingUserImage = options.userImage || context._pendingUserImage || null;
  context._pendingUserImage = null;

  if (!messageText || context.isRequesting) return;

  context.isRequesting = true;

  // suppressUserBubble: bubble pertanyaan sudah ditampilkan pemanggil (mis. auto-pindah konteks).
  if (!options.suppressUserBubble) {
    context.appendBubble(messageText, true, 'user', [], { image: pendingUserImage });
  }
  context.$inputArea?.val('');
  context.resetInputHeight?.();
  context.hideSuggestionWrapper?.();
  // [v0.9.28 #3] Tahap loading "mengalihkan ke AI" hanya bila request memang mode AI,
  // supaya tak muncul saat jawaban ternyata dari sistem.
  const _aiMode = (options.forceAI === true) || (options.forceAI !== false && modeConfig.forceAI === true);
  context.appendTypingIndicator?.({ aiMode: _aiMode });
  context.scrollToBottom?.();

  const selectedResponseMode = options.responseMode || modeConfig.responseMode;
  const selectedForceAI = options.forceAI ?? modeConfig.forceAI;
  const materialQuestion = isLikelyMaterialQuestion(messageText);

  // Kalau user mengetik pertanyaan materi secara manual, jangan kunci retrieval ke FAQ teknis.
  // Mode tetap dihormati: AI Singkat/Detail => forceAI true, Jawaban Sistem => forceAI false.
  const activeIdentity = readActiveStudentIdentity(context) || {};
  const mergedPageContext = {
    ...(context.contextData || {}),
    ...(options.pageContext || {}),
    session_meta: {
      ...(context.contextData?.session_meta || {}),
      ...(options.pageContext?.session_meta || {}),
      ...(activeIdentity.email ? { email: activeIdentity.email } : {}),
      ...(activeIdentity.class_code ? { class_code: activeIdentity.class_code } : {}),
      ...(activeIdentity.moodle_user_id ? { moodle_user_id: activeIdentity.moodle_user_id } : {}),
      ...(activeIdentity.course_id ? { course_id: activeIdentity.course_id } : {}),
      ...(activeIdentity.fullname ? { display_name: activeIdentity.fullname } : {})
    }
  };

  const payload = {
    sessionId: context.sessionId,
    message: messageText,
    projectKey: context.projectKey,
    pageContext: mergedPageContext,
    elementContext: options.elementContext ?? context.selectedElement ?? null,
    expectedSourceType: options.expectedSourceType || (materialQuestion ? 'all' : (modeConfig.forceFAQ ? 'faq' : 'document_chunk')),
    responseMode: selectedResponseMode,
    forceFAQ: options.forceFAQ ?? (materialQuestion ? false : modeConfig.forceFAQ),
    forceAI: selectedForceAI,
    intent: options.intent || null,
    mention: options.mention || null,
    freshMention: options.freshMention === true // [v0.9.8] minta hasil @materi baru (bypass cache)
  };

  try {
    const res = await ApiService.post('/chat/send', payload);

    context.removeTypingIndicator?.();

    if (res?.status === 'success' && res.data) {
      const botMessage = res.data.botMessage || res.data;
      const cooldownSecondsFromText = Number(String(botMessage?.message || '').match(/Tunggu\s+(\d+)\s+detik/i)?.[1] || 0);

      if (res.data.ai_usage && typeof context.updateAiUsageUI === 'function') {
        context.updateAiUsageUI(res.data.ai_usage);
        if (res.data.ai_usage.cooldown_active || Number(res.data.ai_usage.cooldown_remaining_seconds || 0) > 0) {
          showCooldownToast(context, Number(res.data.ai_usage.cooldown_remaining_seconds || AI_COOLDOWN_FALLBACK_SECONDS));
        }
      } else if (cooldownSecondsFromText > 0) {
        showCooldownToast(context, cooldownSecondsFromText);
      }

      persistReusableStudentSession(context, {
        ...(readActiveStudentIdentity(context) || {}),
        sessionId: context.sessionId
      });

      if (typeof context.handleBotResponse === 'function') {
        context.handleBotResponse(res.data);
      } else {
        const botMessage = res.data.botMessage || res.data;
        context.appendBubble(botMessage.message || 'Jawaban berhasil diterima.', false, res.data.response_source || 'system', botMessage.actions || []);
      }

      // [v0.8.2 Fase 2] Rekomendasi bantuan adaptif — tampilkan saat level kesulitan
      // BERUBAH (escalation), bukan tiap pesan, biar tidak spam.
      const diff = res.data.difficulty;
      const reco = res.data.recommendation;
      if (diff && diff.level === 'lancar') {
        context._lastRecoLevel = null;
      } else if (reco && diff && diff.level !== context._lastRecoLevel) {
        context._lastRecoLevel = diff.level;
        setTimeout(() => {
          // [v0.9.10] Rekomendasi proaktif = NOTIF pengingat (kartu di tengah, warna beda),
          // bukan jawaban chat — jangan kunci input, boleh diabaikan/ditutup.
          context.appendBubble(reco.message, false, 'system', reco.actions || [], { noFeedbackLock: true, notice: 'reminder' });
          context.scrollToBottom?.();
        }, 450);
      }

      if (res.data.is_locked) {
        ensureLocalLockOverlay(context, { warnings: res.data.warnings || 3, reason: res.data.lock_reason || 'profanity_limit' });
      }
    } else {
      // [v0.9.19] Error/timeout → simpan payload terakhir + tombol "Kirim ulang" agar
      // user cukup 1 klik (tak perlu copas & ketik ulang).
      const resendActions = messageText
        ? [{ type: 'resend_last', label: '🔄 Kirim ulang' }]
        : [];
      if (messageText) {
        context._lastFailedSend = { message: messageText, options: { ...options, suppressUserBubble: true } };
      }
      context.appendBubble(res?.message || 'Maaf, terjadi kesalahan saat menghubungi server.', false, 'system', resendActions);
    }
  } catch (err) {
    console.error('[Buddy External] Gagal mengirim chat:', err);
    context.removeTypingIndicator?.();
    if (messageText) {
      context._lastFailedSend = { message: messageText, options: { ...options, suppressUserBubble: true } };
    }
    context.appendBubble(
      'Gagal terhubung ke server AI Buddy. Tidak perlu mengetik ulang — cukup klik tombol **🔄 Kirim ulang** di bawah.',
      false, 'system',
      messageText ? [{ type: 'resend_last', label: '🔄 Kirim ulang' }] : []
    );
  } finally {
    context.isRequesting = false;
    context.forceNextAI = false;

    // [v0.4.0] Ingatkan user mode aktif (terutama AI) sesudah chat terkirim.
    updateModeReminder(context);

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



function decorateAiUsageAutoReset(context) {
  if (context.__albAiUsageDecorated || typeof context.updateAiUsageUI !== 'function') return;
  context.__albAiUsageDecorated = true;

  const original = context.updateAiUsageUI.bind(context);
  context.updateAiUsageUI = (usage = {}) => {
    original(usage);
    context.aiUsage = { ...(context.aiUsage || {}), ...(usage || {}) };

    const used = Number(usage.used || 0);
    const max = Number(usage.max || 3);
    const isCooling = Boolean(usage.cooldown_active) || Number(usage.cooldown_remaining_seconds || 0) > 0;

    if (window.__albAiChipResetTimer) clearTimeout(window.__albAiChipResetTimer);

    if (used > 0 && !isCooling) {
      const resetMs = Number(window.__ALB_AI_USAGE_RESET_MS || 180000);
      window.__albAiChipResetTimer = setTimeout(() => {
        context.aiUsage = { ...(context.aiUsage || {}), used: 0, max, remaining: max, limit_reached: false, cooldown_active: false, cooldown_remaining_seconds: 0, canUseAI: true };
        original(context.aiUsage);
      }, resetMs);
    }
  };
}

function selfHealDisabledInput(context) {
  const hasWaitingFeedback = context.$chatArea?.find('.alb-system-message-wrap[data-waiting-feedback="1"]').length > 0;
  const hasLock = $('#alb-global-lock-overlay').length > 0 || Boolean(readPersistedLockdown(context));
  const hasCooldown = $('#alb-global-cooldown-overlay').length > 0 || isCooldownBlocking(context);
  if (!hasWaitingFeedback && !hasLock && !hasCooldown && context.$inputArea?.prop('disabled')) {
    enableChatInputAfterFeedback(context);
  }
}

// [v0.9.1] Bar pemakaian AI BERSAMA (global) — kuota gratis Gemini dipakai semua user
// dan direset tiap hari. Tujuannya: siswa paham kalau AI "lambat/sibuk" itu karena
// kuota bersama menipis, bukan internet mereka. Polling tiap beberapa detik.
function initGlobalAiUsageBar(context) {
  const $anchor = $('#suggestion-wrapper');
  if (!$anchor.length || $('#alb-global-ai-usage-wrap').length) {
    // Sudah ada atau tidak ada tempat pasang → cukup pastikan polling jalan.
  } else {
    // [v0.9.6] Default: panel kuota AI disembunyikan. Muncul hanya saat tombol
    // kecil "Kuota AI" diklik (toggle), supaya area bawah tidak ramai.
    $anchor.before(`
      <div id="alb-global-ai-usage-wrap" class="mb-1.5 select-none">
        <button type="button" id="alb-global-ai-usage-toggle" class="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted-soft hover:text-ink bg-surface-strong border border-hairline rounded-full px-2.5 py-1 transition-colors" title="Lihat info kuota AI bersama">
          <i class="fa-solid fa-bolt text-[10px] text-amber-500"></i>
          <span>Kuota AI</span>
          <span id="alb-global-ai-usage-toggle-pct" class="font-bold text-muted-soft"></span>
          <i class="fa-solid fa-chevron-down text-[8px] opacity-60 transition-transform"></i>
        </button>

        <div id="alb-global-ai-usage" class="hidden mt-1.5 bg-surface-card border border-hairline rounded-xl p-2.5 pr-8 relative">
          <button type="button" id="alb-global-ai-usage-close" class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full text-muted-soft hover:text-ink hover:bg-black/5 flex items-center justify-center transition-colors" title="Tutup">
            <i class="fa-solid fa-xmark text-[11px]"></i>
          </button>
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-bolt text-[11px] text-amber-500 shrink-0"></i>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2 mb-0.5">
                <span class="text-[10px] font-semibold text-muted">Kuota AI bersama hari ini</span>
                <span id="alb-global-ai-usage-pct" class="text-[10px] font-bold text-muted-soft">…</span>
              </div>
              <div class="h-1.5 w-full bg-hairline rounded-full overflow-hidden">
                <div id="alb-global-ai-usage-fill" class="h-full rounded-full bg-emerald-500 transition-all duration-500" style="width:0%"></div>
              </div>
            </div>
          </div>
          <div id="alb-global-ai-usage-note" class="hidden text-[10px] leading-snug mt-1.5 rounded-lg px-2 py-1.5"></div>
          <div class="text-[10px] leading-snug mt-1.5 text-muted-soft bg-canvas-soft rounded-lg px-2 py-1.5">
            <i class="fa-solid fa-circle-info mr-1 text-muted"></i>
            Angka ini cuma <b>perkiraan</b>, belum tentu pas 100%. Layanan AI-nya tidak memberi tahu sisa kuota yang sebenarnya, jadi anggap ini ancar-ancar saja ya.
          </div>
        </div>
      </div>
    `);

  }

  // [v0.9.30 #4] Binding DI LUAR blok render (selalu terpasang, walau wrap sudah ada):
  // buka panel → sembunyikan tombol kecil; klik ✕ → tutup panel & munculkan tombol lagi.
  $(document).off('click.albUsageToggle').on('click.albUsageToggle', '#alb-global-ai-usage-toggle', function () {
    $('#alb-global-ai-usage').removeClass('hidden');
    $('#alb-global-ai-usage-toggle').addClass('hidden');
  });
  $(document).off('click.albUsageClose').on('click.albUsageClose', '#alb-global-ai-usage-close', function () {
    $('#alb-global-ai-usage').addClass('hidden');
    $('#alb-global-ai-usage-toggle').removeClass('hidden');
  });

  const render = (data = {}) => {
    const pct = Number(data.percent || 0);
    const $fill = $('#alb-global-ai-usage-fill');
    const $pct = $('#alb-global-ai-usage-pct');
    const $note = $('#alb-global-ai-usage-note');
    if (!$fill.length) return;

    $fill.css('width', `${pct}%`)
      .removeClass('bg-emerald-500 bg-amber-500 bg-red-500')
      .addClass(pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500');
    $pct.text(`${pct}%`).removeClass('text-muted-soft text-amber-600 text-red-600')
      .addClass(pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-amber-600' : 'text-muted-soft');

    // Tampilkan persen ringkas di tombol toggle (tanpa harus membuka panel).
    $('#alb-global-ai-usage-toggle-pct').text(`~${pct}%`)
      .removeClass('text-muted-soft text-amber-600 text-red-600')
      .addClass(pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-amber-600' : 'text-muted-soft');

    if (data.rate_limited) {
      // Baru saja kena 429 dari Google — biasanya batas per-menit, pulih beberapa menit.
      $note.removeClass('hidden bg-amber-50 text-amber-800 border-amber-200')
        .addClass('bg-red-50 text-red-700 border border-red-200')
        .html('<i class="fa-solid fa-circle-exclamation mr-1"></i> AI sedang kena <b>batas pemakaian</b> (dipakai banyak siswa). Tunggu beberapa menit lalu coba lagi, atau gunakan <b>Jawaban Sistem</b> dulu.');
    } else if (data.exhausted) {
      $note.removeClass('hidden bg-amber-50 text-amber-800 border-amber-200')
        .addClass('bg-red-50 text-red-700 border border-red-200')
        .html(`<i class="fa-solid fa-circle-exclamation mr-1"></i> Kuota AI bersama hari ini sudah penuh. ${data.resets_at_label ? '<b>' + data.resets_at_label + '</b>. ' : ''}Sementara ini gunakan <b>Jawaban Sistem</b> ya.`);
    } else if (data.busy) {
      $note.removeClass('hidden bg-red-50 text-red-700 border-red-200')
        .addClass('bg-amber-50 text-amber-800 border border-amber-200')
        .html('<i class="fa-solid fa-hourglass-half mr-1"></i> Kuota AI bersama hampir penuh — jawaban AI mungkin lebih lambat. Kalau gagal, coba lagi nanti atau pakai <b>Jawaban Sistem</b>.');
    } else {
      $note.addClass('hidden').empty();
    }
  };

  const poll = () => {
    ApiService.get('/chat/ai-usage-global')
      .then((res) => { if (res?.status === 'success' && res.data) render(res.data); })
      .catch(() => {});
  };

  poll();
  if (window.__albGlobalUsageTimer) clearInterval(window.__albGlobalUsageTimer);
  window.__albGlobalUsageTimer = setInterval(poll, 8000);
}

function registerAlbPwa(context) {
  // Simpan projectKey terakhir → dipakai index.astro untuk mengarahkan user PWA ke AIworkspace.
  try { if (context?.projectKey) localStorage.setItem('alb:lastProjectKey', context.projectKey); } catch (_) {}

  if (!('serviceWorker' in navigator) || window.__albPwaRegistered) return;
  window.__albPwaRegistered = true;
  navigator.serviceWorker.register('/sw.js').catch(() => {});

  // [v0.9.0] Tidak lagi memaksa "buka VClass dulu". Kalau masuk lewat PWA tanpa sesi,
  // AIworkspace akan menampilkan form email + kelas (cek email) — lihat init.js.
}


export function bindWorkspaceEvents() {
  let suggestionTimer = null;

  hydrateReusableSessionIfAvailable(this);
  decorateAiUsageAutoReset(this);
  registerAlbPwa(this);
  initGlobalAiUsageBar(this);
  applyPersistedCooldownIfNeeded(this);
  applyPersistedLockdownIfNeeded(this);
  selfHealDisabledInput(this);

  bindSidebarTabs(this);
  bindContextDrawer(this);
  bindInputEvents(this, () => suggestionTimer, (timer) => { suggestionTimer = timer; });
  bindFormSubmit(this);
  bindFastGuideButtons(this);
  this.bindMentionEvents?.();        // [v0.7.0] klik item mention "@"
  this.loadMateriMentions?.();       // [v0.7.0] muat daftar materi untuk @materi-N
  bindBasicButtons(this);
  bindUnlockForm(this);
  bindChatActionButtons(this);
  bindModeSelector(this);
  bindExternalSessionGate(this);
  ensureDeleteSessionButton(this);
  ensureStudentNotesMenu(this);
  this.ensureComplaintMenu?.(this);
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

  // [#6] Tombol info → modal judul/konteks lengkap.
  $('#btn-context-info').off('click.albCtxInfo').on('click.albCtxInfo', () => context.openContextInfoModal?.());

  // [E] Accordion "Preview Konteks": toggle buka/tutup body + putar chevron.
  $('#ctx-preview-toggle').off('click.albCtxAcc').on('click.albCtxAcc', () => {
    const $body = $('#ctx-preview-body');
    const open = $body.hasClass('hidden');
    $body.toggleClass('hidden', !open);
    $('#ctx-preview-chevron').toggleClass('rotate-180', open);
  });
}

function bindInputEvents(context, getSuggestionTimer, setSuggestionTimer) {
  // [v0.9.28 #6] Input dikunci (menunggu konfirmasi) lalu dicoba diklik → toast bisa diklik.
  // Disabled input tak memancarkan event, jadi pasang di WADAH-nya (mousedown).
  const $inputWrap = $('#chat-input-wrap, #chat-form').first();
  if ($inputWrap.length) {
    $inputWrap.off('mousedown.albLocked touchstart.albLocked')
      .on('mousedown.albLocked touchstart.albLocked', (e) => {
        if (context.$inputArea?.prop('disabled')) {
          // Jangan ganggu klik tombol kirim/mode di dalam form.
          if ($(e.target).closest('#btn-send, #response-mode-dropdown, button, a').length) return;
          context.showInputLockedToast?.();
        }
      });
  }

  bindIfExists(context.$inputArea, 'input keyup paste', () => {
    setTimeout(() => {
      const val = context.$inputArea.val();
      const trimmedVal = val.trim();

      // [v0.7.0] Saran mention "@" — jika sedang mengetik token "@...", tampilkan dropdown
      // mention dan jangan tampilkan suggestion chips biasa.
      if (context.handleMentionInput?.()) return;

      // [v0.9.12] Deteksi "materi N" yang diketik biasa → tawarkan chip @materi-N.
      context.suggestMateriFromText?.();

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

      const triggerSuggestions = sanitizeSuggestionList(context.getTriggerSuggestions?.(trimmedVal) || []);
      if (triggerSuggestions.length > 0) {
        context.renderCentralSuggestionChips?.(triggerSuggestions, 'trigger');
      }

      clearTimeout(getSuggestionTimer());
      setSuggestionTimer(setTimeout(() => {
        const latestValue = context.$inputArea.val().trim();
        if (!latestValue || context.isRequesting || context.aiUsage?.cooldown_active) return;

        const canonicalSuggestions = sanitizeSuggestionList(getCanonicalSuggestions(latestValue));
        if (canonicalSuggestions.length > 0) {
          context.renderCentralSuggestionChips?.(canonicalSuggestions, 'canonical');
          return;
        }

        const currentTriggers = sanitizeSuggestionList(context.getTriggerSuggestions?.(latestValue) || []);
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

// [v0.6.0] Auto-pindah konteks halaman: kalau pertanyaan user mengarah ke halaman
// LAIN dari konteks aktif, beri tahu + pindahkan fokus sidebar, lalu jawab via SISTEM.
async function handleAutoContextSwitch(context, targetKey, text) {
  const page = PAGE_ELEMENTS.find((p) => p.key === targetKey);
  const label = page?.label || 'halaman lain';

  context.appendBubble(text, true, 'user');
  // [v0.9.10] Notif pindah konteks = kartu notif (bukan bubble jawaban) biar tak nyaru.
  context.appendBubble(
    `Sepertinya pertanyaanmu lebih cocok dengan konteks **${label}**. Aku pindahkan dulu fokusnya ke sana ya.`,
    false, 'system', [], { notice: 'context' }
  );
  context.$inputArea.val('');
  context.hideSuggestionWrapper?.();
  context.toggleSuggestions?.();

  try { await context.applyPageElements?.(targetKey, { silent: true }); } catch (_) {}

  // Jawab dalam mode SISTEM (bukan AI) sesuai konteks halaman baru.
  sendChatMessage(context, {
    message: text,
    responseMode: 'system',
    forceAI: false,
    forceFAQ: false,
    suppressUserBubble: true
  });
}

function bindFormSubmit(context) {
  bindIfExists(context.$form, 'submit', (e) => {
    e.preventDefault();

    // [v0.9.2] Tag mention kini berupa chip (di luar teks). Gabungkan dengan teks
    // pertanyaan untuk membentuk pesan lengkap ke BE.
    const rawText = context.$inputArea.val().trim();
    const chipMention = (context.activeMention && context.activeMention.token) ? context.activeMention : null;
    const text = chipMention ? `@${chipMention.token} ${rawText}`.trim() : rawText;
    if (!text || context.isRequesting) return;

    const currentElementContext = context.selectedElement;
    const modeConfig = getModeConfig(context.currentResponseMode);

    // [v0.7.0] Mention "@" punya prioritas tertinggi (chip ATAU ketik manual).
    const mention = chipMention || context.resolveMentionForSend?.(text);
    if (mention) {
      context.hideMentionDropdown?.();
      context.hideMateriFollowupDropdown?.();
      context.hideSuggestionWrapper?.();

      if (mention.type === 'elemen' && mention.el) {
        const userQ = (chipMention ? rawText : text.replace(/@[\w-]+/g, '')).trim();
        context.clearInputMention?.();
        context.$inputArea.val('');
        context.answerElementViaSystem(mention.el, userQ);
        return;
      }
      if (mention.type === 'materi') {
        context.clearInputMention?.();
        context.$inputArea.val('');
        // Materi terkunci → tolak, jangan kirim ke BE.
        if (mention.locked) {
          context.appendBubble(text, true, 'user');
          context.appendBubble(`Materi **${mention.label}** masih **terkunci** 🔒 di VClass. Selesaikan dulu materi/aktivitas sebelumnya agar bisa diakses ya.`, false, 'system');
          context.scrollToBottom?.();
          return;
        }
        context.appendBubble(text, true, 'user');
        // [v0.9.2] Hormati MODE yang dipilih user (dulu dipaksa 'system' → AI @materi tak jalan).
        sendChatMessage(context, {
          message: text,
          mention: { type: 'materi', documentId: mention.documentId || null, title: mention.label, sourceUrl: mention.url || null, label: mention.label },
          forceAI: context.forceNextAI === true ? true : modeConfig.forceAI,
          forceFAQ: context.forceNextAI === true ? false : modeConfig.forceFAQ,
          responseMode: modeConfig.responseMode,
          suppressUserBubble: true
        });
        return;
      }
    }

    // [v0.9.14] Pertanyaan sengketa jawaban kuis ("...salah padahal menurut materi benar")
    // JANGAN dipindah konteks ke Halaman Kuis — biar ditangani handler sengketa di BE.
    const looksLikeDispute = /\b(salah|keliru)\b/i.test(text)
      && /\b(padahal|menurut materi|harusnya|seharusnya|mestinya)\b/i.test(text)
      && /\b(soal|kuis|quis|jawaban|nomor|nomer)\b/i.test(text);

    // [v0.6.0] Deteksi pergeseran konteks halaman (hanya untuk pertanyaan bebas,
    // bukan saat ada elemen yang sedang dipilih).
    if (!currentElementContext && !looksLikeDispute) {
      const targetPage = resolvePageKeyFromText(text);
      const currentPage = context.contextData?.page_key || null;
      if (targetPage && targetPage !== currentPage) {
        handleAutoContextSwitch(context, targetPage, text);
        return;
      }
    }

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
        { icon: 'fa-right-to-bracket', color: 'text-blue-600', msg: 'Cara login ke VClass', intent: 'tutorial_login', label: 'Cara Login VClass' },
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
        persistLockdown(context, false);
        $('#alb-global-lock-overlay').remove();
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
  $('#alb-input-locked-notice').addClass('hidden');
  context.hideInputLockedNoticeExternal?.();
  context.$inputArea
    .prop('disabled', false)
    .attr('placeholder', 'Tanya sesuatu atau pilih elemen...')
    .focus();
  context.$btnSend.prop('disabled', false);
}

// [v0.9.27 #3] Paginasi sadar-viewport: DESKTOP 5/halaman (data-alb-page/data-total-pages),
// MOBILE 1/halaman (data-alb-mpage/data-total-mpages).
function albIsMobileViewport() {
  try { return window.matchMedia('(max-width:680px)').matches; } catch (_) { return false; }
}

function albApplyLmsPage($wrap, page) {
  const mobile = albIsMobileViewport();
  const max = Math.max(1, Number($wrap.attr(mobile ? 'data-total-mpages' : 'data-total-pages') || 1));
  const next = Math.max(1, Math.min(max, Number(page) || 1));
  const rowAttr = mobile ? 'data-alb-mpage' : 'data-alb-page';
  $wrap.attr(mobile ? 'data-mpage' : 'data-page', String(next));
  $wrap.find('[' + rowAttr + ']').each((_, row) => {
    const $row = $(row);
    $row.css('display', Number($row.attr(rowAttr)) === next ? '' : 'none');
  });
  $wrap.find('[data-page-info]').text(`Halaman ${next} dari ${max}`);
  $wrap.find('.alb-lms-page-btn[data-dir="-1"]').prop('disabled', next <= 1);
  $wrap.find('.alb-lms-page-btn[data-dir="1"]').prop('disabled', next >= max);
}

function paginateLmsTableFromButton($btn) {
  const $wrap = $btn.closest('[data-alb-lms-table]');
  if (!$wrap.length) return;
  const mobile = albIsMobileViewport();
  const current = Math.max(1, Number($wrap.attr(mobile ? 'data-mpage' : 'data-page') || 1));
  albApplyLmsPage($wrap, current + Number($btn.attr('data-dir') || 0));
}

// Sinkronkan semua tabel LMS ke state viewport saat ini (dipanggil saat render & resize).
export function syncLmsTablesPagination() {
  const $area = this?.$chatArea && this.$chatArea.length ? this.$chatArea : $(document);
  const mobile = albIsMobileViewport();
  $area.find('[data-alb-lms-table]').each((_, w) => {
    const $wrap = $(w);
    albApplyLmsPage($wrap, Number($wrap.attr(mobile ? 'data-mpage' : 'data-page')) || 1);
  });
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
    .off('click', '.alb-lms-page-btn')
    .on('click', '.alb-lms-page-btn', (e) => {
      e.preventDefault();
      e.stopPropagation();
      paginateLmsTableFromButton($(e.currentTarget));
    });

  // [v0.9.13] Tombol "Tonton Video" → buka modal video tutorial.
  context.$chatArea
    .off('click', '.btn-video-tutorial')
    .on('click', '.btn-video-tutorial', (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      openVideoTutorialModal({ url: $btn.attr('data-url') || '', title: $btn.attr('data-title') || 'Video Tutorial' });
    });

  // [v0.9.16] Tombol "Lihat Review Jawaban" → modal HTML bukti dari Moodle.
  context.$chatArea
    .off('click', '.btn-open-html-view')
    .on('click', '.btn-open-html-view', (e) => {
      e.preventDefault();
      try {
        const payload = JSON.parse(decodeURIComponent($(e.currentTarget).attr('data-payload') || '%7B%7D'));
        openHtmlViewModal(payload);
      } catch (_) { Toast.show('Gagal membuka review.', 'error'); }
    });

  context.$chatArea
    .off('click', '.btn-open-vclass-modal')
    .on('click', '.btn-open-vclass-modal', (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      openVclassPreviewModal($btn.attr('data-url') || '', $btn.attr('data-title') || 'Preview VClass');
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
      enableChatInputAfterFeedback(context);
      openWaFormOnce(context, e.currentTarget);
    });

  context.$chatArea
    .off('click', '.btn-wa-specific-task')
    .on('click', '.btn-wa-specific-task', (e) => {
      e.preventDefault();
      enableChatInputAfterFeedback(context);
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

      $wrap.removeAttr('data-waiting-feedback');
      enableChatInputAfterFeedback(context);
      Toast.show('Terima kasih. Jawaban sistem ditandai membantu.', 'success');
    });

  // [v0.8.1] Tombol konfirmasi tipe SCORING — memengaruhi deteksi kesulitan.
  // Fungsinya sama (buka input lagi), tapi mengirim sinyal "terbantu/teratasi" ke server.
  context.$chatArea
    .off('click', '.btn-feedback-resolved')
    .on('click', '.btn-feedback-resolved', (e) => {
      e.preventDefault();

      const $btn = $(e.currentTarget);
      const $wrap = $btn.closest('.alb-system-message-wrap');

      $wrap.find('.alb-action-group button')
        .prop('disabled', true)
        .addClass('opacity-60 cursor-not-allowed');

      $btn
        .removeClass('bg-emerald-50 opacity-60 cursor-not-allowed')
        .addClass('bg-emerald-600 text-white')
        .html('<i class="fa-solid fa-circle-check"></i> Terbantu, makasih!');

      $wrap.removeAttr('data-waiting-feedback');
      enableChatInputAfterFeedback(context);

      // Kirim sinyal resolusi ke server (memengaruhi skor kesulitan).
      ApiService.post('/chat/feedback', { sessionId: context.sessionId, type: 'resolved' }).catch(() => {});
      Toast.show('Senang bisa membantu! 🎉', 'success');
    });

  context.$chatArea
    .off('click', '.btn-system-feedback-ai')
    .on('click', '.btn-system-feedback-ai', (e) => handleSystemFeedbackAi(context, e));

  // [v0.4.0] Salin pertanyaan user.
  context.$chatArea
    .off('click', '.btn-user-copy')
    .on('click', '.btn-user-copy', function () {
      const msg = decodeURIComponent($(this).attr('data-msg') || '');
      if (!msg) return;
      const done = () => Toast.show('Pertanyaan disalin ke clipboard.', 'success');
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(msg).then(done).catch(() => Toast.show('Gagal menyalin.', 'error'));
      } else {
        const ta = document.createElement('textarea');
        ta.value = msg; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (_) {}
        document.body.removeChild(ta);
      }
    });

  // [v0.9.1] Salin jawaban bot (hanya teks, tombol/visual tidak ikut).
  context.$chatArea
    .off('click', '.btn-bot-copy')
    .on('click', '.btn-bot-copy', function () {
      const msg = decodeURIComponent($(this).attr('data-copy') || '');
      if (!msg) return;
      const done = () => Toast.show('Jawaban disalin ke clipboard.', 'success');
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(msg).then(done).catch(() => Toast.show('Gagal menyalin.', 'error'));
      } else {
        const ta = document.createElement('textarea');
        ta.value = msg; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (_) {}
        document.body.removeChild(ta);
      }
    });

  // [v0.4.3] Kirim ulang pertanyaan yang sama — panggil sendChatMessage langsung
  // (lebih andal daripada $btnSend.click() yang tidak selalu memicu submit form).
  context.$chatArea
    .off('click', '.btn-user-reload')
    .on('click', '.btn-user-reload', function () {
      const msg = decodeURIComponent($(this).attr('data-msg') || '');
      if (!msg || context.isRequesting) return;
      if (isCooldownBlocking(context)) { showCooldownToast(context); return; }
      const modeConfig = getModeConfig(context.currentResponseMode);
      sendChatMessage(context, {
        message: msg,
        forceAI: modeConfig.forceAI,
        forceFAQ: modeConfig.forceFAQ,
        responseMode: modeConfig.responseMode
      });
    });

  // [v0.9.10] Tutup kartu notif/pengingat.
  context.$chatArea
    .off('click', '.btn-dismiss-notice')
    .on('click', '.btn-dismiss-notice', (e) => {
      e.preventDefault();
      $(e.currentTarget).closest('.alb-system-notice').slideUp(160, function () { $(this).remove(); });
    });

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

  // [v0.9.17] Tombol "Buka Form Komplain" (dari intent komplain samar) → buka modal terpandu.
  context.$chatArea
    .off('click', '.btn-open-complaint')
    .on('click', '.btn-open-complaint', (e) => {
      e.preventDefault();
      markSingleChatButtonClicked($(e.currentTarget));
      context.openComplaintComposer?.(context);
    });

  // [v0.9.19] Tombol "Kirim ulang" pada bubble error/timeout → ulangi request terakhir.
  context.$chatArea
    .off('click', '.btn-resend-last')
    .on('click', '.btn-resend-last', (e) => {
      e.preventDefault();
      const payload = context._lastFailedSend;
      if (!payload || !payload.message) return;
      markSingleChatButtonClicked($(e.currentTarget));
      context._lastFailedSend = null;
      sendChatMessage(context, { message: payload.message, ...payload.options });
    });

  // [v0.9.24] Tombol pilihan disambiguasi → kirim ulang dgn INTENT EKSPLISIT (bypass tebak).
  context.$chatArea
    .off('click', '.btn-pick-intent')
    .on('click', '.btn-pick-intent', (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      const pickIntent = $btn.attr('data-intent') || '';
      const prompt = $btn.attr('data-prompt') || '';
      if (!prompt) return;
      markSingleChatButtonClicked($btn);
      sendChatMessage(context, { message: prompt, intent: pickIntent || null, responseMode: 'system', forceAI: false });
    });

  // [v0.9.8] Tombol "buat yang baru" pada hasil @materi → kirim ulang task yang sama
  // dengan freshMention=true supaya AI menghasilkan jawaban berbeda (bukan dari cache).
  context.$chatArea
    .off('click', '.btn-mention-regenerate')
    .on('click', '.btn-mention-regenerate', (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      const token = $btn.attr('data-token') || '';
      const prompt = $btn.attr('data-prompt') || '';
      if (!token || !prompt) return;
      markSingleChatButtonClicked($btn);
      const mention = context.resolveMentionForSend?.(`@${token}`) || null;
      context.sendDirectMessage?.({
        message: `@${token} ${prompt}`,
        mention,
        freshMention: true,
        forceAI: true,
        responseMode: 'short'
      });
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
  const aiPrompt = cleanPrompt || 'Jelaskan cara menggunakan fitur ini secara jelas dan singkat.';

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
    // [FIX] JANGAN pakai $btn.data('payload') — jQuery mengembalikan string ter-encode
    // (%7B...) sehingga .message jadi undefined dan jatuh ke prompt generik.
    // Selalu decode dari atribut mentah.
    const payloadData = JSON.parse(decodeURIComponent(rawPayload));
    const aiMessage = payloadData.message || payloadData.ai_message || payloadData.original_message || 'Jelaskan materi ini secara jelas dan singkat.';
    const sourceAnswer = payloadData.source_answer || '';

    updateModeUI(context, 'ai_short');
    context.updateResponseModeUI?.();

    sendChatMessage(context, {
      message: aiMessage,
      forceAI: payloadData.forceAI !== false,
      forceFAQ: false,
      intent: payloadData.intent || null,
      expectedSourceType: payloadData.expectedSourceType || 'all',
      responseMode: payloadData.responseMode || 'short',
      pageContext: {
        ...(context.contextData || {}),
        previous_system_answer: sourceAnswer,
        ai_followup_type: 'static_tutorial_followup'
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
