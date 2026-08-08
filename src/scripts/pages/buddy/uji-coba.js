// ============================================================
// uji-coba.js — [v0.9.72] Alur UJI COBA TERPANDU untuk pengujian SUS.
// Diaktifkan lewat link umum `/buddy?projectKey=<KEY>&new_chat=true`.
//
// Alur (Fase 0–2):
//   0. Modal identitas 2 langkah: email Moodle → deteksi siswa → dropdown course
//      terisi otomatis dari `enrolled_courses` → siswa pilih → sesi siap.
//   1. Tawarkan install PWA (opsional, boleh dilewati).
//   2. Task engine: 5 tugas uji coba, auto-terdeteksi saat siswa (sengaja/tidak)
//      menyelesaikannya → toast "Task N selesai". Modal bisa di-minimize ke tombol
//      pojok kanan-bawah. Klik task belum selesai → panduan singkat (boleh dilewati).
//
// Deteksi dibuat DECOUPLED (1 observer + 2 listener delegasi), tak menyebar edit ke
// events.js/mentions.js/static-tutorial.js.
// ============================================================
import $ from 'jquery';
import Toast from '../../components/toast.js';
import { ApiService } from '../../fetch/api.js';

// Referensi context (BuddyPage) untuk helper non-method (observer/toast/detektor).
let _ctx = null;

// [Fase 1] Simpan event beforeinstallprompt segera saat modul dimuat (bisa terlanjur
// terpicu sebelum flow dimulai). Best-effort: kalau terlewat, langkah install cuma
// menampilkan instruksi manual.
if (typeof window !== 'undefined' && !window.__albInstallPromptHooked) {
  window.__albInstallPromptHooked = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__albDeferredInstallPrompt = e;
  });
}

// 5 tugas = pemetaan ke 7 kebutuhan fungsional (#5 & #6 dialami di dalam @materi).
// `subs` = sub-task/langkah konkret dengan CONTOH supaya siswa tak bingung.
const UJI_TASKS = [
  {
    id: 'validasi_email', num: 1, req: 'Keb. #1',
    label: 'Masuk & validasi email Moodle',
    subs: [
      'Masukkan email Moodle-mu (email untuk login VClass)',
      'Pilih kelas/course-mu dari daftar yang muncul otomatis',
      'Klik "Mulai" — kalau valid, task ini otomatis tercentang'
    ]
  },
  {
    id: 'panduan_gambar', num: 2, req: 'Keb. #2',
    label: 'Buka panduan bergambar',
    subs: [
      'Ketik pertanyaan cara pakai VClass, misalnya "cara mengumpulkan tugas" atau "cara login"',
      'Pada jawaban, klik tombol "Lihat Panduan" (bergambar)',
      'Geser langkah demi langkahnya sampai selesai'
    ]
  },
  {
    id: 'tanya_ai', num: 3, req: 'Keb. #3',
    label: 'Tanya AI satu pertanyaan pelajaran',
    subs: [
      'Ketik pertanyaan pelajaran, misalnya "apa itu algoritma" atau "apa itu CMS"',
      'Tekan tombol kirim',
      'Baca jawaban dari AI'
    ]
  },
  {
    id: 'mention_materi', num: 4, req: 'Keb. #4, #5, #6',
    label: 'Coba @materi (ringkas / buat soal)',
    subs: [
      'Ketik tanda "@" lalu pilih salah satu materi',
      'Minta "ringkas materi ini" atau "buatkan 3 soal latihan"',
      'Kirim — jawaban diambil langsung dari materi (RAG)'
    ]
  },
  {
    id: 'hubungi_wa', num: 5, req: 'Keb. #7',
    label: 'Hubungi guru via WhatsApp',
    subs: [
      'Buka sidebar kiri (kalau tersembunyi, klik tombol ☰ garis tiga di kiri atas)',
      'Scroll ke bawah di sidebar sampai ketemu tombol "Hubungi Guru (WhatsApp)", lalu klik',
      'Pada respon yang muncul, klik tombol hijau untuk menghubungi guru'
    ]
  }
];

function escUji(s = '') {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// -------- state per-siswa (localStorage) --------
function ujiIdentity(context) {
  const meta = context?.contextData?.session_meta || {};
  const email = (meta.email || sessionStorage.getItem('alb_student_email') || '').trim().toLowerCase();
  return {
    email,
    projectKey: context?.projectKey || 'project'
  };
}
function ujiStorageKey(context) {
  const { email, projectKey } = ujiIdentity(context);
  return `alb:${window.location.host}:${projectKey}:ujicoba-tasks:${email || context?.sessionId || 'anon'}`;
}
function readUjiState(context) {
  try { return JSON.parse(localStorage.getItem(ujiStorageKey(context)) || '{}') || {}; } catch (_) { return {}; }
}
function writeUjiState(context, state) {
  try { localStorage.setItem(ujiStorageKey(context), JSON.stringify(state || {})); } catch (_) {}
}
function doneCount(state) { return UJI_TASKS.filter((t) => state[t.id]).length; }

// ============================================================
// Aktivasi mode
// ============================================================
export function isUjiCobaMode() {
  if (this && this.ujiCobaMode) return true;
  try { return sessionStorage.getItem('alb_ujicoba') === '1'; } catch (_) { return false; }
}

// ============================================================
// [Fase 0] Modal identitas 2 langkah (email → course auto)
// ============================================================
function ensureUjiIdentityModal() {
  if ($('#alb-uji-id-overlay').length) return;
  $('body').append(`
    <div id="alb-uji-id-overlay" class="hidden fixed inset-0 z-[9800] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-surface-card w-full max-w-[440px] rounded-2xl shadow-2xl border border-hairline overflow-hidden">
        <div class="px-5 py-4 border-b border-hairline bg-white">
          <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted flex items-center gap-2"><i class="fa-solid fa-graduation-cap text-primary"></i> Uji Coba AI Buddy</div>
          <div class="text-[15px] font-black text-ink mt-1">Masuk dengan email Moodle</div>
          <div class="text-[12px] text-muted-soft mt-1 leading-snug">Pakai email yang kamu gunakan untuk login VClass. Kelasmu akan terisi otomatis.</div>
        </div>
        <div class="p-5 space-y-4">
          <div id="alb-uji-step-email">
            <label class="block text-[12px] font-bold text-muted mb-1.5">Email Moodle</label>
            <input id="alb-uji-email" type="email" autocomplete="email" class="w-full bg-canvas border border-hairline-strong rounded-xl px-4 py-3 text-[14px] text-ink outline-none focus:border-primary" placeholder="nama@smpn167jakarta.sch.id">
            <div id="alb-uji-email-status" class="hidden text-[12px] mt-2"></div>
          </div>
          <div id="alb-uji-step-course" class="hidden">
            <label class="block text-[12px] font-bold text-muted mb-1.5">Kelas / Course kamu</label>
            <select id="alb-uji-course" class="w-full bg-canvas border border-hairline-strong rounded-xl px-4 py-3 text-[14px] text-ink outline-none focus:border-primary"></select>
            <div class="text-[11px] text-muted-soft mt-1.5"><i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i><span id="alb-uji-course-hint">Terisi otomatis dari data VClass-mu.</span></div>
          </div>
        </div>
        <div class="px-5 py-4 border-t border-hairline bg-canvas-soft flex justify-end gap-2">
          <button type="button" id="alb-uji-id-next" class="bg-primary hover:bg-primary-active text-white rounded-full px-6 py-2.5 text-[13px] font-bold shadow-sm">Lanjut</button>
        </div>
      </div>
    </div>
  `);
}

// Buka modal identitas; resolve(true) saat siswa siap masuk.
export function openUjiIdentityModal() {
  const context = this;
  ensureUjiIdentityModal();
  const $ov = $('#alb-uji-id-overlay');
  $ov.removeClass('hidden');
  $('#alb-uji-step-course').addClass('hidden');
  $('#alb-uji-email-status').addClass('hidden');
  $('#alb-uji-id-next').text('Lanjut').prop('disabled', false);
  setTimeout(() => $('#alb-uji-email').trigger('focus'), 80);

  return new Promise((resolve) => {
    let enrolled = [];
    let verified = false;

    const setStatus = (msg, tone = 'muted') => {
      const cls = { muted: 'text-muted', error: 'text-rose-700', ok: 'text-emerald-700' }[tone] || 'text-muted';
      $('#alb-uji-email-status').removeClass('hidden text-muted text-rose-700 text-emerald-700').addClass(cls).html(msg);
    };

    // Langkah 1: cek email → ambil enrolled_courses.
    const verifyEmail = async () => {
      const email = String($('#alb-uji-email').val() || '').trim().toLowerCase();
      if (!email || !email.includes('@')) { setStatus('Masukkan email yang valid.', 'error'); return; }

      $('#alb-uji-id-next').prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin mr-1"></i> Mengecek…');
      setStatus('<i class="fa-solid fa-spinner fa-spin mr-1"></i> Mencocokkan email ke data VClass…', 'muted');

      const res = await ApiService.post('/moodle/student/resolve', {
        projectKey: context.projectKey, projectId: context.projectId,
        sessionId: context.sessionId, email
      }).catch(() => null);

      $('#alb-uji-id-next').prop('disabled', false);

      if (res?.status === 'success' && res.data?.found) {
        enrolled = Array.isArray(res.data.enrolled_courses) ? res.data.enrolled_courses.filter((c) => c.course_id) : [];
        try { sessionStorage.setItem('alb_student_email', email); } catch (_) {}
        setStatus(`<i class="fa-solid fa-check"></i> Halo, ${escUji(res.data.fullname || email.split('@')[0])}!`, 'ok');

        if (!enrolled.length) {
          // Terverifikasi tapi course tak termapping → tetap izinkan lanjut tanpa pilih.
          verified = true;
          $('#alb-uji-step-course').addClass('hidden');
          $('#alb-uji-id-next').text('Mulai');
          return;
        }

        $('#alb-uji-course').html(enrolled.map((c) =>
          `<option value="${escUji(String(c.course_id))}" data-class="${escUji(c.class_code || '')}">${escUji(c.class_code || c.course_title || ('Course ' + c.course_id))}${c.class_code && c.course_title ? ' — ' + escUji(c.course_title) : ''}</option>`
        ).join(''));
        $('#alb-uji-step-course').removeClass('hidden');
        $('#alb-uji-id-next').text('Mulai');
        verified = true;
      } else {
        // [v0.9.76] Uji coba WAJIB email terdaftar — TIDAK ADA mode tamu. Hanya siswa yang
        // emailnya ada di data VClass tersinkron yang boleh masuk.
        verified = false;
        enrolled = [];
        $('#alb-uji-step-course').addClass('hidden');
        $('#alb-uji-id-next').text('Lanjut');
        let msg = res?.data?.message || res?.message || 'Email tidak terdaftar sebagai siswa. Hanya email yang terdaftar di VClass yang bisa masuk.';
        if (res?.data?.directory_populated === false) {
          msg = 'Data siswa belum tersinkron dari VClass. Minta guru/admin menjalankan "Perbarui Data Siswa" dulu, lalu coba lagi.';
        }
        setStatus(msg, 'error');
      }
    };

    // Langkah 2: finalisasi identitas dgn course terpilih → sesi siap.
    const finalize = async () => {
      const email = String($('#alb-uji-email').val() || '').trim().toLowerCase();
      const $opt = $('#alb-uji-course option:selected');
      const courseId = enrolled.length ? String($('#alb-uji-course').val() || '') : '';
      const classCode = String($opt.attr('data-class') || '').toUpperCase();

      $('#alb-uji-id-next').prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menyiapkan…');
      try {
        if (courseId) {
          await context.resolveStudentIdentityByEmail?.(email, classCode, courseId);
        } else {
          // Tamu / tanpa course: minimal simpan email supaya konteks siswa terisi.
          await context.resolveStudentIdentityByEmail?.(email, '', null);
        }
      } catch (_) { /* lanjut walau gagal — jangan blokir uji coba */ }

      $ov.addClass('hidden');
      resolve(true);
    };

    $('#alb-uji-id-next').off('click').on('click', () => {
      if (!verified) verifyEmail();
      else finalize();
    });
    $('#alb-uji-email').off('keydown.uji').on('keydown.uji', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (!verified) verifyEmail(); }
    });
    // Ketik ulang email setelah verified → wajib cek lagi.
    $('#alb-uji-email').off('input.uji').on('input.uji', () => {
      if (verified) {
        verified = false;
        $('#alb-uji-step-course').addClass('hidden');
        $('#alb-uji-id-next').text('Lanjut');
        $('#alb-uji-email-status').addClass('hidden');
      }
    });
  });
}

// ============================================================
// [Fase 1] Tawarkan install PWA (opsional)
// ============================================================
export function offerPwaInstall() {
  return new Promise((resolve) => {
    // Sudah standalone / sudah pernah ditawarkan sesi ini → lewati.
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
    if (standalone) return resolve();
    $('#alb-uji-pwa-overlay').remove();

    const deferred = window.__albDeferredInstallPrompt || null;
    $('body').append(`
      <div id="alb-uji-pwa-overlay" class="fixed inset-0 z-[9800] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-surface-card w-full max-w-[400px] rounded-2xl shadow-2xl border border-hairline overflow-hidden">
          <div class="p-5 text-center">
            <div class="w-14 h-14 mx-auto bg-primary/10 text-primary rounded-2xl flex items-center justify-center text-2xl mb-3"><i class="fa-solid fa-download"></i></div>
            <div class="text-[16px] font-black text-ink">Pasang AI Buddy?</div>
            <div class="text-[13px] text-muted-soft mt-1.5 leading-relaxed">Biar gampang dibuka lagi seperti aplikasi biasa (tanpa perlu browser). Kalau tidak mau juga tidak apa-apa.</div>
          </div>
          <div class="px-5 pb-5 flex flex-col gap-2">
            <button type="button" id="alb-uji-pwa-install" class="w-full bg-primary hover:bg-primary-active text-white rounded-full px-4 py-2.5 text-[13px] font-bold">Pasang Aplikasi</button>
            <button type="button" id="alb-uji-pwa-skip" class="w-full text-muted hover:text-ink text-[13px] font-semibold py-1.5">Nanti saja</button>
          </div>
        </div>
      </div>
    `);

    const close = () => { $('#alb-uji-pwa-overlay').remove(); resolve(); };
    $('#alb-uji-pwa-skip').on('click', close);
    $('#alb-uji-pwa-install').on('click', async () => {
      if (deferred && typeof deferred.prompt === 'function') {
        try { deferred.prompt(); await deferred.userChoice; } catch (_) {}
        window.__albDeferredInstallPrompt = null;
      } else {
        Toast.show('Untuk memasang: buka menu browser ⋮ lalu pilih "Tambahkan ke layar utama".', 'warn');
      }
      close();
    });
  });
}

// ============================================================
// [Fase 2] Task modal + LABEL sub-task (minimize) + fokus per-task
// ============================================================

// Task yang sedang difokuskan: pilihan manual (klik di modal) selama belum selesai,
// selain itu = task belum-selesai pertama.
function focusTaskId(context) {
  const state = readUjiState(context);
  const fid = context._ujiFocusId;
  if (fid && !state[fid]) return fid;
  const firstIncomplete = UJI_TASKS.find((t) => !state[t.id]);
  return firstIncomplete ? firstIncomplete.id : UJI_TASKS[UJI_TASKS.length - 1].id;
}

function ensureUjiTaskModal(context) {
  if ($('#alb-uji-task-modal').length) return;
  $('body').append(`
    <div id="alb-uji-task-modal" class="hidden fixed inset-0 z-[9700] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-surface-card w-full max-w-[480px] max-h-[88vh] rounded-2xl shadow-2xl border border-hairline flex flex-col overflow-hidden">
        <div class="px-5 py-4 border-b border-hairline bg-white flex items-start justify-between gap-3 shrink-0">
          <div class="min-w-0">
            <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted flex items-center gap-2"><i class="fa-solid fa-list-check text-primary"></i> Tugas Uji Coba</div>
            <div class="text-[12px] text-muted-soft mt-1 leading-snug">Task tercentang otomatis saat kamu berhasil mencobanya. Klik satu tugas untuk fokus — langkahnya muncul di label kanan atas.</div>
          </div>
          <button type="button" id="alb-uji-task-min" title="Kecilkan" class="w-9 h-9 rounded-full bg-surface-strong border border-hairline text-ink hover:bg-hairline shrink-0"><i class="fa-solid fa-minus"></i></button>
        </div>
        <div class="px-5 pt-4 shrink-0">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <span class="text-[12px] font-semibold text-ink">Progress</span>
            <span id="alb-uji-count" class="text-[12px] font-bold text-primary">0/${UJI_TASKS.length}</span>
          </div>
          <div class="h-2 w-full bg-hairline rounded-full overflow-hidden">
            <div id="alb-uji-bar" class="h-full bg-primary rounded-full transition-all duration-300" style="width:0%"></div>
          </div>
        </div>
        <div id="alb-uji-list" class="p-4 overflow-y-auto flex-1 space-y-2.5"></div>
        <div id="alb-uji-footer" class="px-5 py-4 border-t border-hairline bg-canvas-soft shrink-0 text-[12px] text-muted-soft text-center leading-snug"></div>
      </div>
    </div>
  `);
  $('#alb-uji-task-min').on('click', () => minimizeUjiTaskModal(context));
}

function renderUjiTasks(context) {
  const state = readUjiState(context);
  const done = doneCount(state);
  const focusId = focusTaskId(context);
  $('#alb-uji-count').text(`${done}/${UJI_TASKS.length}`);
  $('#alb-uji-bar').css('width', `${Math.round((done / UJI_TASKS.length) * 100)}%`);

  $('#alb-uji-list').html(UJI_TASKS.map((t) => {
    const checked = !!state[t.id];
    const isFocus = !checked && t.id === focusId;
    return `
      <button type="button" class="alb-uji-head w-full text-left rounded-xl border px-3.5 py-3 flex items-start gap-3 transition-colors ${checked ? 'border-emerald-200 bg-emerald-50 cursor-default' : (isFocus ? 'border-primary/50 bg-primary/5' : 'border-hairline bg-white hover:bg-canvas-soft')}" data-id="${t.id}">
        <span class="shrink-0 w-5 h-5 mt-0.5 rounded-md border flex items-center justify-center ${checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-hairline-strong text-transparent'}">
          <i class="fa-solid fa-check text-[11px]"></i>
        </span>
        <span class="flex-1 min-w-0">
          <span class="block text-[13px] font-bold leading-snug ${checked ? 'text-emerald-800' : 'text-ink'}">${t.num}. ${escUji(t.label)}</span>
          <span class="block text-[11px] leading-snug ${checked ? 'text-emerald-600' : 'text-muted-soft'} mt-0.5">${checked ? 'Selesai ✓' : escUji(t.subs[0])}</span>
        </span>
        ${checked ? '' : '<i class="fa-solid fa-arrow-right text-primary/60 text-[11px] mt-1 shrink-0"></i>'}
      </button>`;
  }).join(''));

  $('#alb-uji-footer').html(done >= UJI_TASKS.length
    ? '<i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i> Semua tugas selesai!'
    : '<i class="fa-solid fa-hand-pointer mr-1"></i> Klik satu tugas untuk fokus — langkahnya muncul di label kanan atas.');
}

export function openUjiTaskModal() {
  const context = _ctx || this;
  ensureUjiTaskModal(context);
  hideUjiLabel();
  $('#alb-uji-task-modal').removeClass('hidden');

  // Klik task: belum selesai → fokuskan + kecilkan (label tampil sub-task-nya).
  // Sudah selesai → tak bisa buka tutorial lagi (info kecil).
  $('#alb-uji-list').off('click', '.alb-uji-head').on('click', '.alb-uji-head', function () {
    const id = $(this).data('id');
    const state = readUjiState(context);
    if (state[id]) { Toast.show('Task ini sudah selesai ✓', 'success'); return; }
    context._ujiFocusId = id;
    minimizeUjiTaskModal(context);
  });

  renderUjiTasks(context);
}

function minimizeUjiTaskModal(context) {
  $('#alb-uji-task-modal').addClass('hidden');
  renderUjiLabel(context);
}

// ---- Label sub-task melayang di kanan atas (pengganti FAB) ----
function ensureUjiLabelStyle() {
  if ($('#alb-uji-label-style').length) return;
  $('head').append(`<style id="alb-uji-label-style">
    @keyframes albUjiPulse { 0%{box-shadow:0 0 0 0 rgba(41,37,36,.35);} 70%{box-shadow:0 0 0 10px rgba(41,37,36,0);} 100%{box-shadow:0 0 0 0 rgba(41,37,36,0);} }
    #alb-uji-label .alb-uji-label-pill { animation: albUjiPulse 2s ease-out infinite; }
    #alb-uji-label:hover .alb-uji-label-pill { animation: none; }
    #alb-uji-label .alb-uji-label-panel { max-height:0; opacity:0; overflow:hidden; transition:max-height .3s ease, opacity .2s ease; }
    #alb-uji-label:hover .alb-uji-label-panel { max-height:340px; opacity:1; }
    #alb-uji-label:hover .alb-uji-label-chev { transform: rotate(180deg); }
  </style>`);
}

function ensureUjiLabel(context) {
  ensureUjiLabelStyle();
  if ($('#alb-uji-label').length) return;
  $('body').append(`
    <div id="alb-uji-label" class="hidden fixed top-[86px] right-3 md:right-5 z-[9500] w-[268px] max-w-[82vw] cursor-pointer select-none" title="Klik untuk buka daftar tugas">
      <div class="alb-uji-label-pill bg-surface-card border border-primary/30 rounded-2xl shadow-xl overflow-hidden">
        <div class="px-3.5 py-2.5 flex items-center gap-2.5">
          <span id="alb-uji-label-num" class="shrink-0 w-7 h-7 rounded-full bg-primary text-white text-[11px] font-black flex items-center justify-center">T</span>
          <span class="flex-1 min-w-0">
            <span id="alb-uji-label-title" class="block text-[10px] font-bold uppercase tracking-wide text-muted-soft">Tugas</span>
            <span id="alb-uji-label-current" class="block text-[12px] font-semibold text-ink leading-snug truncate">…</span>
          </span>
          <i class="fa-solid fa-chevron-down alb-uji-label-chev text-muted-soft text-[11px] shrink-0 transition-transform"></i>
        </div>
        <div class="alb-uji-label-panel border-t border-hairline bg-canvas-soft">
          <ul id="alb-uji-label-subs" class="px-3.5 py-2.5 space-y-1.5 text-[12px] leading-snug"></ul>
          <div class="px-3.5 pb-2.5 text-[10px] text-muted-soft"><i class="fa-solid fa-hand-pointer mr-1"></i> Klik untuk buka daftar semua tugas</div>
        </div>
      </div>
    </div>
  `);
  $('#alb-uji-label').on('click', () => openUjiTaskModal.call(context));
}

function renderUjiLabel(context) {
  ensureUjiLabel(context);
  const state = readUjiState(context);
  const t = UJI_TASKS.find((x) => x.id === focusTaskId(context)) || UJI_TASKS[0];
  const done = !!state[t.id];
  $('#alb-uji-label-num').text('T' + t.num);
  $('#alb-uji-label-title').text(done ? `Task ${t.num} selesai ✓` : `Task ${t.num} — sekarang`);
  $('#alb-uji-label-current').text(done ? t.label : (t.subs[0] || t.label));
  $('#alb-uji-label-subs').html(t.subs.map((s) => `
    <li class="flex gap-2 ${done ? 'text-emerald-700 line-through' : 'text-body'}">
      <i class="fa-solid ${done ? 'fa-check text-emerald-500' : 'fa-circle-dot text-primary/60'} text-[9px] mt-1 shrink-0"></i>
      <span>${escUji(s)}</span>
    </li>`).join(''));
  $('#alb-uji-label').removeClass('hidden');
}

function hideUjiLabel() { $('#alb-uji-label').addClass('hidden'); }

// ============================================================
// Penanda task + toast + hook semua-selesai
// ============================================================
export function markUjiCobaTask(id) {
  const context = _ctx || this;
  if (!context) return;
  const task = UJI_TASKS.find((t) => t.id === id);
  if (!task) return;
  const state = readUjiState(context);
  if (state[id]) return; // sudah selesai → jangan spam toast
  state[id] = true;
  writeUjiState(context, state);

  Toast.show(`Task ${task.num} selesai: ${task.label} ✓`, 'success');

  // [Fase 3] Task-2 (panduan bergambar) selesai → sidebar dibuka + catatan.
  if (id === 'panduan_gambar') revealUjiSidebar(context);

  // Fokus manual yang barusan selesai → lepas supaya label maju ke task berikutnya.
  if (context._ujiFocusId === id) context._ujiFocusId = null;

  if (!$('#alb-uji-task-modal').hasClass('hidden')) renderUjiTasks(context);
  else if (!$('#alb-uji-label').hasClass('hidden')) renderUjiLabel(context);

  if (doneCount(state) >= UJI_TASKS.length) onAllUjiTasksDone(context);
}

function onAllUjiTasksDone(context) {
  // [Fase 4] Semua selesai → modal SELESAI (info sidebar) → normalkan tampilan → form SUS.
  setTimeout(() => { hideUjiLabel(); openUjiCompletionModal(context); }, 700);
}

function openUjiCompletionModal(context) {
  $('#alb-uji-done-overlay').remove();
  $('body').append(`
    <div id="alb-uji-done-overlay" class="fixed inset-0 z-[9820] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-surface-card w-full max-w-[420px] rounded-2xl shadow-2xl border border-hairline p-7 text-center">
        <div class="w-16 h-16 mx-auto bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center text-3xl mb-4"><i class="fa-solid fa-trophy"></i></div>
        <div class="text-[20px] font-black text-ink">Semua tugas selesai! 🎉</div>
        <div class="text-[13px] text-muted-soft mt-2 leading-relaxed">Keren! Kamu sudah mencoba semua fitur inti AI Buddy. Sekarang <b>sidebar akan muncul</b> supaya lebih mudah — kamu tinggal klik menu di sana tanpa perlu mengetik. Tampilan juga kembali seperti biasa.</div>
        <div class="text-[12px] text-primary bg-primary/5 border border-primary/15 rounded-xl px-3 py-2 mt-4 leading-relaxed">Satu langkah terakhir: isi <b>penilaian singkat</b> tentang pengalamanmu ya. 🙏</div>
        <button type="button" id="alb-uji-done-next" class="mt-5 w-full bg-primary hover:bg-primary-active text-white rounded-full px-4 py-3 text-[14px] font-bold">Lanjut ke Penilaian</button>
      </div>
    </div>
  `);
  $('#alb-uji-done-next').on('click', () => {
    $('#alb-uji-done-overlay').remove();
    finishUjiSimpleUI(context); // "kaya awal lagi": sidebar tampil + tampilan normal
    if (typeof context.openSusForm === 'function') context.openSusForm();
  });
}

// Akhiri mode simpel: sidebar & tombol normal kembali, bersihkan UI uji coba.
function finishUjiSimpleUI() {
  document.body.classList.remove('alb-uji-simple', 'alb-uji-sidebar-on', 'alb-uji-quota-on', 'alb-uji-adv-on');
  $('#alb-uji-label').remove();
  $('#alb-uji-session-wrap').remove();
}

// ============================================================
// Detektor otomatis (decoupled): observer chat + klik delegasi
// ============================================================
function bindUjiDetectors(context) {
  if (context._ujiDetectorsBound) return;
  context._ujiDetectorsBound = true;

  // Task 3 & 4: bubble user baru di area chat.
  const chatEl = (context.$chatArea && context.$chatArea[0]) || document.getElementById('chat-area');
  if (chatEl && 'MutationObserver' in window) {
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          const el = /** @type {HTMLElement} */ (node);
          // Bubble user memiliki tombol .btn-user-copy.
          if (el.querySelector && el.querySelector('.btn-user-copy')) {
            markUjiCobaTask.call(context, 'tanya_ai');
            // Task 4: mention materi. Di bubble, @materi-N dirender jadi PILL
            // `.alb-bubble-mention` (teksnya "Materi: <nama>", bukan "@materi") — jadi
            // deteksi via elemen pill, BUKAN teks. Fallback: teks masih memuat @materi.
            if (el.querySelector('.alb-bubble-mention') || /@\s*materi/i.test(el.textContent || '')) {
              markUjiCobaTask.call(context, 'mention_materi');
            }
          }
        });
      }
    });
    obs.observe(chatEl, { childList: true });
    context._ujiChatObserver = obs;
  }

  // Task 2 (panduan bergambar) & Task 5 (Hubungi Guru WA): deteksi via NATIVE CAPTURE
  // di document — fase capture jalan DULU sebelum handler manapun, jadi kebal terhadap
  // preventDefault/stopPropagation/`.off()` jQuery yang bisa bikin delegasi bubbling gagal.
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('.btn-static-tutorial')) markUjiCobaTask.call(context, 'panduan_gambar');
    // Tombol hijau "Hubungi Guru" di respon sistem (membuka form WA) = Task 5 berhasil.
    if (t.closest('.btn-wa-action, .btn-wa-specific-task')) markUjiCobaTask.call(context, 'hubungi_wa');
  }, true);
}

// ============================================================
// [Fase 3] Simplifikasi UI (gated ke mode uji coba, via body-class + CSS)
// ============================================================
function ensureUjiSimpleStyle() {
  if ($('#alb-uji-simple-style').length) return;
  $('head').append(`<style id="alb-uji-simple-style">
    @media (min-width: 768px) {
      body.alb-uji-simple:not(.alb-uji-sidebar-on) #context-sidebar {
        width:0!important;min-width:0!important;max-width:0!important;opacity:0!important;border-right-width:0!important;overflow:hidden!important;
      }
    }
    body.alb-uji-simple:not(.alb-uji-sidebar-on) #btn-open-context { display:none!important; }
    body.alb-uji-simple:not(.alb-uji-quota-on) #alb-global-ai-usage-wrap { display:none!important; }
    body.alb-uji-simple:not(.alb-uji-adv-on) [id^="alb-intent-"] { display:none!important; }
    body.alb-uji-simple:not(.alb-uji-adv-on) div:has(> .btn-user-copy) { display:none!important; }
    body.alb-uji-simple:not(.alb-uji-adv-on) div:has(> .btn-bot-copy) { display:none!important; }
    body.alb-uji-simple #alb-session-actions-wrap,
    body.alb-uji-simple #btn-session-info,
    body.alb-uji-simple #alb-delete-session-btn { display:none!important; }
  </style>`);
}

function switchRow(id, label) {
  return `
    <button type="button" data-uji-switch="${id}" class="alb-uji-switch w-full flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-surface-strong transition-colors text-left">
      <span class="text-[12.5px] text-ink">${escUji(label)}</span>
      <span class="alb-uji-switch-track relative w-9 h-5 rounded-full bg-hairline-strong transition-colors shrink-0">
        <span class="alb-uji-switch-knob absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"></span>
      </span>
    </button>`;
}

function paintSwitch(id) {
  const on = document.body.classList.contains(id);
  const $row = $(`[data-uji-switch="${id}"]`);
  $row.find('.alb-uji-switch-track').toggleClass('bg-primary', on).toggleClass('bg-hairline-strong', !on);
  $row.find('.alb-uji-switch-knob').toggleClass('translate-x-4', on);
}

function buildUjiSessionMenu(context) {
  const $header = $('#btn-session-info').closest('header');
  if (!$header.length || $('#alb-uji-session-btn').length) return;

  $header.append(`
    <div class="relative shrink-0" id="alb-uji-session-wrap">
      <button type="button" id="alb-uji-session-btn" title="Menu sesi" class="w-10 h-10 rounded-full bg-surface-card border border-hairline text-ink hover:bg-surface-strong transition-colors flex items-center justify-center">
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
      <div id="alb-uji-session-menu" class="hidden absolute right-0 top-12 z-[9600] w-[230px] bg-surface-card border border-hairline rounded-xl shadow-xl p-2">
        <div class="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-soft">Sesi: <span id="alb-uji-sess-count">0</span>/3</div>
        <button type="button" id="alb-uji-clear-btn" class="w-full text-left px-2 py-1.5 rounded-lg text-[12.5px] text-ink hover:bg-surface-strong flex items-center gap-2 transition-colors">
          <i class="fa-solid fa-broom text-[12px] text-muted"></i> Bersihkan / Hapus sesi
        </button>
        <div class="my-1.5 border-t border-hairline"></div>
        ${switchRow('alb-uji-quota-on', 'Tampilkan bar kuota AI')}
        ${switchRow('alb-uji-adv-on', 'Tampilkan tombol lanjutan')}
      </div>
    </div>
  `);

  const $menu = $('#alb-uji-session-menu');
  $('#alb-uji-session-btn').on('click', (e) => {
    e.stopPropagation();
    $('#alb-uji-sess-count').text($('#chat-count').text() || '0');
    $menu.toggleClass('hidden');
    paintSwitch('alb-uji-quota-on'); paintSwitch('alb-uji-adv-on');
  });
  $(document).on('click.ujiSessMenu', (e) => {
    if (!$(e.target).closest('#alb-uji-session-wrap').length) $menu.addClass('hidden');
  });
  $('#alb-uji-clear-btn').on('click', () => {
    context.ensureDeleteSessionButton?.();
    $('#alb-delete-session-btn').trigger('click');
    $menu.addClass('hidden');
  });
  $menu.on('click', '.alb-uji-switch', function () {
    const id = $(this).attr('data-uji-switch');
    document.body.classList.toggle(id);
    paintSwitch(id);
  });
}

export function applyUjiSimpleUI() {
  const context = _ctx || this;
  ensureUjiSimpleStyle();
  document.body.classList.add('alb-uji-simple');
  // Sidebar tampil lagi kalau task-2 sudah selesai di kunjungan sebelumnya.
  const state = readUjiState(context);
  if (state.panduan_gambar) document.body.classList.add('alb-uji-sidebar-on');
  buildUjiSessionMenu(context);
}

function revealUjiSidebar(context) {
  if (document.body.classList.contains('alb-uji-sidebar-on')) return;
  document.body.classList.add('alb-uji-sidebar-on');
  Toast.show('Sidebar dibuka! Untuk mempermudah, kamu tinggal klik menu di sidebar — tak perlu mengetik sendiri.', 'success');
}

// ============================================================
// [Fase 4] Form SUS in-app → simpan ke DB
// ============================================================
const SUS_ITEMS = [
  'Sistem ini mudah digunakan.',
  'Menggunakan sistem ini terasa membingungkan.',
  'Menu-menu pada sistem mudah dipahami.',
  'Saya perlu bantuan guru atau teman untuk menggunakan sistem ini.',
  'Semua fitur pada sistem berjalan dengan baik.',
  'Cara kerja sistem ini terasa membingungkan.',
  'Saya yakin orang lain juga bisa cepat menggunakan sistem ini.',
  'Saya merasa kesulitan saat menggunakan sistem ini.',
  'Saya percaya diri saat menggunakan sistem ini.',
  'Saya perlu belajar dulu sebelum bisa menggunakan sistem ini.'
];
const SUS_SCALE = ['Sangat tidak setuju', 'Tidak setuju', 'Netral', 'Setuju', 'Sangat setuju'];

function susScore(answers) {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const v = Number(answers[i]);
    sum += (i % 2 === 0) ? (v - 1) : (5 - v);
  }
  return Math.round(sum * 2.5 * 100) / 100;
}

export function openSusForm() {
  const context = _ctx || this;
  if ($('#alb-sus-overlay').length) { $('#alb-sus-overlay').removeClass('hidden'); return; }

  const answers = new Array(10).fill(0);
  const itemsHtml = SUS_ITEMS.map((q, i) => `
    <div class="alb-sus-item rounded-xl border border-hairline bg-white p-3.5" data-i="${i}">
      <div class="text-[13px] font-semibold text-ink leading-snug mb-2.5">${i + 1}. ${escUji(q)}</div>
      <div class="grid grid-cols-5 gap-1.5">
        ${SUS_SCALE.map((lbl, v) => `
          <button type="button" class="alb-sus-opt rounded-lg border border-hairline bg-canvas-soft hover:border-primary/50 px-1 py-2 flex flex-col items-center gap-1 transition-colors" data-i="${i}" data-v="${v + 1}">
            <span class="text-[14px] font-black text-ink">${v + 1}</span>
            <span class="text-[8.5px] leading-tight text-muted-soft text-center">${escUji(lbl)}</span>
          </button>`).join('')}
      </div>
    </div>`).join('');

  $('body').append(`
    <div id="alb-sus-overlay" class="fixed inset-0 z-[9850] bg-slate-950/70 backdrop-blur-sm p-3 md:p-6 overflow-y-auto">
      <div class="bg-surface-card w-full max-w-[560px] mx-auto my-2 rounded-2xl shadow-2xl border border-hairline flex flex-col overflow-hidden">
        <div class="px-5 py-4 border-b border-hairline bg-white shrink-0">
          <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted flex items-center gap-2"><i class="fa-solid fa-star-half-stroke text-primary"></i> Penilaian Akhir</div>
          <div class="text-[16px] font-black text-ink mt-1">Kuesioner Kegunaan (SUS)</div>
          <div class="text-[12px] text-muted-soft mt-1 leading-snug">Terima kasih sudah menyelesaikan semua tugas! Isi 10 pernyataan berikut sesuai pendapatmu. Tak ada jawaban benar/salah.</div>
        </div>
        <div class="p-4 space-y-2.5">${itemsHtml}</div>
        <div class="px-5 py-4 border-t border-hairline bg-canvas-soft shrink-0">
          <div id="alb-sus-progress" class="text-[12px] text-muted-soft text-center mb-2">Terisi 0/10</div>
          <button type="button" id="alb-sus-submit" disabled class="w-full bg-primary text-white rounded-full px-4 py-3 text-[14px] font-bold disabled:opacity-50 disabled:cursor-not-allowed">Kirim Penilaian</button>
        </div>
      </div>
    </div>
  `);

  const $overlay = $('#alb-sus-overlay');
  const updateProgress = () => {
    const filled = answers.filter((a) => a > 0).length;
    $('#alb-sus-progress').text(`Terisi ${filled}/10`);
    $('#alb-sus-submit').prop('disabled', filled < 10);
  };

  $overlay.on('click', '.alb-sus-opt', function () {
    const i = Number($(this).attr('data-i'));
    const v = Number($(this).attr('data-v'));
    answers[i] = v;
    const $item = $(this).closest('.alb-sus-item');
    $item.find('.alb-sus-opt').removeClass('border-primary bg-primary/10 ring-1 ring-primary');
    $(this).addClass('border-primary bg-primary/10 ring-1 ring-primary');
    updateProgress();
  });

  $('#alb-sus-submit').on('click', async function () {
    const score = susScore(answers);
    const id = ujiIdentity(context);
    const meta = context.contextData?.session_meta || {};
    $(this).prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin mr-1"></i> Mengirim…');

    const payload = {
      projectKey: context.projectKey, projectId: context.projectId,
      sessionId: context.sessionId,
      email: id.email, classCode: meta.class_code || '',
      student_name: meta.display_name || '', answers
    };
    const res = await ApiService.post('/student-sessions/sus', payload).catch(() => null);
    if (!res || res.status !== 'success') {
      // Fallback lokal supaya data tak hilang kalau server/tabel belum siap.
      try {
        const key = `alb:${window.location.host}:${context.projectKey}:sus-local`;
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        arr.push({ ...payload, score, at: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(arr));
      } catch (_) {}
    }
    showSusThanks(score);
  });
}

function showSusThanks(score) {
  const band = score >= 80 ? { c: 'text-emerald-600', t: 'Luar biasa!' }
    : score >= 68 ? { c: 'text-primary', t: 'Bagus!' }
    : { c: 'text-amber-600', t: 'Terima kasih!' };
  $('#alb-sus-overlay').html(`
    <div class="bg-surface-card w-full max-w-[420px] mx-auto mt-16 rounded-2xl shadow-2xl border border-hairline p-8 text-center">
      <div class="w-16 h-16 mx-auto bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center text-3xl mb-4"><i class="fa-solid fa-circle-check"></i></div>
      <div class="text-[20px] font-black text-ink">${band.t}</div>
      <div class="text-[13px] text-muted-soft mt-1.5 leading-relaxed">Penilaianmu sudah tersimpan. Terima kasih banyak sudah membantu menguji AI Buddy. 🙏</div>
      <button type="button" id="alb-sus-done" class="mt-6 w-full bg-primary text-white rounded-full px-4 py-3 text-[14px] font-bold">Selesai</button>
    </div>
  `);
  $('#alb-sus-done').on('click', () => $('#alb-sus-overlay').remove());
}

// ============================================================
// [Fase 5] Soft-lock: cegah siswa keluar app sebelum semua task selesai.
// Batas browser: hanya bisa memunculkan dialog konfirmasi bawaan (beforeunload),
// tak bisa mengunci total. Handler membaca state live → berhenti memblokir otomatis
// saat semua task selesai.
// ============================================================
function bindUjiLeaveGuard(context) {
  if (context._ujiLeaveGuardBound) return;
  context._ujiLeaveGuardBound = true;
  window.addEventListener('beforeunload', (e) => {
    const state = readUjiState(context);
    if (doneCount(state) >= UJI_TASKS.length) return; // semua selesai → boleh keluar
    e.preventDefault();
    e.returnValue = ''; // memicu dialog konfirmasi bawaan browser
    return '';
  });
}

// ============================================================
// Orkestrator utama
// ============================================================
export async function startUjiCobaFlow() {
  const context = this;
  _ctx = context;
  try { sessionStorage.setItem('alb_ujicoba', '1'); } catch (_) {}

  // Fase 3: tampilan simpel dari awal (sidebar disembunyikan, menu titik-3, dst).
  applyUjiSimpleUI.call(context);

  // Fase 5: pasang penjaga "jangan keluar sebelum task selesai".
  bindUjiLeaveGuard(context);

  // Fase 0: identitas email → course.
  await openUjiIdentityModal.call(context);
  // Email tervalidasi (task 1) — apapun hasil course, identitas sudah dicoba.
  markUjiCobaTask.call(context, 'validasi_email');

  // Fase 1: tawarkan install PWA (opsional).
  try { await offerPwaInstall.call(context); } catch (_) {}

  // Fase 2: pasang detektor + buka panel tugas.
  bindUjiDetectors(context);
  openUjiTaskModal.call(context);
}
