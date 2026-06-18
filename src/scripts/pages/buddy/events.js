import $ from 'jquery';
import Toast from '../../components/toast.js';
import { Modal } from '../../components/modal.js';
import { ApiService } from '../../fetch/api.js';
import { resolvePageKeyFromText, PAGE_ELEMENTS } from './pageElements.js';

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
        <iframe id="alb-vclass-preview-frame" class="w-full flex-1 bg-white border-0" sandbox="allow-same-origin allow-scripts allow-forms allow-popups" referrerpolicy="no-referrer"></iframe>
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

  ensureFullScreenCooldownOverlay(context, remainingSeconds);

  if (typeof context.updateAiUsageUI === 'function') {
    context.updateAiUsageUI(context.aiUsage);
  } else if (typeof context.triggerCooldown === 'function') {
    context.triggerCooldown();
  }
}

function isCooldownBlocking(context) {
  return Boolean(context.aiUsage?.cooldown_active) || Number(context.aiUsage?.cooldown_remaining_seconds || 0) > 0;
}

function getLocalScopeKey(context, suffix) {
  const host = window.location.host || 'localhost';
  const projectKey = context?.projectKey || context?.project_key || 'default-project';
  return `alb:${host}:${projectKey}:${suffix}`;
}

function persistLockdown(context, locked = true, extra = {}) {
  const key = getLocalScopeKey(context, 'lockdown');
  if (!locked) {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, JSON.stringify({
    locked: true,
    reason: extra.reason || 'profanity_limit',
    warnings: Number(extra.warnings || 3),
    savedAt: Date.now()
  }));
}

function readPersistedLockdown(context) {
  try {
    const raw = localStorage.getItem(getLocalScopeKey(context, 'lockdown'));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.locked ? parsed : null;
  } catch (_) {
    return null;
  }
}

function ensureFullScreenCooldownOverlay(context, remainingOverride = null) {
  const remainingSeconds = Number(
    remainingOverride || context?.aiUsage?.cooldown_remaining_seconds || AI_COOLDOWN_FALLBACK_SECONDS
  );

  const endAt = Date.now() + Math.max(1, remainingSeconds) * 1000;
  localStorage.setItem(getLocalScopeKey(context, 'cooldown'), JSON.stringify({ endAt }));

  if (!$('#alb-global-cooldown-overlay').length) {
    $('body').append(`
      <div id="alb-global-cooldown-overlay" class="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
        <div class="w-full max-w-[460px] bg-white rounded-3xl shadow-2xl border border-white/20 p-6 text-center">
          <div class="w-16 h-16 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-2xl mb-4">
            <i class="fa-solid fa-hourglass-half"></i>
          </div>
          <h2 class="text-[22px] font-black text-ink mb-2">AI Buddy sedang cooldown</h2>
          <p class="text-[14px] text-body leading-6 mb-4">Batas penggunaan AI sementara tercapai. Seluruh layar ditahan dulu supaya tidak terjadi request berulang.</p>
          <div class="bg-canvas-soft border border-hairline rounded-2xl p-4">
            <div class="text-[12px] text-muted-soft mb-1">Tunggu sekitar</div>
            <div id="alb-global-cooldown-time" class="text-[34px] font-black text-primary tracking-tight">03:00</div>
          </div>
        </div>
      </div>
    `);
  }

  const tick = () => {
    const remain = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    const minutes = Math.floor(remain / 60).toString().padStart(2, '0');
    const seconds = (remain % 60).toString().padStart(2, '0');
    $('#alb-global-cooldown-time').text(`${minutes}:${seconds}`);

    if (remain <= 0) {
      clearInterval(window.__albGlobalCooldownTimer);
      window.__albGlobalCooldownTimer = null;
      localStorage.removeItem(getLocalScopeKey(context, 'cooldown'));
      $('#alb-global-cooldown-overlay').remove();
      if (context?.aiUsage) {
        context.aiUsage.cooldown_active = false;
        context.aiUsage.cooldown_remaining_seconds = 0;
        context.aiUsage.used = 0;
        context.aiUsage.remaining = Number(context.aiUsage.max || 3);
        context.aiUsage.limit_reached = false;
        context.aiUsage.canUseAI = true;
        if (typeof context.updateAiUsageUI === 'function') context.updateAiUsageUI(context.aiUsage);
      }
      return;
    }
  };

  if (window.__albGlobalCooldownTimer) clearInterval(window.__albGlobalCooldownTimer);
  tick();
  window.__albGlobalCooldownTimer = setInterval(tick, 1000);
}

function applyPersistedCooldownIfNeeded(context) {
  try {
    const raw = localStorage.getItem(getLocalScopeKey(context, 'cooldown'));
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const remain = Math.ceil((Number(parsed.endAt || 0) - Date.now()) / 1000);
    if (remain > 0) ensureFullScreenCooldownOverlay(context, remain);
    else localStorage.removeItem(getLocalScopeKey(context, 'cooldown'));
  } catch (_) {}
}

function ensureLocalLockOverlay(context, persisted = {}) {
  persistLockdown(context, true, persisted);

  if (typeof context?.handleLockdown === 'function') {
    context.handleLockdown(true);
  }

  if (!$('#alb-global-lock-overlay').length) {
    $('body').append(`
      <div id="alb-global-lock-overlay" class="fixed inset-0 z-[100000] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
        <div class="w-full max-w-[500px] bg-white rounded-3xl shadow-2xl border border-white/20 p-6">
          <div class="text-center mb-5">
            <div class="w-16 h-16 mx-auto rounded-full bg-red-100 text-red-700 flex items-center justify-center text-2xl mb-4"><i class="fa-solid fa-lock"></i></div>
            <h2 class="text-[22px] font-black text-ink mb-2">Chat dikunci sementara</h2>
            <p class="text-[14px] text-body leading-6">Batas peringatan bahasa kurang pantas sudah mencapai <b>${Number(persisted.warnings || 3)}/3</b>. Minta key pembuka ke guru, lalu isi form di bawah.</p>
          </div>
          <div class="space-y-3">
            <input id="alb-global-unlock-name" type="text" class="w-full bg-canvas-soft border border-hairline rounded-xl px-4 py-3 text-[14px] text-ink outline-none focus:border-primary" placeholder="Nama siswa" value="${sessionStorage.getItem('alb_student_name') || ''}">
            <input id="alb-global-unlock-key" type="text" class="w-full bg-canvas-soft border border-hairline rounded-xl px-4 py-3 text-[14px] text-ink outline-none focus:border-primary" placeholder="Key dari guru">
            <button id="alb-global-unlock-submit" type="button" class="w-full bg-primary hover:bg-primary-active text-white rounded-xl px-4 py-3 text-[14px] font-bold transition-colors">Verifikasi & Buka Akses</button>
          </div>
          <button id="alb-global-unlock-wa" type="button" class="mt-3 w-full bg-green-500 hover:bg-green-600 text-white rounded-xl px-4 py-3 text-[14px] font-bold transition-colors"><i class="fa-brands fa-whatsapp mr-1"></i> Minta key ke guru</button>
        </div>
      </div>
    `);
  }

  $('#alb-global-unlock-wa').off('click').on('click', () => {
    const text = encodeURIComponent('Halo Pak/Bu, chat AI Buddy saya terkunci karena peringatan bahasa. Mohon key pembukanya.');
    window.open(`https://api.whatsapp.com/send/?phone=628989807094&text=${text}`, '_blank', 'noopener,noreferrer');
  });

  $('#alb-global-unlock-submit').off('click').on('click', async () => {
    const name = $('#alb-global-unlock-name').val().trim();
    const key = $('#alb-global-unlock-key').val().trim();
    if (!name || !key) return Toast.show('Nama dan key wajib diisi.', 'error');

    $('#alb-global-unlock-submit').prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Memverifikasi...');
    try {
      try {
        await ApiService.patch(`/chat/session/${context.sessionId}/profile`, { student_name: name });
        sessionStorage.setItem('alb_student_name', name);
      } catch (_) {}

      const res = await ApiService.post('/chat/unlock', { sessionId: context.sessionId, key });
      if (res?.status === 'success') {
        persistLockdown(context, false);
        $('#alb-global-lock-overlay').remove();
        context.handleLockdown?.(false);
        Toast.show('Chat berhasil dibuka kembali.', 'success');
      } else {
        Toast.show(res?.message || 'Key salah atau kedaluwarsa.', 'error');
      }
    } catch (err) {
      Toast.show('Gagal menghubungi server.', 'error');
    } finally {
      $('#alb-global-unlock-submit').prop('disabled', false).html('Verifikasi & Buka Akses');
      $('#alb-global-unlock-key').val('');
    }
  });
}

function applyPersistedLockdownIfNeeded(context) {
  const persisted = readPersistedLockdown(context);
  if (persisted) ensureLocalLockOverlay(context, persisted);
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
  context.appendTypingIndicator?.();
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
    mention: options.mention || null
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
          // Rekomendasi proaktif — jangan kunci input (boleh diabaikan/ditindaklanjuti).
          context.appendBubble(reco.message, false, 'system', reco.actions || [], { noFeedbackLock: true });
          context.scrollToBottom?.();
        }, 450);
      }

      if (res.data.is_locked) {
        ensureLocalLockOverlay(context, { warnings: res.data.warnings || 3, reason: res.data.lock_reason || 'profanity_limit' });
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


function getVerifiedStudentKey(context, email = '', classCode = '') {
  const host = window.location.host || 'localhost';
  const projectKey = context?.projectKey || context?.project_key || 'default-project';
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanClass = String(classCode || '').trim().toUpperCase();
  return `alb:${host}:${projectKey}:student-session:${cleanEmail}:${cleanClass}`;
}

function readActiveStudentIdentity(context) {
  try {
    const host = window.location.host || 'localhost';
    const projectKey = context?.projectKey || context?.project_key || 'default-project';
    const raw = localStorage.getItem(`alb:${host}:${projectKey}:active-student`);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function writeActiveStudentIdentity(context, identity = {}) {
  try {
    const host = window.location.host || 'localhost';
    const projectKey = context?.projectKey || context?.project_key || 'default-project';
    localStorage.setItem(`alb:${host}:${projectKey}:active-student`, JSON.stringify({ ...identity, savedAt: Date.now() }));
  } catch (_) {}
}

function persistReusableStudentSession(context, identity = {}) {
  // [FIX SM-4] Email & kelas sering tidak ada di `identity` yang dioper (mis. saat
  // dipanggil setelah kirim pesan). Ambil dari identitas terverifikasi di
  // sessionStorage / contextData supaya kunci reuse benar-benar tertulis.
  let lmsIdentity = {};
  try { lmsIdentity = JSON.parse(sessionStorage.getItem('alb_student_lms_identity') || '{}') || {}; } catch (_) { lmsIdentity = {}; }
  const meta = (context?.contextData && context.contextData.session_meta) || {};

  const email = identity.email || identity.student_email || identity.username
    || lmsIdentity.email || sessionStorage.getItem('alb_student_email') || meta.email || '';
  const classCode = identity.class_code || identity.classCode || identity.kelas
    || lmsIdentity.class_code || sessionStorage.getItem('alb_student_class_code') || meta.class_code || '';
  const sessionId = identity.sessionId || identity.session_id || context?.sessionId || '';
  if (!email || !classCode || !sessionId) return;

  // Lengkapi atribut lain dari identitas terverifikasi bila kosong.
  identity = {
    moodle_user_id: lmsIdentity.moodle_user_id || meta.moodle_user_id,
    fullname: lmsIdentity.fullname || meta.display_name,
    course_id: lmsIdentity.course_id || meta.course_id,
    course_title: lmsIdentity.course_title || meta.course_title,
    ...identity
  };

  const payload = {
    sessionId,
    email: String(email).trim().toLowerCase(),
    class_code: String(classCode).trim().toUpperCase(),
    moodle_user_id: identity.moodle_user_id || identity.userid || null,
    fullname: identity.fullname || identity.display_name || identity.name || '',
    course_id: identity.course_id || identity.courseId || null,
    course_title: identity.course_title || '',
    savedAt: Date.now()
  };

  localStorage.setItem(getVerifiedStudentKey(context, payload.email, payload.class_code), JSON.stringify(payload));
  writeActiveStudentIdentity(context, payload);

  // Simpan registry kecil di DB supaya 1 siswa dapat memakai 1 session yang sama.
  // Kalau endpoint belum dipasang, localStorage tetap menjadi fallback.
  ApiService.post('/student-sessions/register', {
    projectKey: context?.projectKey,
    projectId: context?.projectId,
    sessionId: payload.sessionId,
    email: payload.email,
    classCode: payload.class_code,
    student_name: payload.fullname,
    moodle_user_id: payload.moodle_user_id,
    course_id: payload.course_id,
    course_title: payload.course_title
  }).catch(() => null);
}

function readReusableStudentSession(context, email = '', classCode = '') {
  try {
    const raw = localStorage.getItem(getVerifiedStudentKey(context, email, classCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.sessionId ? parsed : null;
  } catch (_) { return null; }
}

function removeReusableStudentSession(context) {
  const active = readActiveStudentIdentity(context);
  if (active?.email && active?.class_code) {
    localStorage.removeItem(getVerifiedStudentKey(context, active.email, active.class_code));
  }
  const host = window.location.host || 'localhost';
  const projectKey = context?.projectKey || context?.project_key || 'default-project';
  localStorage.removeItem(`alb:${host}:${projectKey}:active-student`);
  sessionStorage.removeItem('alb_student_name');
  sessionStorage.removeItem('alb_student_email');
  sessionStorage.removeItem('alb_student_class');
}

function hydrateReusableSessionIfAvailable(context) {
  const active = readActiveStudentIdentity(context);
  if (!active?.sessionId) return false;
  if (context.sessionId && String(context.sessionId) === String(active.sessionId)) return true;

  context.sessionId = active.sessionId;
  context.contextData = {
    ...(context.contextData || {}),
    session_meta: {
      ...(context.contextData?.session_meta || {}),
      email: active.email,
      class_code: active.class_code,
      moodle_user_id: active.moodle_user_id || null,
      display_name: active.fullname || active.email,
      course_id: active.course_id || null,
      course_title: active.course_title || null,
      moodle_verified: true
    }
  };
  return true;
}


function ensureDeleteSessionModal(context) {
  if ($('#alb-delete-session-modal').length) return;

  $('body').append(`
    <div id="alb-delete-session-modal" class="hidden fixed inset-0 z-[9999] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white border border-hairline rounded-2xl shadow-2xl w-full max-w-[430px] overflow-hidden">
        <div class="p-5 border-b border-hairline">
          <div class="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-3">
            <i class="fa-solid fa-trash-can"></i>
          </div>
          <h3 class="text-[18px] font-black text-ink mb-1">Hapus session siswa?</h3>
          <p class="text-[14px] text-muted leading-6">
            Session siswa yang tersimpan akan dihapus. Setelah itu siswa perlu mulai sesi ulang dari form awal.
          </p>
        </div>
        <div class="p-4 flex items-center justify-end gap-2 bg-canvas-soft">
          <button type="button" id="alb-cancel-delete-session" class="px-4 py-2 rounded-full border border-hairline bg-white text-[13px] font-bold text-ink hover:bg-surface-strong">Batal</button>
          <button type="button" id="alb-confirm-delete-session" class="px-4 py-2 rounded-full bg-red-600 text-white text-[13px] font-bold hover:bg-red-700">Ya, hapus</button>
        </div>
      </div>
    </div>
  `);

  $('#alb-cancel-delete-session').on('click', () => $('#alb-delete-session-modal').addClass('hidden'));
  $('#alb-delete-session-modal').on('click', function (e) {
    if (e.target === this) $(this).addClass('hidden');
  });

  $('#alb-confirm-delete-session').on('click', async function () {
    const $btn = $(this);
    const oldText = $btn.html();
    $btn.prop('disabled', true).addClass('opacity-70 cursor-not-allowed').html('<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menghapus...');

    const oldSessionId = context.sessionId;
    removeReusableStudentSession(context);

    try {
      if (oldSessionId) {
        await ApiService.delete(`/student-sessions/session/${oldSessionId}`).catch(() => null);
        await ApiService.delete(`/chat/session/${oldSessionId}`).catch(() => null);
      }
      Toast.show('Session sudah dihapus. Silakan mulai sesi ulang.', 'success');
      $('#alb-delete-session-modal').addClass('hidden');
      setTimeout(() => {
        window.location.href = `/buddy?projectKey=${encodeURIComponent(context.projectKey || '')}`;
      }, 450);
    } catch (error) {
      console.error('[Delete Session] gagal:', error);
      Toast.show('Gagal menghapus session.', 'error');
      $btn.prop('disabled', false).removeClass('opacity-70 cursor-not-allowed').html(oldText);
    }
  });
}

function ensureDeleteSessionButton(context) {
  const $chip = context.$btnSessionInfo || $('#btn-session-info, #alb-session-chip, [data-alb-session-chip]').first();
  if (!$chip?.length) return;

  const $header = $chip.closest('header');
  let $wrap = $('#alb-session-actions-wrap');

  if (!$wrap.length) {
    $wrap = $('<div id="alb-session-actions-wrap" class="flex items-center gap-2 shrink-0"></div>');

    if ($header.length) {
      const $deleteExisting = $('#alb-delete-session-btn');
      $chip.before($wrap);
      $wrap.append($chip.detach());
      if ($deleteExisting.length) $wrap.append($deleteExisting.detach());
    } else {
      $chip.wrap($wrap);
      $wrap = $('#alb-session-actions-wrap');
    }
  } else if (!$chip.closest('#alb-session-actions-wrap').length) {
    $wrap.prepend($chip.detach());
  }

  $chip.removeClass('ml-2').addClass('shrink-0');

  if ($('#alb-delete-session-btn').length) {
    const $existing = $('#alb-delete-session-btn')
      .removeClass('ml-2')
      .addClass('shrink-0')
      .appendTo($wrap);

    $existing.off('click.albDeleteSession').on('click.albDeleteSession', () => {
      ensureDeleteSessionModal(context);
      $('#alb-delete-session-modal').removeClass('hidden');
    });
    return;
  }

  const $btn = $(`
    <button type="button" id="alb-delete-session-btn" class="inline-flex items-center gap-1.5 rounded-full border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600 hover:bg-red-100 transition-colors shrink-0" title="Hapus session siswa tersimpan">
      <i class="fa-solid fa-trash-can"></i>
      <span class="hidden sm:inline">Hapus Session</span>
    </button>
  `);

  $wrap.append($btn);
  $btn.on('click', () => {
    ensureDeleteSessionModal(context);
    $('#alb-delete-session-modal').removeClass('hidden');
  });
}

function findExternalSessionFields() {
  const $email = $('#alb-student-email, #student-email, #student_email, input[name="student_email"], input[name="email"]').filter(':visible').first();
  const $class = $('#alb-student-class, #student-class, #student_class, select[name="classCode"], select[name="class_code"], select[name="kelas"]').filter(':visible').first();
  const $start = $('#alb-btn-start-session, #btn-start-session, [data-alb-start-session], button:contains("Mulai sesi"), button:contains("Mulai Sesi")').filter(':visible').first();
  return { $email, $class, $start };
}

function bindExternalSessionGate(context) {
  const { $email, $class, $start } = findExternalSessionFields();
  if (!$start.length || $start.data('albGateBound')) return;
  $start.data('albGateBound', true);

  let verifiedIdentity = null;
  const setStartEnabled = (enabled, message = '') => {
    $start.prop('disabled', !enabled)
      .toggleClass('opacity-60 cursor-not-allowed', !enabled)
      .attr('title', enabled ? 'Mulai sesi AI Buddy' : (message || 'Isi email dan kelas terlebih dahulu'));
  };

  const validate = async () => {
    const email = String($email.val() || '').trim().toLowerCase();
    const classCode = String($class.val() || '').trim().toUpperCase();
    verifiedIdentity = null;

    if (!email || !email.includes('@') || !classCode) {
      setStartEnabled(false, 'Isi email Moodle dan kelas terlebih dahulu.');
      return;
    }

    const reusable = readReusableStudentSession(context, email, classCode);
    if (reusable?.sessionId) {
      context.sessionId = reusable.sessionId;
      persistReusableStudentSession(context, reusable);
      verifiedIdentity = reusable;
      setStartEnabled(true);
      Toast.show('Session lama siswa ditemukan. Sesi akan dilanjutkan.', 'success');
      return;
    }

    const reuseQuery = new URLSearchParams({ projectKey: context.projectKey || '', projectId: context.projectId || '', email, classCode }).toString();
    const reuseRes = await ApiService.get(`/student-sessions/reuse?${reuseQuery}`).catch(() => null);
    if (reuseRes?.status === 'success' && reuseRes.data?.found && reuseRes.data?.session?.session_id) {
      const oldSession = reuseRes.data.session;
      const reusableFromDb = {
        sessionId: oldSession.session_id,
        email: oldSession.student_email || email,
        class_code: oldSession.class_code || classCode,
        fullname: oldSession.student_name || '',
        moodle_user_id: oldSession.moodle_user_id || null,
        course_id: oldSession.course_id || null,
        course_title: oldSession.course_title || ''
      };
      context.sessionId = reusableFromDb.sessionId;
      persistReusableStudentSession(context, reusableFromDb);
      verifiedIdentity = reusableFromDb;
      setStartEnabled(true);
      Toast.show('Session lama siswa ditemukan dari server. Sesi dilanjutkan.', 'success');
      return;
    }

    setStartEnabled(false, 'Sedang memvalidasi email ke Moodle...');
    const res = await ApiService.post('/moodle/student/resolve', {
      projectKey: context.projectKey,
      projectId: context.projectId,
      sessionId: context.sessionId,
      email,
      classCode
    });

    if (res?.status === 'success' && res.data?.found) {
      verifiedIdentity = { ...res.data, email, class_code: res.data.class_code || classCode, sessionId: context.sessionId };
      persistReusableStudentSession(context, verifiedIdentity);
      sessionStorage.setItem('alb_student_email', email);
      sessionStorage.setItem('alb_student_class', verifiedIdentity.class_code || classCode);
      setStartEnabled(true);
      Toast.show('Email Moodle valid. Sesi bisa dimulai.', 'success');
    } else {
      setStartEnabled(false, res?.data?.message || res?.message || 'Email tidak ditemukan di kelas tersebut.');
      Toast.show(res?.data?.message || res?.message || 'Email tidak ditemukan di Moodle untuk kelas itu.', 'error');
    }
  };

  setStartEnabled(false, 'Isi email Moodle dan kelas terlebih dahulu.');
  $email.add($class).on('input change blur', () => {
    clearTimeout(window.__albSessionGateTimer);
    window.__albSessionGateTimer = setTimeout(validate, 450);
  });

  $start.on('click', (event) => {
    const email = String($email.val() || '').trim().toLowerCase();
    const classCode = String($class.val() || '').trim().toUpperCase();
    const reusable = readReusableStudentSession(context, email, classCode);
    if (reusable?.sessionId) {
      context.sessionId = reusable.sessionId;
      persistReusableStudentSession(context, reusable);
      return;
    }
    if (!verifiedIdentity) {
      event.preventDefault();
      event.stopImmediatePropagation();
      validate();
    }
  });
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

        <div id="alb-global-ai-usage" class="hidden mt-1.5 bg-surface-card border border-hairline rounded-xl p-2.5">
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

    // Toggle buka/tutup panel kuota.
    $(document).off('click.albUsageToggle').on('click.albUsageToggle', '#alb-global-ai-usage-toggle', function () {
      $('#alb-global-ai-usage').toggleClass('hidden');
      $(this).find('.fa-chevron-down').toggleClass('rotate-180');
    });
  }

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

function getNotesIdentity(context) {
  const active = readActiveStudentIdentity(context) || {};
  const meta = context.contextData?.session_meta || {};
  return {
    projectKey: context.projectKey || '',
    projectId: context.projectId || '',
    sessionId: context.sessionId || active.sessionId || '',
    student_email: active.email || meta.email || sessionStorage.getItem('alb_student_email') || '',
    class_code: active.class_code || meta.class_code || sessionStorage.getItem('alb_student_class') || '',
    student_name: active.fullname || meta.display_name || sessionStorage.getItem('alb_student_name') || ''
  };
}

function ensureStudentNotesMenu(context) {
  const $guide = context.$tabContentGuide?.length ? context.$tabContentGuide : $('#tab-content-guide');
  if (!$guide.length || $guide.find('[data-alb-notes-menu="1"]').length) return;

  $guide.append(`
    <div data-alb-notes-menu="1" class="mt-5 pt-4 border-t border-hairline space-y-3">
      <div class="px-1">
        <div class="text-[10px] font-black uppercase tracking-[0.12em] text-muted flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-primary/60"></span>Menu Catatan</div>
        <div class="text-[11px] text-muted-soft mt-0.5 leading-snug">Catatan kecil yang disimpan sistem, bukan AI.</div>
      </div>
      <div class="space-y-2.5">
        <button type="button" id="alb-note-add-btn" class="w-full text-left bg-white hover:bg-canvas-soft border border-hairline rounded-xl px-3 py-3 flex items-center gap-3 transition-colors"><i class="fa-solid fa-note-sticky text-amber-500"></i><span><b class="block text-[13px] text-ink">Tambah Catatan</b><small class="text-[11px] text-muted-soft">Simpan pengingat singkat</small></span></button>
        <button type="button" id="alb-note-list-btn" class="w-full text-left bg-white hover:bg-canvas-soft border border-hairline rounded-xl px-3 py-3 flex items-center gap-3 transition-colors"><i class="fa-solid fa-table-list text-primary"></i><span><b class="block text-[13px] text-ink">Lihat Catatan</b><small class="text-[11px] text-muted-soft">Cari, edit, dan hapus catatan</small></span></button>
      </div>
    </div>
  `);

  $('#alb-note-add-btn').on('click', () => openStudentNotesModal(context, 'add'));
  $('#alb-note-list-btn').on('click', () => openStudentNotesModal(context, 'list'));
}

function ensureStudentNotesModal() {
  if ($('#alb-student-notes-modal').length) return;
  $('body').append(`
    <div id="alb-student-notes-modal" class="hidden fixed inset-0 z-[9700] bg-slate-950/60 backdrop-blur-sm p-3 md:p-6">
      <div class="bg-surface-card w-full max-w-[900px] mx-auto h-full md:h-[86vh] rounded-2xl shadow-2xl border border-hairline flex flex-col overflow-hidden">
        <div class="px-4 py-3 border-b border-hairline bg-white flex items-center justify-between gap-3 shrink-0">
          <div>
            <div id="alb-notes-modal-title" class="text-[15px] font-black text-ink">Catatan Siswa</div>
            <div class="text-[11px] text-muted-soft">Data disimpan oleh sistem, bukan jawaban AI.</div>
          </div>
          <button type="button" id="alb-notes-close" class="w-9 h-9 rounded-full bg-surface-strong border border-hairline text-ink hover:bg-hairline"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="md:hidden p-3 bg-white border-b border-hairline shrink-0">
          <div class="grid grid-cols-2 gap-2 bg-canvas-soft border border-hairline rounded-2xl p-1">
            <button type="button" id="alb-note-tab-add" class="alb-note-tab rounded-xl px-3 py-2 text-[12px] font-black transition-colors" data-note-tab="add"><i class="fa-solid fa-plus mr-1"></i>Tambah</button>
            <button type="button" id="alb-note-tab-list" class="alb-note-tab rounded-xl px-3 py-2 text-[12px] font-black transition-colors" data-note-tab="list"><i class="fa-solid fa-list mr-1"></i>Lihat</button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-[320px_1fr] flex-1 min-h-0 overflow-hidden">
          <section id="alb-note-panel-add" class="alb-note-panel border-b md:border-b-0 md:border-r border-hairline bg-canvas-soft p-4 overflow-y-auto">
            <form id="alb-note-form" class="space-y-3">
              <input type="hidden" id="alb-note-id" value="">
              <div>
                <label class="block text-[12px] font-bold text-muted mb-1">Judul Catatan</label>
                <input id="alb-note-title" class="w-full bg-white border border-hairline rounded-xl px-3 py-2 text-[13px] outline-none focus:border-primary" placeholder="Contoh: Password VClass" required>
              </div>
              <div>
                <label class="block text-[12px] font-bold text-muted mb-1">Isi Catatan</label>
                <textarea id="alb-note-content" class="w-full bg-white border border-hairline rounded-xl px-3 py-2 text-[13px] min-h-[160px] md:min-h-[120px] resize-y outline-none focus:border-primary" placeholder="Tulis catatan singkat yang ingin kamu ingat..." required></textarea>
              </div>
              <div class="flex gap-2">
                <button type="submit" class="flex-1 bg-primary text-white rounded-xl px-3 py-2 text-[13px] font-bold">Simpan</button>
                <button type="button" id="alb-note-reset" class="border border-hairline bg-white rounded-xl px-3 py-2 text-[13px] font-bold text-muted">Reset</button>
              </div>
            </form>
          </section>

          <section id="alb-note-panel-list" class="alb-note-panel p-4 overflow-y-auto">
            <div class="flex flex-col md:flex-row gap-2 md:items-center md:justify-between mb-3">
              <input id="alb-note-search" class="w-full md:max-w-[320px] bg-white border border-hairline rounded-xl px-3 py-2 text-[13px] outline-none focus:border-primary" placeholder="Cari catatan...">
              <div id="alb-note-page-info" class="text-[12px] text-muted-soft"></div>
            </div>
            <div class="overflow-x-auto border border-hairline rounded-xl bg-white">
              <table class="w-full text-[13px]">
                <thead class="bg-canvas-soft text-muted"><tr><th class="text-left p-3">Judul</th><th class="text-left p-3">Isi</th><th class="text-left p-3 w-[140px]">Aksi</th></tr></thead>
                <tbody id="alb-note-table-body"><tr><td colspan="3" class="p-4 text-center text-muted-soft">Memuat...</td></tr></tbody>
              </table>
            </div>
            <div class="mt-3 flex items-center justify-end gap-2"><button id="alb-note-prev" type="button" class="border border-hairline bg-white rounded-lg px-3 py-1.5 text-[12px] font-bold text-muted">Prev</button><button id="alb-note-next" type="button" class="border border-hairline bg-white rounded-lg px-3 py-1.5 text-[12px] font-bold text-muted">Next</button></div>
          </section>
        </div>
      </div>
    </div>
  `);
  $('#alb-notes-close').on('click', () => $('#alb-student-notes-modal').addClass('hidden'));
}

function setStudentNotesTab(tab = 'list') {
  const active = tab === 'add' ? 'add' : 'list';

  $('.alb-note-tab')
    .removeClass('bg-white text-ink shadow-sm')
    .addClass('text-muted');
  $(`.alb-note-tab[data-note-tab="${active}"]`)
    .addClass('bg-white text-ink shadow-sm')
    .removeClass('text-muted');

  // Mobile: form dan tabel dipisah tab. Desktop tetap split 2 kolom.
  $('#alb-note-panel-add, #alb-note-panel-list').removeClass('hidden');
  if (window.matchMedia('(max-width: 767px)').matches) {
    if (active === 'add') {
      $('#alb-note-panel-add').removeClass('hidden');
      $('#alb-note-panel-list').addClass('hidden');
    } else {
      $('#alb-note-panel-add').addClass('hidden');
      $('#alb-note-panel-list').removeClass('hidden');
    }
  }
}

function getLocalNoteKey(context) {
  const identity = getNotesIdentity(context);
  return `alb:${window.location.host}:${identity.projectKey || identity.projectId || 'project'}:notes:${identity.student_email || identity.sessionId || 'anon'}`;
}

function readLocalNotes(context) {
  try { return JSON.parse(localStorage.getItem(getLocalNoteKey(context)) || '[]'); } catch (_) { return []; }
}

function writeLocalNotes(context, notes) {
  localStorage.setItem(getLocalNoteKey(context), JSON.stringify(notes || []));
}

function openStudentNotesModal(context, mode = 'list') {
  ensureStudentNotesModal();
  $('#alb-student-notes-modal').removeClass('hidden');
  $('.alb-note-tab').off('click').on('click', function () { setStudentNotesTab($(this).data('note-tab')); });
  $(window).off('resize.albNotesTabs').on('resize.albNotesTabs', () => setStudentNotesTab($('#alb-note-tab-add').hasClass('bg-white') ? 'add' : 'list'));
  setStudentNotesTab(mode === 'add' ? 'add' : 'list');

  let state = { page: 1, limit: 5, q: '' };
  const identity = getNotesIdentity(context);

  const resetForm = () => {
    $('#alb-note-id').val('');
    $('#alb-note-title').val('');
    $('#alb-note-content').val('');
  };

  const renderRows = (items = [], total = 0) => {
    const rows = items.map((note) => `
      <tr class="border-t border-hairline">
        <td class="p-3 align-top font-semibold text-ink">${escapeHtml(note.title)}</td>
        <td class="p-3 align-top text-body max-w-[360px]"><div class="line-clamp-3">${escapeHtml(note.content)}</div></td>
        <td class="p-3 align-top"><div class="flex gap-1.5"><button class="alb-note-edit bg-sky-50 text-sky-700 border border-sky-100 rounded-lg px-2 py-1 text-[11px] font-bold" data-id="${escapeHtml(note.id)}">Edit</button><button class="alb-note-delete bg-red-50 text-red-700 border border-red-100 rounded-lg px-2 py-1 text-[11px] font-bold" data-id="${escapeHtml(note.id)}">Hapus</button></div></td>
      </tr>`).join('');
    $('#alb-note-table-body').html(rows || '<tr><td colspan="3" class="p-4 text-center text-muted-soft">Belum ada catatan.</td></tr>');
    const maxPage = Math.max(1, Math.ceil(Number(total || items.length || 0) / state.limit));
    $('#alb-note-page-info').text(`Halaman ${state.page}/${maxPage} · ${total || items.length} catatan`);
    $('#alb-note-prev').prop('disabled', state.page <= 1).toggleClass('opacity-50', state.page <= 1);
    $('#alb-note-next').prop('disabled', state.page >= maxPage).toggleClass('opacity-50', state.page >= maxPage);
  };

  const loadNotes = async () => {
    const query = new URLSearchParams({ ...identity, page: state.page, limit: state.limit, q: state.q }).toString();
    const res = await ApiService.get(`/student-notes?${query}`).catch(() => null);
    if (res?.status === 'success') {
      renderRows(res.data?.items || [], res.data?.total || 0);
      return;
    }
    const all = readLocalNotes(context).filter((note) => !state.q || `${note.title} ${note.content}`.toLowerCase().includes(state.q.toLowerCase()));
    const start = (state.page - 1) * state.limit;
    renderRows(all.slice(start, start + state.limit), all.length);
  };

  $('#alb-note-form').off('submit').on('submit', async (e) => {
    e.preventDefault();
    const id = $('#alb-note-id').val();
    const payload = { ...identity, title: $('#alb-note-title').val().trim(), content: $('#alb-note-content').val().trim() };
    if (!payload.title || !payload.content) return Toast.show('Judul dan isi catatan wajib diisi.', 'warning');

    const res = id
      ? await ApiService.put(`/student-notes/${id}`, payload).catch(() => null)
      : await ApiService.post('/student-notes', payload).catch(() => null);

    if (!res || res.status !== 'success') {
      const notes = readLocalNotes(context);
      if (id) {
        const idx = notes.findIndex((n) => String(n.id) === String(id));
        if (idx >= 0) notes[idx] = { ...notes[idx], ...payload, updated_at: new Date().toISOString() };
      } else {
        notes.unshift({ id: `local-${Date.now()}`, ...payload, created_at: new Date().toISOString() });
      }
      writeLocalNotes(context, notes);
    }

    resetForm();
    Toast.show('Catatan berhasil disimpan.', 'success');
    loadNotes();
    if (window.matchMedia('(max-width: 767px)').matches) setStudentNotesTab('list');
  });

  $('#alb-note-reset').off('click').on('click', resetForm);
  $('#alb-note-search').off('input').on('input', function () { state.q = $(this).val().trim(); state.page = 1; clearTimeout(window.__albNoteSearchTimer); window.__albNoteSearchTimer = setTimeout(loadNotes, 300); });
  $('#alb-note-prev').off('click').on('click', () => { if (state.page > 1) { state.page -= 1; loadNotes(); } });
  $('#alb-note-next').off('click').on('click', () => { state.page += 1; loadNotes(); });
  $('#alb-note-table-body').off('click', '.alb-note-edit').on('click', '.alb-note-edit', async function () {
    const id = $(this).data('id');
    const local = readLocalNotes(context).find((n) => String(n.id) === String(id));
    const note = local || {};
    $('#alb-note-id').val(id);
    $('#alb-note-title').val(note.title || $(this).closest('tr').find('td').eq(0).text().trim());
    $('#alb-note-content').val(note.content || $(this).closest('tr').find('td').eq(1).text().trim());
    setStudentNotesTab('add');
    setTimeout(() => $('#alb-note-title').focus(), 80);
  });
  $('#alb-note-table-body').off('click', '.alb-note-delete').on('click', '.alb-note-delete', async function () {
    const id = $(this).data('id');
    if (!confirm('Hapus catatan ini?')) return;
    const res = await ApiService.delete(`/student-notes/${id}`).catch(() => null);
    if (!res || res.status !== 'success') writeLocalNotes(context, readLocalNotes(context).filter((n) => String(n.id) !== String(id)));
    loadNotes();
  });

  if (mode === 'add') $('#alb-note-title').focus();
  loadNotes();
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

      // [v0.7.0] Saran mention "@" — jika sedang mengetik token "@...", tampilkan dropdown
      // mention dan jangan tampilkan suggestion chips biasa.
      if (context.handleMentionInput?.()) return;

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
  context.appendBubble(
    `Sepertinya pertanyaanmu lebih mengarah ke konteks **${label}**. Aku pindahkan dulu fokusnya ke sana ya 🔄`,
    false, 'system'
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

    // [v0.6.0] Deteksi pergeseran konteks halaman (hanya untuk pertanyaan bebas,
    // bukan saat ada elemen yang sedang dipilih).
    if (!currentElementContext) {
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
  $('#alb-input-locked-notice').addClass('hidden');
  context.hideInputLockedNoticeExternal?.();
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


function buildMoodleMaterialReaderHtml(item = {}) {
  const title = escapeHtml(item.title || 'Materi Moodle');
  const topic = escapeHtml(item.topic || item.class_code || 'Materi');
  const badge = escapeHtml((item.modname || item.file_type || 'html').toString().toUpperCase());
  const sourceUrl = escapeHtml(item.url || item.source_url || item.file_url || '');
  const snippets = (Array.isArray(item.snippets) && item.snippets.length ? item.snippets : [item.content || item.preview || 'Materi ini sudah tersinkron ke AI Buddy.'])
    .map((v) => String(v || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 8);
  const sections = snippets.map((text, idx) => `
    <section class="bg-white border border-hairline rounded-2xl p-4 md:p-5 shadow-sm">
      <div class="text-[11px] font-black text-muted-soft uppercase tracking-wider mb-2">Bagian ${idx + 1}</div>
      <p class="text-[14px] md:text-[15px] leading-7 text-ink whitespace-pre-wrap">${escapeHtml(text)}</p>
    </section>`).join('');
  return `
    <div class="max-w-[920px] mx-auto p-4 md:p-7 space-y-4 md:space-y-5">
      <section class="bg-white border border-hairline rounded-3xl p-5 md:p-7 shadow-sm">
        <div class="inline-flex items-center gap-2 bg-primary/10 text-primary border border-primary/15 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider">${badge} · Materi tersinkron</div>
        <h1 class="mt-4 text-[26px] md:text-[38px] leading-tight font-black text-ink tracking-tight">${title}</h1>
        <div class="mt-1 text-[13px] md:text-[15px] text-muted-soft">${topic}</div>
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

function openMoodleMaterialModal(payload = {}) {
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
