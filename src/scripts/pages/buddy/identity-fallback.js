// ============================================================
// identity-fallback.js — [v0.9.26 #A] Fallback saat widget diklik di VClass (sudah login)
// tapi NAMA / KONTEKS halaman tak terbaca. Tampilkan form:
//   • Pencari NAMA dari siswa enrolled (→ dapat moodle_user_id BENAR).
//   • Dropdown KONTEKS halaman (PAGE_ELEMENTS).
// Memilih nama dari daftar = sumber identitas otoritatif (memperbaiki userId keliru 773→772).
//
// [#1] Daftar siswa bisa >100 → JANGAN render semua jadi <option> panjang. Pakai
//      combobox: filter kelas + kotak cari + tampil maks 10 + indikator "X dari Y".
// [#3] Loading daftar bisa lambat / timeout → spinner + tombol "Muat ulang".
//      Jika siswa klik "Lewati" → tampilkan ikon edit di header untuk membuka ulang.
// ============================================================
import $ from 'jquery';
import { ApiService } from '../../fetch/api.js';
import { PAGE_ELEMENTS } from './pageElements.js';

const GUEST_RE = /pengunjung|guest|tamu|visitor/i;
const NAME_PAGE_SIZE = 10; // [#1] jumlah nama yang ditampilkan sekaligus
const STUDENTS_TIMEOUT_MS = 12000; // [#3] batas tunggu fetch daftar siswa

function idfEsc(s = '') {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// [#1] Nama siswa VClass selalu diawali kode kelas, mis. "VIII.D Budi" / "8A Citra".
// Ambil token kelas di awal (harus memuat angka atau titik agar tak salah tangkap nama).
function deriveClassCode(fullname = '') {
  const m = String(fullname || '').trim().match(/^([A-Z0-9][A-Z0-9.\-]*)\s+\S/i);
  if (m && /[0-9.]/.test(m[1])) return m[1].toUpperCase();
  return '';
}

function idfMeta(context) {
  return (context.contextData && context.contextData.session_meta) || {};
}
function idfNeedsIdentity(context) {
  const meta = idfMeta(context);
  const name = meta.display_name || sessionStorage.getItem('alb_student_name') || '';
  return !name || GUEST_RE.test(name) || !meta.moodle_user_id;
}
function idfNeedsContext(context) {
  const cd = context.contextData || {};
  return !cd.page_key && !(Array.isArray(cd.elements) && cd.elements.length);
}

// Panggil sekali setelah workspace memuat konteks. Munculkan form bila perlu.
export async function ensureIdentityFallback() {
  const context = this;
  if (!context || context._identityFallbackShown || !context.sessionId) return;
  const askName = idfNeedsIdentity(context);
  const askContext = idfNeedsContext(context);
  if (!askName && !askContext) return;
  context._identityFallbackShown = true;
  openIdentityFallbackModal.call(context, { askName, askContext });
}

let _idfCourseId = null;

function ensureIdfModal(context) {
  if ($('#alb-idf-overlay').length) return;
  $('body').append(`
    <div id="alb-idf-overlay" class="hidden fixed inset-0 z-[9750] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-surface-card w-full max-w-[460px] rounded-2xl shadow-2xl border border-hairline overflow-hidden">
        <div class="px-5 py-4 border-b border-hairline bg-white">
          <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted flex items-center gap-2"><i class="fa-solid fa-id-card text-primary"></i> Lengkapi data dulu yuk</div>
          <div class="text-[12px] text-muted-soft mt-1 leading-snug">Datamu belum terbaca otomatis dari VClass. Pilih namamu & halaman yang sedang kamu buka supaya jawabanku pas. 😊</div>
        </div>
        <div class="p-5 space-y-4">
          <div id="alb-idf-name-wrap">
            <div class="flex items-center justify-between mb-1.5">
              <label class="block text-[12px] font-bold text-muted">Nama kamu (dari daftar kelas)</label>
              <button type="button" id="alb-idf-reload" class="hidden inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-active" title="Muat ulang daftar siswa">
                <i class="fa-solid fa-rotate text-[10px]"></i> Muat ulang
              </button>
            </div>
            <div id="alb-idf-name-tools" class="hidden flex items-center gap-2 mb-2">
              <select id="alb-idf-class-filter" class="bg-white border border-hairline rounded-xl px-2.5 py-2 text-[12px] outline-none focus:border-primary shrink-0 max-w-[42%]">
                <option value="">Semua kelas</option>
              </select>
              <div class="relative flex-1 min-w-0">
                <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-soft"></i>
                <input id="alb-idf-search" type="text" placeholder="Cari namamu…" class="w-full bg-white border border-hairline rounded-xl pl-8 pr-3 py-2 text-[13px] outline-none focus:border-primary" autocomplete="off">
              </div>
            </div>
            <div id="alb-idf-name-state" class="text-[12px] text-muted-soft py-3 text-center">
              <i class="fa-solid fa-spinner fa-spin mr-1"></i> Memuat daftar siswa…
            </div>
            <div id="alb-idf-name-list" class="hidden border border-hairline rounded-xl max-h-56 overflow-y-auto divide-y divide-hairline/60"></div>
            <div id="alb-idf-name-count" class="hidden text-[11px] text-muted-soft mt-1.5"></div>
            <div id="alb-idf-name-hint" class="hidden mt-1.5 text-[11px] text-muted-soft"></div>
          </div>
          <div id="alb-idf-context-wrap">
            <label class="block text-[12px] font-bold text-muted mb-1.5">Halaman yang sedang kamu buka</label>
            <select id="alb-idf-context" class="w-full bg-white border border-hairline rounded-xl px-3 py-2 text-[13px] outline-none focus:border-primary"><option value="">— pilih halaman —</option></select>
          </div>
        </div>
        <div class="px-5 py-4 border-t border-hairline bg-canvas-soft flex justify-between gap-2">
          <button type="button" id="alb-idf-skip" class="px-4 py-2 text-[13px] font-semibold text-muted">Lewati</button>
          <button type="button" id="alb-idf-save" class="bg-primary hover:bg-primary-active text-white rounded-full px-5 py-2 text-[13px] font-bold">Simpan</button>
        </div>
      </div>
    </div>
  `);

  // [#3] Lewati → tutup + munculkan ikon edit di header untuk buka ulang.
  $('#alb-idf-skip').on('click', () => {
    $('#alb-idf-overlay').addClass('hidden');
    showIdentityEditButton(context);
  });
  $('#alb-idf-overlay').on('click', (e) => {
    if (e.target.id === 'alb-idf-overlay') {
      $('#alb-idf-overlay').addClass('hidden');
      showIdentityEditButton(context);
    }
  });

  // [#3] Tombol muat ulang daftar siswa.
  $('#alb-idf-reload').on('click', () => idfLoadStudents(context, { force: true }));

  // [#1] Filter kelas + pencarian → render ulang daftar (tanpa fetch lagi).
  $('#alb-idf-class-filter').on('change', () => renderIdfNameList(context));
  $('#alb-idf-search').on('input', () => renderIdfNameList(context));

  // [#1] Pilih nama dari daftar.
  $('#alb-idf-name-list').on('click', '.alb-idf-name-item', function () {
    const $item = $(this);
    context._idfSelected = {
      id: String($item.attr('data-id') || ''),
      fullname: $item.attr('data-name') || '',
      email: $item.attr('data-email') || ''
    };
    $('#alb-idf-name-list .alb-idf-name-item').removeClass('bg-primary/10 border-l-2 border-primary');
    $item.addClass('bg-primary/10 border-l-2 border-primary');
  });
}

// [#1] Render daftar nama terfilter (maks NAME_PAGE_SIZE) + indikator jumlah.
function renderIdfNameList(context) {
  const all = Array.isArray(context._idfStudents) ? context._idfStudents : [];
  const $list = $('#alb-idf-name-list');
  const $count = $('#alb-idf-name-count');
  if (!all.length) return;

  const cls = String($('#alb-idf-class-filter').val() || '');
  const q = String($('#alb-idf-search').val() || '').trim().toLowerCase();

  const filtered = all.filter((s) => {
    if (cls && s.classCode !== cls) return false;
    if (q && !String(s.fullname).toLowerCase().includes(q)) return false;
    return true;
  });

  const shown = filtered.slice(0, NAME_PAGE_SIZE);
  const selectedId = context._idfSelected?.id || '';

  if (!shown.length) {
    $list.html('<div class="px-3 py-4 text-[12px] text-muted-soft text-center">Tidak ada nama yang cocok. Coba kata kunci lain.</div>').removeClass('hidden');
  } else {
    $list.html(shown.map((s) => {
      const sel = String(s.id) === selectedId ? ' bg-primary/10 border-l-2 border-primary' : '';
      return `<button type="button" class="alb-idf-name-item w-full text-left px-3 py-2.5 hover:bg-primary/5 flex items-center gap-2 bg-transparent border-0 cursor-pointer${sel}" data-id="${idfEsc(String(s.id))}" data-name="${idfEsc(s.fullname)}" data-email="${idfEsc(s.email || '')}">
        <i class="fa-solid fa-user text-[11px] text-muted-soft shrink-0"></i>
        <span class="text-[13px] text-ink truncate">${idfEsc(s.fullname)}</span>
      </button>`;
    }).join('')).removeClass('hidden');
  }

  const more = filtered.length - shown.length;
  let countText = `Menampilkan ${shown.length} dari ${filtered.length} siswa`;
  if (all.length !== filtered.length) countText += ` (total ${all.length})`;
  if (more > 0) countText += ` — ketik nama untuk mempersempit (${more} lainnya).`;
  $count.text(countText).removeClass('hidden');
}

async function idfLoadStudents(context, opts = {}) {
  const $state = $('#alb-idf-name-state');
  const $list = $('#alb-idf-name-list');
  const $tools = $('#alb-idf-name-tools');
  const $count = $('#alb-idf-name-count');
  const $reload = $('#alb-idf-reload');

  // Reset tampilan ke kondisi loading.
  $list.addClass('hidden').empty();
  $count.addClass('hidden');
  $tools.addClass('hidden');
  $reload.addClass('hidden');
  $('#alb-idf-name-hint').addClass('hidden');
  $state.removeClass('hidden text-rose-600').html('<i class="fa-solid fa-spinner fa-spin mr-1"></i> Memuat daftar siswa…');

  try {
    // [#3] Pakai timeout supaya tak menggantung lama; deteksi res.timeout dari ApiService.
    const res = await ApiService.fetch(`/chat/course-students/${context.sessionId}`, {
      method: 'GET', timeoutMs: STUDENTS_TIMEOUT_MS
    });

    if (res?.timeout || res?.status !== 'success') {
      const msg = res?.timeout
        ? 'Daftar siswa lama dimuat (server/VClass sedang sibuk).'
        : 'Gagal memuat daftar siswa dari VClass.';
      $state.removeClass('hidden').addClass('text-rose-600').html(`<i class="fa-solid fa-triangle-exclamation mr-1"></i> ${idfEsc(msg)}`);
      $reload.removeClass('hidden');
      return;
    }

    const data = res.data || { students: [] };
    _idfCourseId = data.course_id || null;
    const list = Array.isArray(data.students) ? data.students : [];

    if (!list.length) {
      $state.removeClass('hidden').html('Daftar siswa tak terbaca dari VClass.');
      $reload.removeClass('hidden');
      $('#alb-idf-name-hint').text('Kamu tetap bisa lanjut dengan memilih halaman saja di bawah.').removeClass('hidden');
      return;
    }

    // Simpan + lengkapi kode kelas tiap siswa.
    context._idfStudents = list.map((s) => ({
      id: s.id,
      fullname: s.fullname || ('Siswa ' + s.id),
      email: s.email || '',
      classCode: deriveClassCode(s.fullname)
    }));

    // Bangun opsi filter kelas (unik, terurut).
    const classes = Array.from(new Set(context._idfStudents.map((s) => s.classCode).filter(Boolean))).sort();
    const $cf = $('#alb-idf-class-filter');
    $cf.html('<option value="">Semua kelas</option>' + classes.map((c) => `<option value="${idfEsc(c)}">${idfEsc(c)}</option>`).join(''));
    $('#alb-idf-search').val('');
    context._idfSelected = null;

    // Tampilkan toolbar hanya bila banyak (>10) atau ada beberapa kelas.
    if (context._idfStudents.length > NAME_PAGE_SIZE || classes.length > 1) {
      $tools.removeClass('hidden');
    } else {
      $tools.addClass('hidden');
    }

    $state.addClass('hidden');
    $reload.removeClass('hidden');
    renderIdfNameList(context);
  } catch (e) {
    $state.removeClass('hidden').addClass('text-rose-600').html('<i class="fa-solid fa-triangle-exclamation mr-1"></i> Gagal memuat daftar siswa.');
    $reload.removeClass('hidden');
  }
}

export function openIdentityFallbackModal(opts = {}) {
  const context = this;
  const askName = opts.askName !== false;
  const askContext = opts.askContext !== false;
  ensureIdfModal(context);

  $('#alb-idf-context').html('<option value="">— pilih halaman —</option>' +
    PAGE_ELEMENTS.map((p) => `<option value="${idfEsc(p.key)}">${idfEsc(p.label)}</option>`).join(''));

  $('#alb-idf-name-wrap').toggleClass('hidden', !askName);
  $('#alb-idf-context-wrap').toggleClass('hidden', !askContext);
  $('#alb-idf-overlay').removeClass('hidden');

  if (askName) idfLoadStudents(context);

  $('#alb-idf-save').off('click').on('click', async () => {
    const selected = context._idfSelected || null;
    const studentId = selected ? String(selected.id || '') : '';
    const fullname = selected ? selected.fullname || '' : '';
    const email = selected ? selected.email || '' : '';
    const ctxKey = String($('#alb-idf-context').val() || '');

    $('#alb-idf-save').prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i>');

    // 1) Simpan identitas (kalau nama dipilih).
    if (askName && studentId && fullname) {
      try {
        await ApiService.post(`/chat/session/${context.sessionId}/identify`, {
          moodle_user_id: studentId, display_name: fullname, email,
          course_id: _idfCourseId || undefined
        });
        // Sinkronkan ke contextData lokal + header.
        context.contextData = context.contextData || {};
        context.contextData.session_meta = { ...(context.contextData.session_meta || {}), moodle_user_id: studentId, display_name: fullname, email };
        try { sessionStorage.setItem('alb_student_name', fullname); } catch (_) {}
        context.updateConnectedCourseHeader?.();
      } catch (e) { /* lanjut walau gagal */ }
    }

    // 2) Pasang konteks halaman (kalau dipilih).
    if (askContext && ctxKey) {
      try { await context.applyPageElements?.(ctxKey); } catch (_) {}
    }

    $('#alb-idf-overlay').addClass('hidden');
    $('#alb-idf-save').prop('disabled', false).text('Simpan');
    // Identitas sudah dilengkapi → ikon edit tetap tersedia bila ingin ubah lagi.
    showIdentityEditButton(context);
    context.appendBubble?.('Siap! Datamu sudah aku perbarui. Sekarang tanya apa aja ya 😊', false, 'system');
  });
}

// [#3] Tampilkan ikon edit (pensil) di header samping nama → buka ulang modal pilih nama.
export function showIdentityEditButton(context) {
  const ctx = context || this;
  const $btn = $('#btn-edit-identity');
  if (!$btn.length) return;
  $btn.removeClass('hidden').off('click').on('click', () => {
    openIdentityFallbackModal.call(ctx, { askName: true, askContext: true });
  });
}
