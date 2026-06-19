// ============================================================
// complaint-builder.js — Template "Komplain" terpandu (Panduan Cepat sidebar).
// [v0.9.17] Form PROGRESIF: isi satu langkah → langkah berikutnya muncul.
//   1) Jenis (chip) → 2) Nama/bagian (dropdown live Moodle) → 3) Alasan (dropdown).
// Alasan dipetakan ke ALGORITMA yang sudah ada (sengketa kuis / status tugas /
// status forum). Saat dikirim → langsung sendDirectMessage (TANPA lewat kolom chat
// & TANPA auto-pindah konteks) supaya ditangani handler yang tepat di BE.
// Alasan "Lainnya / yang tak ada algoritmanya" → diarahkan menghubungi GURU (WA),
// bukan dijawab sistem.
// ============================================================
import $ from 'jquery';
import { ApiService } from '../../fetch/api.js';

const COMPLAINT_TYPES = ['Tugas', 'Kuis', 'Materi', 'Forum'];
const WA_TEACHER_PHONE = '628989807094';

// [v0.9.17] Cache aktivitas live Moodle per sesi (untuk dropdown "Nama/bagian").
// Bentuk: { Kuis:[{title,url}], Tugas:[...], Materi:[...], Forum:[...] }
let activitiesCache = null;

// Alasan per jenis. kind:'system' → message dikirim ke algoritma BE; kind:'guru' → WA guru.
// `build(subj)` menyusun kalimat yang DIPASTIKAN memicu intent yang benar di intent.service.
const COMPLAINT_REASONS = {
  Kuis: [
    { id: 'salah_dinilai', label: 'Jawabanku sudah benar tapi dinilai salah', kind: 'system',
      build: (s) => `Aku mau komplain soal ${s}. Menurut materi, jawaban aku sudah benar, tapi kok dikoreksi salah ya? Tolong cek nomor mana yang keliru.` },
    { id: 'lainnya', label: 'Hal lain (hubungkan ke guru)', kind: 'guru' }
  ],
  Tugas: [
    { id: 'sudah_kumpul', label: 'Sudah aku kumpulkan tapi status masih belum', kind: 'system', intent: 'cek_status_tugas',
      build: (s) => `Aku mau komplain soal ${s}. Tugas ini sudah aku upload/kumpulkan, tapi kok statusnya masih belum masuk ya?` },
    { id: 'dinilai_salah', label: 'Jawaban tugasku dianggap salah / keluar topik', kind: 'system', intent: 'evaluasi_jawaban_tugas',
      build: (s) => `Aku mau komplain soal ${s}. Jawaban tugasku dianggap salah, sebenarnya salahnya di mana ya menurut materi?` },
    { id: 'lainnya', label: 'Hal lain (hubungkan ke guru)', kind: 'guru' }
  ],
  Forum: [
    { id: 'sudah_komen', label: 'Sudah aku komentari tapi belum dapat centang selesai', kind: 'system', intent: 'cek_status_completion',
      build: (s) => `Aku mau komplain soal ${s}. Aku sudah komen/balas di forum ini, tapi kok belum dapat centang selesai ya?` },
    { id: 'lainnya', label: 'Hal lain (hubungkan ke guru)', kind: 'guru' }
  ],
  Materi: [
    { id: 'tidak_bisa_dibuka', label: 'Materinya tidak bisa dibuka / diakses', kind: 'guru' },
    { id: 'membingungkan', label: 'Isi materinya membingungkan / sepertinya keliru', kind: 'guru' },
    { id: 'lainnya', label: 'Hal lain (hubungkan ke guru)', kind: 'guru' }
  ]
};

function escAttr(s = '') {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Susun frasa subjek tanpa label jenis ganda ("Kuis" + "Kuis Minggu 1" → "Kuis Minggu 1").
function buildSubject(type, name) {
  const t = String(type || '').trim();
  const n = String(name || '').trim();
  if (!n) return t.toLowerCase();
  // Kalau nama sudah diawali label jenisnya, jangan ditempel lagi.
  if (n.toLowerCase().startsWith(t.toLowerCase())) return n;
  return `${t} ${n}`;
}

export function ensureComplaintMenu(context) {
  const $guide = context.$tabContentGuide?.length ? context.$tabContentGuide : $('#tab-content-guide');
  if (!$guide.length || $guide.find('[data-alb-complaint-menu="1"]').length) return;

  $guide.append(`
    <div data-alb-complaint-menu="1" class="mt-5 pt-4 border-t border-hairline space-y-3">
      <div class="px-1">
        <div class="text-[10px] font-black uppercase tracking-[0.12em] text-muted flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Komplain</div>
        <div class="text-[11px] text-muted-soft mt-0.5 leading-snug">Susun komplain soal tugas/kuis/materi/forum langkah demi langkah.</div>
      </div>
      <button type="button" id="alb-complaint-open" class="w-full text-left bg-white hover:bg-canvas-soft border border-hairline rounded-xl px-3 py-3 flex items-center gap-3 transition-colors"><i class="fa-solid fa-flag text-amber-500"></i><span><b class="block text-[13px] text-ink">Buat Komplain</b><small class="text-[11px] text-muted-soft">Pilih langkah demi langkah, langsung diproses</small></span></button>
    </div>
  `);
  $('#alb-complaint-open').on('click', () => openComplaintComposer(context));
}

function ensureComplaintModal() {
  if ($('#alb-complaint-modal').length) return;
  $('body').append(`
    <div id="alb-complaint-modal" class="hidden fixed inset-0 z-[9700] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-surface-card w-full max-w-[480px] max-h-[90vh] rounded-2xl shadow-2xl border border-hairline flex flex-col overflow-hidden">
        <div class="px-5 py-4 border-b border-hairline bg-white flex items-start justify-between gap-3 shrink-0">
          <div>
            <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted flex items-center gap-2"><i class="fa-solid fa-flag text-[11px] text-amber-500"></i> Buat Komplain</div>
            <div class="text-[12px] text-muted-soft mt-1 leading-snug">Isi tiap langkah. Setelah lengkap, komplain langsung diproses sistem.</div>
          </div>
          <button type="button" id="alb-complaint-close" class="w-9 h-9 rounded-full bg-surface-strong border border-hairline text-ink hover:bg-hairline shrink-0"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="p-5 space-y-4 overflow-y-auto">
          <div>
            <label class="block text-[12px] font-bold text-muted mb-1.5">1. Komplain tentang apa?</label>
            <div id="alb-complaint-types" class="flex flex-wrap gap-2"></div>
          </div>
          <div id="alb-complaint-step2" class="hidden">
            <label class="block text-[12px] font-bold text-muted mb-1.5">2. Nama / bagian yang dikomplain</label>
            <div class="relative">
              <select id="alb-complaint-name-select" class="w-full bg-white border border-hairline rounded-xl px-3 py-2 text-[13px] outline-none focus:border-primary disabled:opacity-60">
                <option value="">— pilih —</option>
              </select>
              <div id="alb-complaint-name-loading" class="hidden absolute inset-0 flex items-center gap-2 px-3 text-[12px] text-muted bg-white/90 rounded-xl pointer-events-none">
                <i class="fa-solid fa-spinner fa-spin text-primary"></i> Memuat daftar dari VClass…
              </div>
            </div>
            <input id="alb-complaint-name" class="hidden w-full bg-white border border-hairline rounded-xl px-3 py-2 text-[13px] outline-none focus:border-primary mt-2" placeholder="contoh: Kuis 2 / Tugas Praktik 2">
          </div>
          <div id="alb-complaint-step3" class="hidden">
            <label class="block text-[12px] font-bold text-muted mb-1.5">3. Apa yang mau dikomplain?</label>
            <select id="alb-complaint-reason-select" class="w-full bg-white border border-hairline rounded-xl px-3 py-2 text-[13px] outline-none focus:border-primary">
              <option value="">— pilih alasan —</option>
            </select>
            <div id="alb-complaint-reason-note" class="hidden mt-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-snug"></div>
          </div>
          <div id="alb-complaint-quizq" class="hidden">
            <label class="block text-[12px] font-bold text-muted mb-1.5">Nomor soal yang dikomplain</label>
            <div id="alb-complaint-quizq-loading" class="hidden flex items-center gap-2 text-[12px] text-muted py-2"><i class="fa-solid fa-spinner fa-spin text-primary"></i> Memuat soal &amp; jawabanmu dari VClass…</div>
            <select id="alb-complaint-quizq-select" class="hidden w-full bg-white border border-hairline rounded-xl px-3 py-2 text-[13px] outline-none focus:border-primary"><option value="">— pilih nomor —</option></select>
            <div id="alb-complaint-quizq-msg" class="hidden mt-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-snug"></div>
            <div id="alb-complaint-quizq-preview" class="hidden mt-2 border border-hairline rounded-xl overflow-hidden bg-white"></div>
          </div>
        </div>
        <div class="px-5 py-4 border-t border-hairline bg-canvas-soft flex justify-end gap-2 shrink-0">
          <button type="button" id="alb-complaint-cancel" class="px-4 py-2 text-[13px] font-semibold text-muted">Batal</button>
          <button type="button" id="alb-complaint-submit" disabled class="bg-primary hover:bg-primary-active text-white rounded-full px-4 py-2 text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed">Kirim Komplain</button>
        </div>
      </div>
    </div>
  `);
  const close = () => $('#alb-complaint-modal').addClass('hidden');
  $('#alb-complaint-close, #alb-complaint-cancel').on('click', close);
  $('#alb-complaint-modal').on('click', (e) => { if (e.target.id === 'alb-complaint-modal') close(); });
}

// Spinner overlay untuk dropdown "Nama/bagian" saat memuat daftar dari VClass.
function setNameLoading(loading) {
  $('#alb-complaint-name-loading').toggleClass('hidden', !loading);
  $('#alb-complaint-name-select').prop('disabled', loading);
}

// Isi dropdown "Nama/bagian" dari aktivitas live sesuai jenis komplain yang aktif.
function populateNameOptions(type) {
  const $sel = $('#alb-complaint-name-select');
  if (!$sel.length) return;

  if (activitiesCache === null) {
    setNameLoading(true);
    $sel.html('<option value="">—</option>');
    return;
  }
  setNameLoading(false);
  const list = (activitiesCache && activitiesCache[type]) || [];
  const opts = ['<option value="">— pilih ' + escAttr(type) + ' —</option>'];
  list.forEach((a) => {
    const t = a && a.title ? a.title : '';
    if (!t) return;
    const mark = a.locked ? ' 🔒 (belum terbuka)' : (a.completed ? ' ✓' : '');
    opts.push(`<option value="${escAttr(t)}"${a.locked ? ' data-locked="1"' : ''}>${escAttr(t)}${mark}</option>`);
  });
  if (!list.length) {
    opts.push('<option value="" disabled>(belum terbaca dari VClass)</option>');
  }
  opts.push('<option value="__manual__">Lainnya (ketik sendiri)…</option>');
  $sel.html(opts.join(''));
  $('#alb-complaint-name').addClass('hidden').val('');
}

function populateReasonOptions(type) {
  const $sel = $('#alb-complaint-reason-select');
  if (!$sel.length) return;
  const reasons = COMPLAINT_REASONS[type] || COMPLAINT_REASONS.Tugas;
  const opts = ['<option value="">— pilih alasan —</option>']
    .concat(reasons.map((r) => `<option value="${escAttr(r.id)}">${escAttr(r.label)}</option>`));
  $sel.html(opts.join(''));
  $('#alb-complaint-reason-note').addClass('hidden').text('');
}

async function loadActivities(context) {
  const sessionId = context?.sessionId;
  if (!sessionId) { activitiesCache = {}; }
  else {
    try {
      const res = await ApiService.get(`/chat/session-activities/${sessionId}`);
      const data = (res?.status === 'success' && res.data) ? res.data : {};
      activitiesCache = {
        Kuis: data.Kuis || [], Tugas: data.Tugas || [],
        Materi: data.Materi || [], Forum: data.Forum || []
      };
    } catch (e) {
      activitiesCache = {};
    }
  }
  // Selesai memuat → kalau jenis sudah dipilih, isi dropdown + matikan spinner.
  const activeType = $('#alb-complaint-types .alb-complaint-type.is-active').attr('data-type');
  if (activeType) populateNameOptions(activeType);
  else setNameLoading(false);
}

// ---- Komplain KUIS: muat soal + jawaban siswa untuk pilih nomor + preview ----
let quizQuestionsCache = null; // { ok, quizName, questions:[{slot,number,text,status,html}] } | {ok:false,reason}

async function loadQuizQuestions(context, quizName) {
  quizQuestionsCache = null;
  $('#alb-complaint-quizq-loading').removeClass('hidden');
  $('#alb-complaint-quizq-select, #alb-complaint-quizq-preview, #alb-complaint-quizq-msg').addClass('hidden');
  try {
    const res = await ApiService.get(`/chat/quiz-questions/${context.sessionId}?quiz=${encodeURIComponent(quizName)}`);
    quizQuestionsCache = (res?.status === 'success' && res.data) ? res.data : { ok: false, reason: 'error' };
  } catch (e) {
    quizQuestionsCache = { ok: false, reason: 'error' };
  }
  $('#alb-complaint-quizq-loading').addClass('hidden');
  renderQuizQuestionPicker();
}

function renderQuizQuestionPicker() {
  const data = quizQuestionsCache;
  const $sel = $('#alb-complaint-quizq-select');
  const $msg = $('#alb-complaint-quizq-msg');
  $('#alb-complaint-quizq-preview').addClass('hidden').empty();

  if (!data || data.ok !== true || !Array.isArray(data.questions) || !data.questions.length) {
    let txt = 'Soal tidak bisa dimuat dari VClass. Coba lagi sebentar, atau pilih kuis lain.';
    if (data?.reason === 'not_attempted') txt = 'Kamu belum menyelesaikan kuis ini, jadi belum ada jawaban yang bisa dikomplain.';
    else if (data?.reason === 'no_identity') txt = 'Akun Moodle-mu belum terbaca. Coba buka AI Buddy dari dalam VClass ya.';
    else if (data?.reason === 'review_unavailable' || data?.reason === 'attempts_unavailable') txt = 'Lembar jawaban belum bisa dibuka dari VClass (izin sistem). Komplain ini sebaiknya langsung ke guru.';
    $sel.addClass('hidden');
    $msg.text(txt + ' Kalau begitu, ganti pilihan di atas ke "Hal lain" untuk diteruskan ke guru ya.').removeClass('hidden');
    return;
  }
  const opts = ['<option value="">— pilih nomor —</option>'].concat(
    data.questions.map((q) => {
      const st = q.isWrong ? ' • dinilai salah'
        : (q.state || '').includes('right') ? ' • dinilai benar' : '';
      const short = (q.questionText || q.text || '').slice(0, 38);
      return `<option value="${escAttr(String(q.slot))}">No. ${escAttr(String(q.number || q.slot))}${st}${short ? ' — ' + escAttr(short) : ''}</option>`;
    })
  );
  $sel.html(opts.join('')).removeClass('hidden');
  $msg.addClass('hidden');
}

// Preview bersih dari data terstruktur (soal + opsi, jawaban siswa & kunci ditandai).
function renderQuizQuestionPreview(slot) {
  const $prev = $('#alb-complaint-quizq-preview');
  const q = (quizQuestionsCache?.questions || []).find((x) => String(x.slot) === String(slot));
  if (!q) { $prev.addClass('hidden').empty(); return; }

  const opts = (q.options || []).map((o) => {
    const isPick = o.selected;
    const isKey = o.isCorrect;
    let cls = 'border-hairline bg-white text-ink';
    let tag = '';
    if (isKey) { cls = 'border-green-300 bg-green-50 text-green-800'; tag = '<span class="text-[10px] font-bold text-green-700 ml-1">✓ kunci</span>'; }
    if (isPick && !isKey) { cls = 'border-red-300 bg-red-50 text-red-800'; tag = '<span class="text-[10px] font-bold text-red-700 ml-1">✗ jawabanmu</span>'; }
    if (isPick && isKey) { tag = '<span class="text-[10px] font-bold text-green-700 ml-1">✓ jawabanmu (benar)</span>'; }
    return `<div class="flex items-start gap-2 border ${cls} rounded-lg px-2.5 py-1.5 text-[12px]"><span class="font-bold">${escAttr(o.label || '')}.</span><span class="flex-1">${escAttr(o.text || '')}${tag}</span></div>`;
  }).join('');

  const statusBadge = q.isWrong
    ? '<span class="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">Dinilai salah</span>'
    : '<span class="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">Dinilai benar</span>';

  $prev.html(
    `<div class="px-3 py-1.5 text-[10px] font-bold uppercase text-muted bg-surface-strong border-b border-hairline flex items-center justify-between">
       <span>Soal No. ${escAttr(String(q.number || q.slot))} &amp; jawabanmu</span>${statusBadge}
     </div>
     <div class="p-3 space-y-2">
       <div class="text-[13px] font-semibold text-ink">${escAttr(q.questionText || '(teks soal tidak terbaca)')}</div>
       <div class="space-y-1.5">${opts || '<div class="text-[12px] text-muted-soft">Opsi jawaban tidak terbaca.</div>'}</div>
     </div>`
  ).removeClass('hidden');
}

function getChosenSlot() {
  return String($('#alb-complaint-quizq-select').val() || '');
}

// Kirim komplain KUIS ke endpoint sengketa (algoritma Moodle review + RAG + AI).
async function submitQuizDispute(context, quizName, slot) {
  context.clearInputMention?.();
  context.appendBubble?.(`Komplain ${quizName} nomor ${slot} (jawabanku dinilai salah)`, true, 'user');
  context.appendTypingIndicator?.();
  context.isRequesting = true;
  try {
    const res = await ApiService.post('/chat/quiz-dispute', { sessionId: context.sessionId, quiz: quizName, slot });
    context.removeTypingIndicator?.();
    const bot = (res?.status === 'success' && res.data?.botMessage) ? res.data.botMessage : null;
    if (bot) context.appendBubble?.(bot.message, false, 'system', bot.actions || []);
    else context.appendBubble?.(res?.message || 'Maaf, aku gagal memproses komplain kuis. Coba lagi ya.', false, 'system');
  } catch (e) {
    context.removeTypingIndicator?.();
    context.appendBubble?.('Gagal terhubung ke server saat memproses komplain kuis. Coba klik lagi sebentar ya.', false, 'system');
  } finally {
    context.isRequesting = false;
    context.scrollToBottom?.();
  }
}

// Nama/bagian terisi? (dropdown aktivitas valid, atau manual sudah diketik)
function getChosenName() {
  const selVal = String($('#alb-complaint-name-select').val() || '');
  if (selVal && selVal !== '__manual__') return selVal;
  if (selVal === '__manual__') return String($('#alb-complaint-name').val() || '').trim();
  return '';
}

export function openComplaintComposer(context) {
  ensureComplaintModal();
  $('#alb-complaint-modal').removeClass('hidden');

  // Reset progresif: hanya langkah 1 yang tampil, tidak ada jenis aktif dulu.
  $('#alb-complaint-step2, #alb-complaint-step3').addClass('hidden');
  $('#alb-complaint-submit').prop('disabled', true);
  $('#alb-complaint-types').html(COMPLAINT_TYPES.map((t) =>
    `<button type="button" class="alb-complaint-type border rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors bg-white text-ink border-hairline hover:bg-canvas-soft" data-type="${t}">${t}</button>`
  ).join(''));

  const activeType = () => $('#alb-complaint-types .alb-complaint-type.is-active').attr('data-type') || '';
  const isKuis = () => activeType() === 'Kuis';
  const reasonVal = () => String($('#alb-complaint-reason-select').val() || '');

  // Submit aktif hanya jika langkah-langkahnya lengkap.
  // Untuk KUIS alasan "salah dinilai" → wajib pilih nomor soal dulu.
  const refreshSubmit = () => {
    let ok = Boolean(activeType()) && Boolean(getChosenName()) && Boolean(reasonVal());
    if (ok && isKuis() && reasonVal() === 'salah_dinilai' && !getChosenSlot()) ok = false;
    $('#alb-complaint-submit').prop('disabled', !ok);
  };

  const showReasonStep = () => {
    populateReasonOptions(activeType());
    $('#alb-complaint-step3').removeClass('hidden');
  };

  // Setelah nama dipilih → tampilkan langkah ALASAN (untuk semua jenis).
  // (Khusus Kuis, langkah "nomor soal" baru muncul setelah memilih alasan "salah dinilai".)
  const onNameChosen = () => {
    const named = Boolean(getChosenName());
    $('#alb-complaint-quizq').addClass('hidden');
    if (!named) {
      $('#alb-complaint-step3').addClass('hidden');
      refreshSubmit();
      return;
    }
    showReasonStep();
    refreshSubmit();
  };

  // Muat aktivitas live (sekali) — dipakai saat jenis dipilih.
  activitiesCache = null;
  loadActivities(context);

  // Langkah 1: pilih jenis → tampilkan langkah 2, reset langkah lanjutan.
  $('#alb-complaint-types').off('click', '.alb-complaint-type').on('click', '.alb-complaint-type', function () {
    $('.alb-complaint-type').removeClass('is-active bg-primary text-white border-primary').addClass('bg-white text-ink border-hairline hover:bg-canvas-soft');
    $(this).addClass('is-active bg-primary text-white border-primary').removeClass('bg-white text-ink border-hairline hover:bg-canvas-soft');
    populateNameOptions($(this).attr('data-type'));
    if (activitiesCache === null) loadActivities(context).then(() => populateNameOptions(activeType()));
    $('#alb-complaint-step2').removeClass('hidden');
    $('#alb-complaint-quizq, #alb-complaint-step3').addClass('hidden');
    refreshSubmit();
  });

  // Langkah 2: pilih nama → "Lainnya" munculkan input.
  $('#alb-complaint-name-select').off('change.albComplaint').on('change.albComplaint', function () {
    const isManual = $(this).val() === '__manual__';
    $('#alb-complaint-name').toggleClass('hidden', !isManual);
    if (isManual) $('#alb-complaint-name').focus();
    onNameChosen();
  });
  $('#alb-complaint-name').off('input.albComplaint').on('input.albComplaint', onNameChosen);

  // (KUIS) Pilih nomor soal → tampilkan preview soal + jawaban dari Moodle.
  $('#alb-complaint-quizq-select').off('change.albComplaint').on('change.albComplaint', function () {
    renderQuizQuestionPreview(String($(this).val() || ''));
    refreshSubmit();
  });

  // Langkah 3: pilih alasan.
  //  - "hubungi guru" → beri catatan kecil + sembunyikan langkah nomor.
  //  - KUIS "jawaban benar tapi dinilai salah" → MUNCULKAN langkah pilih nomor soal (+ muat soal).
  $('#alb-complaint-reason-select').off('change.albComplaint').on('change.albComplaint', function () {
    const reasons = COMPLAINT_REASONS[activeType()] || [];
    const reason = reasons.find((r) => r.id === $(this).val());
    const $note = $('#alb-complaint-reason-note');

    if (reason && reason.kind === 'guru') {
      $note.text('Untuk hal ini, komplainmu akan diarahkan langsung ke gurumu (lewat WhatsApp) — bukan dijawab sistem.').removeClass('hidden');
    } else {
      $note.addClass('hidden').text('');
    }

    if (isKuis() && reason && reason.id === 'salah_dinilai') {
      // Reset preview + tampilkan langkah nomor & muat soal dari Moodle (spinner).
      $('#alb-complaint-quizq-preview').addClass('hidden').empty();
      $('#alb-complaint-quizq-select').addClass('hidden').val('');
      $('#alb-complaint-quizq').removeClass('hidden');
      loadQuizQuestions(context, getChosenName());
    } else {
      $('#alb-complaint-quizq').addClass('hidden');
    }
    refreshSubmit();
  });

  // KIRIM.
  $('#alb-complaint-submit').off('click').on('click', () => {
    const type = activeType();
    const name = getChosenName();
    if (!type || !name) return;
    const reasons = COMPLAINT_REASONS[type] || [];
    const reason = reasons.find((r) => r.id === reasonVal());
    if (!reason) return;

    // KUIS: alasan "salah dinilai" → endpoint sengketa (Moodle review + RAG + AI).
    if (isKuis() && reason.id === 'salah_dinilai') {
      const slot = getChosenSlot();
      if (!slot) return;
      $('#alb-complaint-modal').addClass('hidden');
      submitQuizDispute(context, name, slot);
      return;
    }

    const slot = isKuis() ? getChosenSlot() : '';
    const subj = buildSubject(type, name) + (slot ? ` nomor ${slot}` : '');
    $('#alb-complaint-modal').addClass('hidden');

    if (reason.kind === 'guru') {
      routeComplaintToTeacher(context, subj, reason.label);
      return;
    }
    // Tugas/Forum (kind 'system') → kirim ke algoritma dengan INTENT EKSPLISIT supaya
    // tak bergantung klasifikasi (anti salah-rute ke tabel kuis).
    context.clearInputMention?.();
    context.sendDirectMessage?.({ message: reason.build(subj), responseMode: 'system', forceAI: false, intent: reason.intent || null });
  });

  refreshSubmit();
}

// Komplain yang tak punya algoritma sistem → fasilitasi menghubungi guru lewat WhatsApp.
function routeComplaintToTeacher(context, subj, reasonLabel) {
  const studentName =
    context?.studentName ||
    context?.contextData?.session_meta?.display_name ||
    context?.sessionMeta?.display_name || '';
  const waText = encodeURIComponent(
    `Halo Bu/Pak Guru${studentName ? ', saya ' + studentName : ''}. Saya mau komplain soal ${subj} (${reasonLabel}).`
  );
  const waUrl = `https://api.whatsapp.com/send/?phone=${WA_TEACHER_PHONE}&text=${waText}`;

  context.appendBubble?.(`Komplain: ${subj} — ${reasonLabel}`, true, 'user');
  context.appendBubble?.(
    `Untuk komplain ini, paling tepat disampaikan **langsung ke gurumu** ya 🙏. Aku belum bisa memutuskan hal seperti ini sendiri.\n\nKlik tombol di bawah untuk menghubungi guru lewat WhatsApp — pesannya sudah aku siapkan, tinggal kamu kirim.`,
    false, 'system',
    [{ type: 'wa_teacher', label: '💬 Hubungi Guru via WhatsApp', url: waUrl }]
  );
  context.scrollToBottom?.();
}
