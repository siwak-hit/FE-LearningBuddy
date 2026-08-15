import $ from 'jquery';
import Toast from '../../components/toast.js';
import { Modal } from '../../components/modal.js';
import { ApiService } from '../../fetch/api.js';
import { resolvePageKeyFromText, PAGE_ELEMENTS } from './pageElements.js';
import { openStaticTutorialModal, openVideoTutorialModal } from './static-tutorial.js';
import { openGradeComplaintModal } from './grade-complaint.js';
import { openVclassPreviewModal, openMoodleMaterialModal, openHtmlViewModal } from './material-modals.js';
import {
  showCooldownToast,
  isCooldownBlocking,
  applyPersistedCooldownIfNeeded,
  applyPersistedLockdownIfNeeded,
  readPersistedLockdown,
  triggerProfanityLockdown
} from './safety-overlays.js';
import { ensureStudentNotesMenu } from './student-notes.js';
import {
  readActiveStudentIdentity,
  persistReusableStudentSession,
  hydrateReusableSessionIfAvailable,
  ensureDeleteSessionButton,
  bindExternalSessionGate
} from './student-session.js';
import { initWorkspaceConfig } from './workspace-config.js';

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
  // [config] UI hanya punya 2 mode: Jawaban Sistem & Jawaban AI. `ai_detail` tetap ada
  // sebagai alias internal karena beberapa payload BE/tombol lama mengirim mode 'detail'.
  ai_short: {
    label: 'Jawaban AI',
    responseMode: 'short',
    forceFAQ: false,
    forceAI: true,
    activeClass: 'border-amber-200 bg-amber-50/70'
  },
  ai_detail: {
    label: 'Jawaban AI',
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

// [v0.9.83] Pertanyaan yang jawabannya diambil dari DATA Moodle siswa (tugas, deadline,
// kuis, forum, nilai, pengajar) tidak bisa dijawab tanpa tahu siswa ini siapa. Sama seperti
// gate fitur "@materi": tampilkan info + tombol email, jangan kirim ke server.
const LMS_DATA_INTENTS = new Set([
  'cek_tugas_belum_selesai', 'cek_deadline_hari_ini', 'cek_quiz_belum_dikerjakan',
  'cek_forum_belum_dijawab', 'cek_pengajar_course', 'cek_nilai', 'lihat_nilai',
  'detail_tugas', 'detail_kuis'
]);
const LMS_DATA_RE = /\b(tugas|pr|deadline|tenggat|batas waktu|dikumpul\w*|pengumpulan|nilai|rapor|kuis|quiz|ulangan|forum|diskusi|absen|presensi|jadwal|aktivitas|pengajar|wali kelas)\b/i;
// Pertanyaan "cara ...", "apa itu ..." dijawab dari panduan/materi umum — tidak butuh identitas
// walau menyebut kata "tugas"/"kuis". Tanpa pengecualian ini, "cara mengumpulkan tugas" ikut kena gate.
const LMS_GENERIC_RE = /\b(cara|gimana|bagaimana|panduan|tutorial|langkah|apa itu|pengertian|definisi|maksud)\b/i;

function needsMoodleIdentity(context, messageText = '', options = {}) {
  if (options.skipIdentityGate) return false;
  if (context.hasVerifiedStudentIdentity?.()) return false;
  // Tombol sidebar mengirim intent eksplisit → paling akurat. Semua intent `cek_*`
  // memang membaca data Moodle siswa (lihat `isLmsCheck` di bindFastGuideButtons).
  const intent = String(options.intent || '');
  if (intent.startsWith('cek_') || LMS_DATA_INTENTS.has(intent)) return true;
  if (options.mention) return false;                                   // @materi punya gate sendiri
  if (LMS_GENERIC_RE.test(messageText)) return false;
  return LMS_DATA_RE.test(messageText);
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
    const modeName = 'Jawaban AI';
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

// [v0.9.58] Kartu KONFIRMASI alih-ke-AI (bukan bubble chat) — tampil di tengah, menunggu klik.
function appendAiConfirmCard(context, botMessage) {
  const raw = String(botMessage.message || 'Mau dialihkan ke Jawaban AI?');
  const html = raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  const payload = (botMessage.actions || []).find((a) => a.type === 'confirm_ai')?.payload || {};
  const id = 'alb-ai-confirm-' + Date.now();
  context.$chatArea.append(`
    <div id="${id}" class="alb-ai-confirm my-4 mx-auto w-full max-w-[92%] md:max-w-[80%]">
      <div class="bg-surface-card border border-primary/30 rounded-2xl shadow-lg p-4 md:p-5">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
          <div class="flex-1 min-w-0 text-[14px] text-ink leading-relaxed">${html}</div>
        </div>
        <div class="flex flex-col sm:flex-row gap-2 mt-4">
          <button type="button" class="alb-confirm-ai-yes flex-1 bg-ink text-white rounded-lg py-2.5 text-[13px] font-semibold hover:opacity-90 transition-opacity"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i> Ya, alihkan ke AI</button>
          <button type="button" class="alb-confirm-ai-no flex-1 bg-white text-ink border border-hairline-strong rounded-lg py-2.5 text-[13px] font-semibold hover:bg-surface-strong transition-colors">Tidak</button>
        </div>
      </div>
    </div>`);
  context.scrollToBottom?.();
  const $card = $('#' + id);
  $card.find('.alb-confirm-ai-yes').on('click', () => {
    $card.remove();
    sendChatMessage(context, {
      message: payload.message || '',
      forceAI: true,
      responseMode: payload.responseMode || 'short',
      intent: payload.intent || null,
      suppressUserBubble: true,
      loadingText: 'Mengalihkan ke jawaban AI…'
    });
  });
  $card.find('.alb-confirm-ai-no').on('click', () => {
    $card.remove();
    context.appendBubble(
      'Baik. Kalau informasinya memang belum tersedia di sistem, kamu bisa menanyakannya langsung ke guru ya. 🙏',
      false, 'system',
      [{ type: 'wa_teacher', label: 'Hubungi Guru (WhatsApp)' }],
      { noFeedbackLock: true }
    );
    context.scrollToBottom?.();
  });
}

async function sendChatMessage(context, options = {}) {
  const modeConfig = getModeConfig(context.currentResponseMode);
  const messageText = String(options.message ?? context.$inputArea?.val() ?? '').trim();

  // [v0.4.3] Ambil & reset gambar elemen lebih awal supaya kalau kirim dibatalkan,
  // gambar tidak ikut terbawa ke pesan berikutnya.
  const pendingUserImage = options.userImage || context._pendingUserImage || null;
  context._pendingUserImage = null;

  if (!messageText || context.isRequesting) return;

  // [v0.9.83] Butuh data kelas/tugas tapi email Moodle belum diverifikasi → jangan kirim
  // ke server (jawabannya pasti kosong/keliru). Tampilkan bubble info + tombol email;
  // pertanyaannya disimpan dan dikirim ulang otomatis setelah verifikasi berhasil.
  if (needsMoodleIdentity(context, messageText, options)) {
    if (!options.suppressUserBubble) {
      context.appendBubble(messageText, true, 'user', [], { image: pendingUserImage });
    }
    context.$inputArea?.val('');
    context.resetInputHeight?.();
    context.hideSuggestionWrapper?.();
    context._pendingIdentityRequest = { message: messageText, options };
    context.appendBubble(
      'Pertanyaan ini butuh **data kelasmu di VClass** — tugas, deadline, kuis, forum, atau nilai. Aku belum tahu kamu siswa yang mana, jadi datanya belum bisa kuambil.\n\nMasukkan **email Moodle** kamu dulu ya. Cukup sekali, setelah itu pertanyaan ini langsung kujawab.',
      false, 'system',
      [{ type: 'verify_email', label: 'Masukkan Email Moodle' }],
      { noFeedbackLock: true }
    );
    context.scrollToBottom?.();
    return;
  }

  context.isRequesting = true;

  // [v0.9.82] Konfirmasi "sudah paham" tanpa tombol: kalau respons sebelumnya tadinya
  // punya tombol konfirmasi dan siswa langsung bertanya lagi, itu artinya sudah paham.
  // Sinyal resolusi (dipakai deteksi kesulitan di BE) dikirim dari sini.
  if (context._awaitingImplicitResolve) {
    context._awaitingImplicitResolve = false;
    ApiService.post('/chat/feedback', { sessionId: context.sessionId, type: 'resolved' }).catch(() => {});
  }

  // suppressUserBubble: bubble pertanyaan sudah ditampilkan pemanggil (mis. auto-pindah konteks).
  // [v0.9.63] Label intent HANYA untuk pesan yang diketik siswa (bukan @mention / tombol pilih).
  let intentLabelId = null;
  let $userBubble = null;
  if (!options.suppressUserBubble) {
    if (!options.mention && !options.intent) intentLabelId = 'alb-intent-' + Date.now();
    context.appendBubble(messageText, true, 'user', [], { image: pendingUserImage, intentLabelId });
    // Simpan referensinya — dipakai kalau BE mengembalikan versi tersensor.
    $userBubble = context.$chatArea?.children().last();
  }
  context.$inputArea?.val('');
  context.resetInputHeight?.();
  context.hideSuggestionWrapper?.();
  // [v0.9.28 #3] Tahap loading "mengalihkan ke AI" hanya bila request memang mode AI,
  // supaya tak muncul saat jawaban ternyata dari sistem.
  const _aiMode = (options.forceAI === true) || (options.forceAI !== false && modeConfig.forceAI === true);
  context.appendTypingIndicator?.({
    aiMode: _aiMode,
    initialText: options.loadingText,
    message: messageText,
    mention: options.mention || null
  });
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
      // [v0.9.63] Isi label intent pada bubble pertanyaan siswa (estimasi keyword dari BE).
      if (intentLabelId) context.fillIntentLabel?.(intentLabelId, res.data.intent_scores || []);

      // [v0.9.84] Bahasa tidak pantas terdeteksi → ganti isi bubble pertanyaan dengan versi
      // tersensor dari BE ("BEGO banget" → "**** banget"), termasuk data tombol Salin/Kirim ulang.
      if (res.data.censored_message && $userBubble?.length) {
        const censored = String(res.data.censored_message);
        $userBubble.find('.alb-user-msg-text').html(
          context.formatResponseText ? context.formatResponseText(censored) : escapeHtml(censored)
        );
        $userBubble.find('.btn-user-copy, .btn-user-reload').attr('data-msg', encodeURIComponent(censored));
      }

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

      // [v0.9.58] Sistem tak punya jawaban → kartu KONFIRMASI (bukan bubble chat) di tengah:
      // siswa memilih dialihkan ke AI atau tidak. Jangan render bubble bot normal.
      if (res.data.needs_ai_confirm) {
        context.isRequesting = false;
        appendAiConfirmCard(context, res.data.botMessage || {});
        return;
      }

      // [v0.9.52] Mode darurat: koneksi Moodle bermasalah (token kadaluarsa / endpoint mati).
      // Beri tahu siswa bahwa jawaban berasal dari PANDUAN penggunaan Moodle, bukan materi/
      // forum terbaru. Tampilkan sekali per "episode" darurat supaya tidak spam tiap pesan.
      if (res.data.degraded) {
        if (!context._degradedNoticeShown) {
          context._degradedNoticeShown = true;
          context.appendBubble(
            res.data.degraded_note || 'Koneksi ke Moodle sedang bermasalah. Jawaban ini dari panduan penggunaan Moodle, bukan materi atau forum terbaru.',
            false, 'system', [], { noFeedbackLock: true, notice: 'context' }
          );
        }
      } else {
        context._degradedNoticeShown = false;
      }

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

      // [v0.9.85] Lockdown bahasa: hanya bila guru mengaktifkan switch (default OFF) DAN
      // warnings sudah ≥3. Server tak lagi mengunci sendiri — timer & escalation di FE.
      const warnings = Number(res.data.warnings || 0);
      const lockdownOn = context.featureFlags?.profanity_lockdown === true;
      if (res.data.moderation_type && lockdownOn && warnings >= 3) {
        triggerProfanityLockdown(context, warnings);
      }
    } else {
      // [v0.9.63] Respons gagal → buang skeleton label supaya tak berkedip selamanya.
      if (intentLabelId) context.fillIntentLabel?.(intentLabelId, []);
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
    if (intentLabelId) context.fillIntentLabel?.(intentLabelId, []);
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
    // .hide() (inline display:none) — `hidden` class kalah dari `inline-flex` di urutan CSS Tailwind.
    $('#alb-global-ai-usage-toggle').hide();
    // [v0.9.66] Panel kuota membesar → geser tombol "ke pesan terbaru" naik supaya tak tertutup.
    $('#btn-scroll-bottom').addClass('!bottom-52 md:!bottom-56');
    // Panel baru dibuka → segarkan angka & pindah ke ritme aktif (8 dtk).
    poll();
    scheduleNext();
  });
  $(document).off('click.albUsageClose').on('click.albUsageClose', '#alb-global-ai-usage-close', function () {
    $('#alb-global-ai-usage').addClass('hidden');
    $('#alb-global-ai-usage-toggle').show();
    $('#btn-scroll-bottom').removeClass('!bottom-52 md:!bottom-56');
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

    const mins = data.resets_in_seconds ? Math.max(1, Math.ceil(Number(data.resets_in_seconds) / 60)) : 0;
    const resetTxt = mins ? ` Coba lagi sekitar <b>${mins} menit</b> lagi.` : '';

    if (data.exhausted) {
      $note.removeClass('hidden bg-amber-50 text-amber-800 border-amber-200')
        .addClass('bg-red-50 text-red-700 border border-red-200')
        .html(`<i class="fa-solid fa-circle-exclamation mr-1"></i> Kuota AI bersama <b>penuh</b> — jawaban AI dinonaktifkan sementara.${resetTxt} Gunakan <b>Jawaban Sistem</b> dulu ya.`);
    } else if (data.busy) {
      $note.removeClass('hidden bg-red-50 text-red-700 border-red-200')
        .addClass('bg-amber-50 text-amber-800 border border-amber-200')
        .html('<i class="fa-solid fa-hourglass-half mr-1"></i> Kuota AI bersama hampir penuh — sebentar lagi jawaban AI dinonaktifkan. Pakai <b>Jawaban Sistem</b> kalau bisa.');
    } else {
      $note.addClass('hidden').empty();
    }

    // [v0.9.58] Saat kuota AI penuh → nonaktifkan pilihan mode AI (siswa harus tunggu reset).
    $('.opt-response-mode[data-mode="ai_short"], .opt-response-mode[data-mode="ai_detail"]')
      .prop('disabled', !!data.exhausted)
      .toggleClass('opacity-40 cursor-not-allowed pointer-events-none', !!data.exhausted);
  };

  // [v0.9.52] Polling diringankan (ganti setInterval 8dtk tetap):
  //  - panel dibuka  → 8 dtk (butuh angka live)
  //  - panel tertutup → 45 dtk (cukup untuk memutakhirkan ~% di tombol)
  //  - tab tidak aktif → berhenti total (hemat jaringan & kuota Gemini)
  const ACTIVE_MS = 8000;
  const IDLE_MS = 45000;

  const isPanelOpen = () => {
    const el = document.getElementById('alb-global-ai-usage');
    return !!el && !el.classList.contains('hidden');
  };

  const poll = () => {
    if (document.hidden) return; // jangan poll saat tab disembunyikan
    ApiService.get('/chat/ai-usage-global')
      .then((res) => { if (res?.status === 'success' && res.data) render(res.data); })
      .catch(() => {});
  };

  const scheduleNext = () => {
    if (window.__albGlobalUsageTimer) clearTimeout(window.__albGlobalUsageTimer);
    const delay = isPanelOpen() ? ACTIVE_MS : IDLE_MS;
    window.__albGlobalUsageTimer = setTimeout(() => { poll(); scheduleNext(); }, delay);
  };

  poll();
  scheduleNext();

  // Saat tab kembali terlihat → segarkan langsung lalu jadwalkan ulang.
  if (!window.__albUsageVisBound) {
    window.__albUsageVisBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { poll(); scheduleNext(); }
    });
  }
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


// [v0.9.59] Tombol "ke pesan terbaru": muncul saat area chat di-scroll ke atas.
function bindScrollToBottomButton(context) {
  const $area = context.$chatArea?.length ? context.$chatArea : $('#chat-area');
  const $btn = $('#btn-scroll-bottom');
  if (!$area.length || !$btn.length) return;
  const nearBottom = () => {
    const el = $area[0];
    return !el || (el.scrollHeight - el.scrollTop - el.clientHeight) < 120;
  };
  const update = () => $btn.toggleClass('hidden', nearBottom());
  $area.off('scroll.albScrollBtm').on('scroll.albScrollBtm', update);
  $btn.off('click.albScrollBtm').on('click.albScrollBtm', () => { context.scrollToBottom?.(); $btn.addClass('hidden'); });
  update();
}

// [v0.9.92] Header auto-hide saat scroll DIHAPUS. Menyembunyikan header mengubah tinggi
// #chat-area, yang menggeser scrollTop, yang memicu event scroll berikutnya — di Android
// jadi berkedip muncul-hilang terus, dan di iOS (momentum scroll) header nyaris tak bisa
// dipanggil kembali. Header sekarang tetap terlihat seperti di desktop.

export function bindWorkspaceEvents() {
  let suggestionTimer = null;

  initWorkspaceConfig(this); // body-class tampilan dipasang paling awal (hindari kedip)
  hydrateReusableSessionIfAvailable(this);
  decorateAiUsageAutoReset(this);
  registerAlbPwa(this);
  initGlobalAiUsageBar(this);
  applyPersistedCooldownIfNeeded(this);
  applyPersistedLockdownIfNeeded(this);
  selfHealDisabledInput(this);

  bindSidebarTabs(this);
  bindContextDrawer(this);
  bindScrollToBottomButton(this);
  bindInputEvents(this, () => suggestionTimer, (timer) => { suggestionTimer = timer; });
  bindFormSubmit(this);
  bindFastGuideButtons(this);
  this.bindMentionEvents?.();        // [v0.7.0] klik item mention "@"
  this.loadMateriMentions?.();       // [v0.7.0] muat daftar materi untuk @materi-N
  bindBasicButtons(this);
  bindChatActionButtons(this);
  bindModeSelector(this);
  bindExternalSessionGate(this);
  ensureDeleteSessionButton(this);
  applyFeatureFlags(this);
}

// [v0.9.70] Toggle fitur dari dashboard guru (widget_configs.theme.features).
// Nilai `false` = fitur disembunyikan; key hilang / fetch gagal = tetap tampil (fail-open)
// supaya sidebar tak pernah kosong hanya karena jaringan bermasalah.
async function applyFeatureFlags(context) {
  let flags = {};

  if (context.projectKey) {
    try {
      const res = await ApiService.get(`/widget/config/${context.projectKey}`);
      let theme = res?.data?.theme;
      if (typeof theme === 'string') theme = JSON.parse(theme);
      flags = theme?.features || {};
    } catch (e) {
      console.warn('[Buddy] gagal memuat feature flags, semua fitur ditampilkan:', e);
    }
  }

  context.featureFlags = flags;
  const isOn = (key) => flags[key] !== false;

  if (isOn('notes')) ensureStudentNotesMenu(context);
  if (isOn('complaint')) context.ensureComplaintMenu?.(context);

  // Section statik di BuddyAiWorkspace.astro cukup dibuang dari DOM.
  ['guide', 'class_data', 'contact_teacher'].forEach((key) => {
    if (!isOn(key)) $(`#tab-content-guide [data-alb-feature="${key}"]`).remove();
  });
}

function bindSidebarTabs(context) {
  bindIfExists(context.$tabBtnGuide, 'click', () => {
    context.$tabBtnGuide.addClass('bg-ink text-white shadow-sm').removeClass('text-muted');
    context.$tabBtnElements.addClass('text-muted').removeClass('bg-ink text-white shadow-sm');

    context.$tabContentGuide.removeClass('hidden');
    context.$tabContentElements.addClass('hidden');
  });

  bindIfExists(context.$tabBtnElements, 'click', () => {
    context.$tabBtnElements.addClass('bg-ink text-white shadow-sm').removeClass('text-muted');
    context.$tabBtnGuide.addClass('text-muted').removeClass('bg-ink text-white shadow-sm');

    context.$tabContentElements.removeClass('hidden');
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

  // Menu titik-3 konteks (berisi Ganti + Info): toggle dropdown, tutup saat klik luar / pilih item.
  $('#ctx-menu-toggle').off('click.albCtxMenu').on('click.albCtxMenu', (e) => {
    e.stopPropagation();
    $('#ctx-menu').toggleClass('hidden');
  });
  $('#ctx-menu').off('click.albCtxMenuItem').on('click.albCtxMenuItem', 'button, a', () => $('#ctx-menu').addClass('hidden'));
  $(document).off('click.albCtxMenuOut').on('click.albCtxMenuOut', (e) => {
    if (!$(e.target).closest('#ctx-menu, #ctx-menu-toggle').length) $('#ctx-menu').addClass('hidden');
  });

  // [E] Preview konteks ringkas: chevron memperbesar (judul & deskripsi penuh) / meringkas
  // (judul 1 baris terpotong + deskripsi 1 baris). `.text()` tetap judul penuh (info modal aman).
  $('#ctx-preview-toggle').off('click.albCtxAcc').on('click.albCtxAcc', () => {
    const $title = $('#context-title');
    const collapsed = $title.hasClass('truncate');
    $title.toggleClass('truncate', !collapsed);
    $('#context-desc').toggleClass('line-clamp-1', !collapsed);
    $('#ctx-preview-chevron').toggleClass('rotate-180', collapsed);
  });
}

function bindInputEvents(context, getSuggestionTimer, setSuggestionTimer) {
  // [v0.9.28 #6] Input dikunci (menunggu konfirmasi) lalu dicoba diklik → toast bisa diklik.
  // Disabled input tak memancarkan event, jadi pasang di WADAH-nya (mousedown).
  const $inputWrap = $('#chat-input-wrap, #chat-form').first();
  if ($inputWrap.length) {
    $inputWrap.off('mousedown.albLocked touchstart.albLocked')
      .on('mousedown.albLocked touchstart.albLocked', (e) => {
        // [v0.9.82] Toast ini khusus kondisi "menunggu konfirmasi" yang sudah dihapus.
        // Input yang disabled sekarang hanya karena lockdown/cooldown (punya overlay sendiri),
        // jadi toast hanya muncul kalau memang masih ada respons yang menunggu konfirmasi.
        const stillWaiting = context.$chatArea?.find('.alb-system-message-wrap[data-waiting-feedback="1"]').length > 0;
        if (stillWaiting && context.$inputArea?.prop('disabled')) {
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


// [v0.9.86] Modal berisi tabel konteks LENGKAP (semua baris) — dibuka dari tombol "Lihat detail".
function openContextTableModal(context, rows = []) {
  $('#alb-context-modal').remove();
  if (!Array.isArray(rows) || !rows.length) return;
  const esc = (s) => (context.escapeHtml ? context.escapeHtml(String(s ?? '')) : String(s ?? ''));
  const badgeOf = (type) => ({
    Materi: 'bg-primary/10 text-primary border-primary/20',
    FAQ: 'bg-amber-50 text-amber-700 border-amber-200',
    Aktivitas: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }[type] || 'bg-slate-100 text-slate-600 border-slate-200');

  const body = rows.map((r) => `
    <tr class="border-t border-hairline align-top">
      <td class="py-2.5 px-3 text-[12px] text-muted-soft text-center w-8">${esc(r.no)}</td>
      <td class="py-2.5 px-3 text-[13px] font-semibold text-ink">${esc(r.name)}</td>
      <td class="py-2.5 px-3 w-[92px]"><span class="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${badgeOf(r.type)}">${esc(r.type)}</span></td>
      <td class="py-2.5 px-3 text-[12.5px] text-muted leading-snug">${esc(r.example)}</td>
    </tr>`).join('');

  $('body').append(`
    <div id="alb-context-modal" class="fixed inset-0 z-[9760] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6">
      <div class="bg-surface-card w-full max-w-[620px] rounded-2xl shadow-2xl border border-hairline flex flex-col max-h-[88vh] overflow-hidden">
        <div class="px-5 py-4 border-b border-hairline bg-white flex items-center justify-between gap-3 shrink-0">
          <div class="min-w-0">
            <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted flex items-center gap-2"><i class="fa-solid fa-table-list text-primary"></i> Daftar Konteks</div>
            <div class="text-[12px] text-muted-soft mt-0.5">${rows.length} topik yang bisa aku bantu jawab.</div>
          </div>
          <button type="button" class="alb-context-modal-close w-8 h-8 rounded-full text-muted hover:text-ink hover:bg-black/5 flex items-center justify-center shrink-0"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="overflow-y-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr class="text-left text-[10px] font-bold uppercase tracking-wide text-muted-soft">
                <th class="sticky top-0 z-10 bg-canvas-soft border-b border-hairline py-2.5 px-3 w-8 text-center">No</th>
                <th class="sticky top-0 z-10 bg-canvas-soft border-b border-hairline py-2.5 px-3">Topik Materi</th>
                <th class="sticky top-0 z-10 bg-canvas-soft border-b border-hairline py-2.5 px-3">Jenis</th>
                <th class="sticky top-0 z-10 bg-canvas-soft border-b border-hairline py-2.5 px-3">Contoh Pertanyaan</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <div class="px-5 py-3 border-t border-hairline bg-canvas-soft flex justify-end shrink-0">
          <button type="button" class="alb-context-modal-close bg-primary hover:bg-primary-active text-white rounded-full px-5 py-2 text-[13px] font-bold">Mengerti</button>
        </div>
      </div>
    </div>
  `);
  $('#alb-context-modal').on('click', (e) => { if (e.target.id === 'alb-context-modal') $('#alb-context-modal').remove(); });
  $('#alb-context-modal').on('click', '.alb-context-modal-close', () => $('#alb-context-modal').remove());
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

  // [v0.9.82] Handler tombol "Sudah jelas" (.btn-system-feedback-ok) & "Terbantu"
  // (.btn-feedback-resolved) dihapus bersama tombolnya — termasuk toast "Terima kasih…".
  // Sinyal resolusi kini dikirim otomatis dari sendChatMessage.

  // [v0.9.83] Tombol "Masukkan Email Moodle" pada bubble gate data kelas/tugas.
  context.$chatArea
    .off('click', '.btn-verify-email')
    .on('click', '.btn-verify-email', async (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      $btn.prop('disabled', true).addClass('opacity-60 cursor-wait');

      const ok = await context.showStudentIdentityModal?.(context.getCandidateStudentEmail?.() || '');
      $btn.prop('disabled', false).removeClass('opacity-60 cursor-wait');
      if (!ok) return;

      markSingleChatButtonClicked($btn);
      $btn.html('<i class="fa-solid fa-circle-check"></i> Email terverifikasi');
      context.loadMateriMentions?.();

      // Kirim ulang pertanyaan yang tadi tertahan (bubble pertanyaannya sudah tampil).
      const pending = context._pendingIdentityRequest;
      context._pendingIdentityRequest = null;
      if (pending) {
        sendChatMessage(context, {
          ...pending.options,
          message: pending.message,
          suppressUserBubble: true,
          skipIdentityGate: true
        });
      }
    });

  // [v0.9.86] Chip saran pertanyaan (in-context) pada respons "di luar konteks" → kirim langsung.
  context.$chatArea
    .off('click', '.btn-suggested-q')
    .on('click', '.btn-suggested-q', (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      const prompt = $btn.attr('data-prompt') || '';
      if (!prompt || context.isRequesting) return;
      markSingleChatButtonClicked($btn);
      sendChatMessage(context, { message: prompt });
    });

  // [v0.9.86] Tombol "Lihat konteks yang bisa ditanya" → tabel daftar konteks.
  context.$chatArea
    .off('click', '.btn-show-context')
    .on('click', '.btn-show-context', (e) => {
      e.preventDefault();
      if (context.isRequesting) return;
      markSingleChatButtonClicked($(e.currentTarget));
      sendChatMessage(context, { message: 'Konteks apa saja yang bisa aku tanyakan?', intent: 'daftar_konteks', responseMode: 'system', forceAI: false });
    });

  // [v0.9.86] Tombol "Lihat detail" pada tabel konteks → modal berisi tabel lengkap.
  context.$chatArea
    .off('click', '.btn-context-detail')
    .on('click', '.btn-context-detail', (e) => {
      e.preventDefault();
      let rows = [];
      try { rows = JSON.parse(decodeURIComponent($(e.currentTarget).attr('data-rows') || '[]')); } catch (_) { rows = []; }
      openContextTableModal(context, rows);
    });

  // [v0.9.88] Konfirmasi permintaan materi (soal/rangkum/poin penting/jelaskan) → gate email
  // (kalau belum dikenal) → jalankan task @materi (reuse alur mention: kirim prompt + mention).
  context.$chatArea
    .off('click', '.btn-confirm-material-request')
    .on('click', '.btn-confirm-material-request', async (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      if ($btn.prop('disabled')) return;
      let payload = {};
      try { payload = JSON.parse(decodeURIComponent($btn.attr('data-payload') || '{}')); } catch (_) { payload = {}; }
      const material = payload.material || {};
      const count = Number(payload.count || 0);
      const requestType = String(payload.requestType || 'explain');

      // Gate identitas: materi Moodle butuh siswa dikenal (email) — sama seperti fitur "@".
      if (!context.hasVerifiedStudentIdentity?.()) {
        $btn.prop('disabled', true).addClass('opacity-60 cursor-wait');
        const ok = await context.showStudentIdentityModal?.(context.getCandidateStudentEmail?.() || '');
        $btn.prop('disabled', false).removeClass('opacity-60 cursor-wait');
        if (!ok) return;
        context.loadMateriMentions?.();
      }

      markSingleChatButtonClicked($btn);
      const mention = {
        type: 'materi',
        token: material.token || 'materi',
        documentId: material.documentId || null,
        url: material.url || null,
        label: material.title || 'materi'
      };
      // Prompt task yang cocok dgn detectMentionTask di BE (soal/rangkum/poin/jelaskan).
      const TASK_PROMPT = {
        quiz: count ? `buatkan ${count} soal latihan` : 'buatkan soal latihan',
        summary: 'rangkum materi ini',
        keypoints: 'sebutkan poin penting materi ini',
        explain: 'jelaskan materi ini dengan bahasa sederhana'
      };
      const ask = TASK_PROMPT[requestType] || TASK_PROMPT.explain;
      sendChatMessage(context, { message: ask, mention });
    });

  context.$chatArea
    .off('click', '.btn-decline-quiz')
    .on('click', '.btn-decline-quiz', (e) => {
      e.preventDefault();
      markSingleChatButtonClicked($(e.currentTarget));
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

  // [v0.9.67] Tombol "Cek Nilai & Komplain" → modal pilih item → cek nilai → konfirmasi.
  context.$chatArea
    .off('click', '.btn-open-grade-complaint')
    .on('click', '.btn-open-grade-complaint', (e) => {
      e.preventDefault();
      markSingleChatButtonClicked($(e.currentTarget));
      openGradeComplaintModal(context);
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

  // [v0.9.42] Kuis: pilih jumlah soal → generate; kartu "Mulai Latihan" → buka modal.
  context.$chatArea
    .off('click', '.btn-quiz-setup')
    .on('click', '.btn-quiz-setup', (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      const token = $btn.attr('data-token') || '';
      const count = Number($btn.attr('data-count')) || 5;
      if (!token) return;
      markSingleChatButtonClicked($btn);
      const mention = context.resolveMentionForSend?.(`@${token}`) || null;
      context.sendDirectMessage?.({ message: `@${token} Buat ${count} soal latihan`, mention, freshMention: true, forceAI: true, responseMode: 'short' });
    });
  context.$chatArea
    .off('click', '.btn-start-quiz')
    .on('click', '.btn-start-quiz', (e) => {
      e.preventDefault();
      try {
        const quiz = JSON.parse(decodeURIComponent($(e.currentTarget).attr('data-quiz') || '%7B%7D'));
        context.openQuizModal?.(quiz);
      } catch (_) {}
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
