// ============================================================
// student-notes.js — Fitur "Catatan Siswa" (menu di tab panduan + modal CRUD).
// [v0.9.7] Diekstrak dari events.js. Hanya `ensureStudentNotesMenu` dipakai dari luar
// (dipanggil saat bind sidebar tabs). Sisanya internal modul ini.
// ============================================================
import $ from 'jquery';
import Toast from '../../components/toast.js';
import { ApiService } from '../../fetch/api.js';
import { openVideoTutorialModal } from './static-tutorial.js';

// [v0.9.14] URL video tutorial "cara pakai AI Buddy". Isi dgn link YouTube/mp4.
// Tombolnya ada di modal To-do (Tugas Wajib). Kosong = tombol tetap ada tapi
// memberi tahu video belum tersedia.
export const AI_TUTORIAL_VIDEO_URL = '/VIDEOS/tutorial.mp4';

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Pembaca identitas siswa aktif (di-inline agar modul ini mandiri, tanpa import silang).
function readActiveStudentIdentity(context) {
  try {
    const host = window.location.host || 'localhost';
    const projectKey = context?.projectKey || context?.project_key || 'default-project';
    const raw = localStorage.getItem(`alb:${host}:${projectKey}:active-student`);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
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

export function ensureStudentNotesMenu(context) {
  const $guide = context.$tabContentGuide?.length ? context.$tabContentGuide : $('#tab-content-guide');
  if (!$guide.length || $guide.find('[data-alb-notes-menu="1"]').length) return;

  $guide.append(`
    <div data-alb-notes-menu="1" class="mt-5 pt-4 border-t border-hairline space-y-3">
      <div class="px-1">
        <div class="text-[10px] font-black uppercase tracking-[0.12em] text-muted flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-primary/60"></span>Menu Catatan &amp; Tugas</div>
        <div class="text-[11px] text-muted-soft mt-0.5 leading-snug">Catatan pribadi & daftar tugas saat memakai AI.</div>
      </div>
      <div class="space-y-2.5">
        <button type="button" id="alb-note-add-btn" class="w-full text-left bg-white hover:bg-canvas-soft border border-hairline rounded-xl px-3 py-3 flex items-center gap-3 transition-colors"><i class="fa-solid fa-note-sticky text-amber-500"></i><span><b class="block text-[13px] text-ink">Catatan Saya</b><small class="text-[11px] text-muted-soft">Tambah & kelola pengingat singkat</small></span></button>
        <button type="button" id="alb-todo-btn" class="w-full text-left bg-white hover:bg-canvas-soft border border-hairline rounded-xl px-3 py-3 flex items-center gap-3 transition-colors"><i class="fa-solid fa-list-check text-primary"></i><span class="flex-1"><b class="block text-[13px] text-ink">Tugas Wajib (To-do)</b><small class="text-[11px] text-muted-soft">Checklist yang harus kamu lakukan</small></span><span id="alb-todo-badge" class="hidden shrink-0 text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5"></span></button>
      </div>
    </div>
  `);

  // [v0.9.41] Animasi PULSE pada tombol Tugas Wajib agar menarik perhatian saat sidebar
  // dibuka. Berhenti setelah siswa membukanya sekali (flag localStorage) supaya tak mengganggu.
  if (!$('#alb-todo-pulse-style').length) {
    $('head').append(`<style id="alb-todo-pulse-style">
      @keyframes albTodoPulse {
        0% { box-shadow: 0 0 0 0 rgba(41,37,36,0.30); }
        70% { box-shadow: 0 0 0 9px rgba(41,37,36,0); }
        100% { box-shadow: 0 0 0 0 rgba(41,37,36,0); }
      }
      .alb-todo-pulse { animation: albTodoPulse 1.8s ease-out infinite; }
    </style>`);
  }
  const todoSeen = (() => { try { return localStorage.getItem('alb_todo_pulse_seen') === '1'; } catch (_) { return false; } })();
  if (!todoSeen) {
    $('#alb-todo-btn').addClass('alb-todo-pulse border-primary/50 bg-primary/5');
  }
  const stopTodoPulse = () => {
    try { localStorage.setItem('alb_todo_pulse_seen', '1'); } catch (_) {}
    $('#alb-todo-btn').removeClass('alb-todo-pulse border-primary/50 bg-primary/5');
  };

  $('#alb-note-add-btn').on('click', () => openStudentNotesModal(context, 'add'));
  $('#alb-todo-btn').on('click', () => { stopTodoPulse(); openTodoListModal(context); });
  refreshTodoBadge(context);
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

// ============================================================
// [v0.9.8] To-do list tugas wajib saat uji coba AI. Setelah semua tercentang,
// muncul tombol untuk mengisi formulir feedback (Google Form).
// ============================================================
const TODO_FEEDBACK_URL = 'https://forms.gle/X3z2sqyzqicTa1ns7';

const TODO_TASKS = [
  { id: 'tanya_materi', text: 'Bertanya tentang salah satu materi pelajaran ke AI Buddy' },
  { id: 'mention_materi', text: 'Mencoba fitur "@" materi (rangkum / poin penting / buat soal)' },
  { id: 'mode_ai', text: 'Mencoba mode jawaban AI (Singkat atau Detail)' },
  { id: 'elemen_halaman', text: 'Klik salah satu elemen halaman di sidebar lalu menanyakannya' },
  { id: 'ganti_konteks', text: 'Mencoba tombol "Ganti" untuk pindah konteks halaman' },
  { id: 'baca_jawaban', text: 'Membaca atau menyalin jawaban dari AI' }
];

function getTodoStorageKey(context) {
  const identity = getNotesIdentity(context);
  return `alb:${window.location.host}:${identity.projectKey || identity.projectId || 'project'}:todo:${identity.student_email || identity.sessionId || 'anon'}`;
}

function readTodoState(context) {
  try { return JSON.parse(localStorage.getItem(getTodoStorageKey(context)) || '{}') || {}; } catch (_) { return {}; }
}

function writeTodoState(context, state) {
  localStorage.setItem(getTodoStorageKey(context), JSON.stringify(state || {}));
}

export function refreshTodoBadge(context) {
  const state = readTodoState(context);
  const done = TODO_TASKS.filter((t) => state[t.id]).length;
  const $badge = $('#alb-todo-badge');
  if (!$badge.length) return;
  if (done >= TODO_TASKS.length) {
    $badge.removeClass('hidden bg-primary/10 text-primary border-primary/20').addClass('bg-emerald-50 text-emerald-700 border border-emerald-200').text('Selesai ✓');
  } else if (done > 0) {
    $badge.removeClass('hidden bg-emerald-50 text-emerald-700').addClass('bg-primary/10 text-primary border border-primary/20').text(`${done}/${TODO_TASKS.length}`);
  } else {
    $badge.addClass('hidden');
  }
}

function ensureTodoListModal() {
  if ($('#alb-todo-modal').length) return;
  $('body').append(`
    <div id="alb-todo-modal" class="hidden fixed inset-0 z-[9700] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-surface-card w-full max-w-[480px] max-h-[86vh] rounded-2xl shadow-2xl border border-hairline flex flex-col overflow-hidden">
        <div class="px-5 py-4 border-b border-hairline bg-white flex items-start justify-between gap-3 shrink-0">
          <div class="min-w-0">
            <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted flex items-center gap-2"><i class="fa-solid fa-list-check text-[11px] text-primary"></i> Tugas Wajib Uji Coba</div>
            <div class="text-[12px] text-muted-soft mt-1 leading-snug">Centang tiap langkah yang sudah kamu coba. Setelah semua tercentang, kamu akan diminta mengisi formulir singkat.</div>
          </div>
          <button type="button" id="alb-todo-close" class="w-9 h-9 rounded-full bg-surface-strong border border-hairline text-ink hover:bg-hairline shrink-0"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="px-5 pt-4 shrink-0">
          <button type="button" id="alb-todo-watch-video" class="w-full inline-flex items-center justify-center gap-2 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 rounded-full px-4 py-2.5 text-[13px] font-bold transition-colors mb-4">
            <i class="fa-solid fa-circle-play"></i> Tonton Video Cara Pakai AI Buddy
          </button>
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <span class="text-[12px] font-semibold text-ink">Progress</span>
            <span id="alb-todo-count" class="text-[12px] font-bold text-primary">0/${TODO_TASKS.length}</span>
          </div>
          <div class="h-2 w-full bg-hairline rounded-full overflow-hidden">
            <div id="alb-todo-bar" class="h-full bg-primary rounded-full transition-all duration-300" style="width:0%"></div>
          </div>
        </div>

        <div id="alb-todo-list" class="p-4 overflow-y-auto flex-1 space-y-2"></div>

        <div id="alb-todo-footer" class="px-5 py-4 border-t border-hairline bg-canvas-soft shrink-0">
          <div id="alb-todo-locked" class="text-[12px] text-muted-soft text-center leading-snug">
            <i class="fa-solid fa-lock mr-1"></i> Selesaikan semua langkah di atas untuk membuka formulir feedback.
          </div>
          <a id="alb-todo-form-link" href="${TODO_FEEDBACK_URL}" target="_blank" rel="noopener noreferrer" class="hidden items-center justify-center gap-2 w-full bg-primary hover:bg-primary-active text-white rounded-full px-4 py-3 text-[14px] font-bold transition-colors">
            <i class="fa-solid fa-pen-to-square"></i> Isi Formulir Feedback Sekarang
          </a>
        </div>
      </div>
    </div>
  `);
  $('#alb-todo-close').on('click', () => $('#alb-todo-modal').addClass('hidden'));
  $('#alb-todo-modal').on('click', (e) => { if (e.target.id === 'alb-todo-modal') $('#alb-todo-modal').addClass('hidden'); });
  // [v0.9.14] Tombol video tutorial cara pakai → modal video autoplay.
  $('#alb-todo-watch-video').on('click', () => openVideoTutorialModal({ url: AI_TUTORIAL_VIDEO_URL, title: 'Cara Pakai AI Buddy', autoplay: true }));
}

function openTodoListModal(context) {
  ensureTodoListModal();
  $('#alb-todo-modal').removeClass('hidden');

  const render = () => {
    const state = readTodoState(context);
    const done = TODO_TASKS.filter((t) => state[t.id]).length;
    const pct = Math.round((done / TODO_TASKS.length) * 100);

    $('#alb-todo-count').text(`${done}/${TODO_TASKS.length}`);
    $('#alb-todo-bar').css('width', `${pct}%`);

    $('#alb-todo-list').html(TODO_TASKS.map((t) => {
      const checked = !!state[t.id];
      return `
        <button type="button" class="alb-todo-item w-full text-left rounded-xl border ${checked ? 'border-emerald-200 bg-emerald-50' : 'border-hairline bg-white hover:bg-canvas-soft'} px-3.5 py-3 flex items-start gap-3 transition-colors" data-id="${t.id}">
          <span class="shrink-0 w-5 h-5 mt-0.5 rounded-md border flex items-center justify-center ${checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-hairline-strong text-transparent'}">
            <i class="fa-solid fa-check text-[11px]"></i>
          </span>
          <span class="text-[13px] leading-snug ${checked ? 'text-emerald-800 line-through' : 'text-ink'}">${escapeHtml(t.text)}</span>
        </button>`;
    }).join(''));

    const allDone = done >= TODO_TASKS.length;
    $('#alb-todo-locked').toggleClass('hidden', allDone);
    $('#alb-todo-form-link').toggleClass('hidden', !allDone).toggleClass('flex', allDone);
    refreshTodoBadge(context);
  };

  $('#alb-todo-list').off('click', '.alb-todo-item').on('click', '.alb-todo-item', function () {
    const id = $(this).attr('data-id');
    const state = readTodoState(context);
    state[id] = !state[id];
    writeTodoState(context, state);
    render();
  });

  render();
}
