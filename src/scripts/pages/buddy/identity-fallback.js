// ============================================================
// identity-fallback.js — [v0.9.26 #A] Fallback saat widget diklik di VClass (sudah login)
// tapi NAMA / KONTEKS halaman tak terbaca. Tampilkan form:
//   • Dropdown NAMA dari siswa yang enrolled di course (→ dapat moodle_user_id BENAR).
//   • Dropdown KONTEKS halaman (PAGE_ELEMENTS).
// Memilih nama dari daftar = sumber identitas otoritatif (memperbaiki userId keliru 773→772).
// ============================================================
import $ from 'jquery';
import { ApiService } from '../../fetch/api.js';
import { PAGE_ELEMENTS } from './pageElements.js';

const GUEST_RE = /pengunjung|guest|tamu|visitor/i;

function idfEsc(s = '') {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

function ensureIdfModal() {
  if ($('#alb-idf-overlay').length) return;
  $('body').append(`
    <div id="alb-idf-overlay" class="hidden fixed inset-0 z-[9750] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-surface-card w-full max-w-[440px] rounded-2xl shadow-2xl border border-hairline overflow-hidden">
        <div class="px-5 py-4 border-b border-hairline bg-white">
          <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted flex items-center gap-2"><i class="fa-solid fa-id-card text-primary"></i> Lengkapi data dulu yuk</div>
          <div class="text-[12px] text-muted-soft mt-1 leading-snug">Datamu belum terbaca otomatis dari VClass. Pilih namamu & halaman yang sedang kamu buka supaya jawabanku pas. 😊</div>
        </div>
        <div class="p-5 space-y-4">
          <div id="alb-idf-name-wrap">
            <label class="block text-[12px] font-bold text-muted mb-1.5">Nama kamu (dari daftar kelas)</label>
            <select id="alb-idf-name" class="w-full bg-white border border-hairline rounded-xl px-3 py-2 text-[13px] outline-none focus:border-primary"><option value="">—</option></select>
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
  $('#alb-idf-skip').on('click', () => $('#alb-idf-overlay').addClass('hidden'));
  $('#alb-idf-overlay').on('click', (e) => { if (e.target.id === 'alb-idf-overlay') $('#alb-idf-overlay').addClass('hidden'); });
}

async function idfLoadStudents(context) {
  const $sel = $('#alb-idf-name');
  $sel.html('<option value="">memuat daftar siswa…</option>').prop('disabled', true);
  try {
    const res = await ApiService.get(`/chat/course-students/${context.sessionId}`);
    const data = (res?.status === 'success' && res.data) ? res.data : { students: [] };
    _idfCourseId = data.course_id || null;
    const list = Array.isArray(data.students) ? data.students : [];
    if (!list.length) {
      $sel.html('<option value="">(daftar siswa tak terbaca dari VClass)</option>').prop('disabled', false);
      $('#alb-idf-name-hint').text('Kamu tetap bisa lanjut dengan memilih halaman saja di bawah.').removeClass('hidden');
      return;
    }
    const opts = ['<option value="">— pilih namamu —</option>'].concat(
      list.map((s) => `<option value="${idfEsc(String(s.id))}" data-name="${idfEsc(s.fullname)}" data-email="${idfEsc(s.email || '')}">${idfEsc(s.fullname)}</option>`)
    );
    $sel.html(opts.join('')).prop('disabled', false);
  } catch (e) {
    $sel.html('<option value="">(gagal memuat daftar siswa)</option>').prop('disabled', false);
  }
}

export function openIdentityFallbackModal(opts = {}) {
  const context = this;
  const askName = opts.askName !== false;
  const askContext = opts.askContext !== false;
  ensureIdfModal();

  $('#alb-idf-context').html('<option value="">— pilih halaman —</option>' +
    PAGE_ELEMENTS.map((p) => `<option value="${idfEsc(p.key)}">${idfEsc(p.label)}</option>`).join(''));

  $('#alb-idf-name-wrap').toggleClass('hidden', !askName);
  $('#alb-idf-context-wrap').toggleClass('hidden', !askContext);
  $('#alb-idf-overlay').removeClass('hidden');

  if (askName) idfLoadStudents(context);

  $('#alb-idf-save').off('click').on('click', async () => {
    const $opt = $('#alb-idf-name option:selected');
    const studentId = String($('#alb-idf-name').val() || '');
    const fullname = $opt.attr('data-name') || '';
    const email = $opt.attr('data-email') || '';
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
    context.appendBubble?.('Siap! Datamu sudah aku perbarui. Sekarang tanya apa aja ya 😊', false, 'system');
  });
}
