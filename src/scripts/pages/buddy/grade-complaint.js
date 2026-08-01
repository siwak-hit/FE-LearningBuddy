// grade-complaint.js — [v0.9.67] Modal komplain NILAI: pilih tugas/kuis → cek nilai → konfirmasi
// "kurang sesuai?" → Iya (hubungi guru) / Tidak (selesai).
import $ from 'jquery';
import { ApiService } from '../../fetch/api.js';
import { fetchSessionActivities } from './utils.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function ensureGradeModal() {
  if ($('#alb-grade-modal').length) return;
  $('body').append(`
    <div id="alb-grade-modal" class="hidden fixed inset-0 z-[9700] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-surface-card w-full max-w-[440px] max-h-[88vh] rounded-2xl shadow-2xl border border-hairline flex flex-col overflow-hidden">
        <div class="px-5 py-4 border-b border-hairline flex items-start justify-between gap-3 shrink-0">
          <div class="min-w-0">
            <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted flex items-center gap-2"><i class="fa-solid fa-chart-simple text-[11px] text-primary"></i> Cek Nilai &amp; Komplain</div>
            <div id="alb-grade-sub" class="text-[12px] text-muted-soft mt-1 leading-snug truncate">Pilih tugas/kuis yang nilainya ingin kamu tanyakan.</div>
          </div>
          <button type="button" id="alb-grade-close" class="w-9 h-9 rounded-full bg-surface-strong border border-hairline text-ink hover:bg-hairline shrink-0"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="alb-grade-body" class="p-5 overflow-y-auto"></div>
      </div>
    </div>
  `);
  const close = () => $('#alb-grade-modal').addClass('hidden');
  $('#alb-grade-close').on('click', close);
  $('#alb-grade-modal').on('click', (e) => { if (e.target.id === 'alb-grade-modal') close(); });
}

export function openGradeComplaintModal(context) {
  ensureGradeModal();
  $('#alb-grade-modal').removeClass('hidden');
  const $body = $('#alb-grade-body');
  $('#alb-grade-sub').text('Pilih tugas/kuis yang nilainya ingin kamu tanyakan.');
  $body.html('<div class="flex items-center gap-2 text-[13px] text-muted py-6 justify-center"><i class="fa-solid fa-spinner fa-spin text-primary"></i> Memuat daftar dari VClass…</div>');

  // [v0.9.68] Daftar aktivitas dari cache bersama (dipakai juga modal Komplain) —
  // balik ke "pilih item lain" tidak menembak API lagi.
  fetchSessionActivities(context.sessionId).then((data) => {
    const items = []
      .concat((data.Tugas || []).filter((a) => !a.locked).map((a) => ({ ...a, type: 'Tugas' })))
      .concat((data.Kuis || []).filter((a) => !a.locked).map((a) => ({ ...a, type: 'Kuis' })));
    if (!items.length) {
      $body.html('<div class="text-[13px] text-muted-soft py-6 text-center">Belum ada tugas/kuis yang bisa dipilih dari VClass. Coba buka halaman course-mu dulu ya.</div>');
      return;
    }
    const rows = items.map((it) => `
      <button type="button" class="alb-grade-item w-full flex items-center gap-3 bg-surface-card border border-hairline rounded-xl px-3 py-2.5 text-left hover:border-primary/50 transition-colors mb-2" data-type="${esc(it.type)}" data-title="${esc(it.title)}">
        <span class="w-8 h-8 rounded-lg bg-ink text-white flex items-center justify-center shrink-0"><i class="fa-solid ${it.type === 'Kuis' ? 'fa-clipboard-question' : 'fa-file-signature'} text-[13px]"></i></span>
        <span class="flex-1 min-w-0"><span class="block text-[13px] font-semibold text-ink truncate">${esc(it.title)}</span><span class="block text-[11px] text-muted-soft">${esc(it.type)}${it.completed ? ' · ✓ selesai' : ''}</span></span>
        <i class="fa-solid fa-chevron-right text-muted-soft text-[11px] shrink-0"></i>
      </button>`).join('');
    $body.html(rows);
    $body.find('.alb-grade-item').on('click', function () {
      showGrade(context, String($(this).data('type')), String($(this).data('title')));
    });
  }).catch(() => {
    $body.html('<div class="text-[13px] text-red-600 py-6 text-center">Gagal memuat daftar dari VClass. Coba lagi ya.</div>');
  });
}

function showGrade(context, type, title) {
  const $body = $('#alb-grade-body');
  $('#alb-grade-sub').text(title);
  $body.html('<div class="flex items-center gap-2 text-[13px] text-muted py-6 justify-center"><i class="fa-solid fa-spinner fa-spin text-primary"></i> Mengecek nilai dari VClass…</div>');

  ApiService.get(`/chat/item-grade/${context.sessionId}?type=${encodeURIComponent(type)}&title=${encodeURIComponent(title)}`).then((res) => {
    const d = (res?.status === 'success' && res.data) ? res.data : {};
    const closeAndSay = (msg, actions = []) => {
      $('#alb-grade-modal').addClass('hidden');
      context.appendBubble?.(msg, false, 'system', actions, { noFeedbackLock: true });
      context.scrollToBottom?.();
    };

    if (d.graded && d.grade != null) {
      const maxTxt = d.maxgrade ? ` <span class="text-[16px] text-muted-soft font-bold">dari ${esc(d.maxgrade)}</span>` : '';
      const percentTxt = d.percent ? `<div class="text-[12px] text-muted-soft -mt-1 mb-3">(${esc(d.percent)})</div>` : '';
      const feedbackTxt = d.feedback
        ? `<div class="text-left text-[12px] text-ink bg-surface-strong border border-hairline rounded-xl px-3 py-2 mb-4"><b class="block text-[11px] uppercase tracking-wide text-muted mb-1">Catatan guru</b>${esc(d.feedback)}</div>`
        : '';
      $body.html(`
        <div class="text-center py-2">
          <div class="text-[13px] text-muted mb-1">Berdasarkan hasil pengerjaanmu untuk <b class="text-ink">${esc(d.title || title)}</b>, kamu mendapat nilai:</div>
          <div class="text-[42px] font-black text-ink leading-none my-3">${esc(d.grade)}${maxTxt}</div>
          ${percentTxt}${feedbackTxt}
          <div class="text-[13px] text-ink font-semibold mb-4">Apakah menurutmu nilai itu <b>kurang sesuai</b> dengan usahamu?</div>
          <div class="flex flex-col gap-2">
            <button type="button" id="alb-grade-yes" class="w-full bg-ink text-white rounded-xl py-2.5 text-[13px] font-semibold hover:opacity-90 transition-opacity">Iya, mau kutanyakan ke guru</button>
            <button type="button" id="alb-grade-no" class="w-full bg-white text-ink border border-hairline-strong rounded-xl py-2.5 text-[13px] font-semibold hover:bg-surface-strong transition-colors">Tidak, sudah sesuai kok</button>
          </div>
        </div>`);
      $body.find('#alb-grade-yes').on('click', () => closeAndSay(`Baik, aku bantu kamu hubungi guru soal nilai **${title}** ya. Klik tombol di bawah 👇`.replace(/\*\*(.+?)\*\*/g, '$1'), [{ type: 'wa_teacher', label: 'Hubungi Guru (WhatsApp)' }]));
      $body.find('#alb-grade-no').on('click', () => closeAndSay('Oke, kalau nilaimu sudah sesuai berarti aman ya. Semangat terus belajarnya! 😊'));
    } else {
      // Status pengajuan tugas (dari mod_assign_get_submission_status) → info yang berguna
      // walau nilainya belum keluar ("Belum dinilai" tetap ada info "sudah terkirim").
      const statusLine = () => {
        if (d.submitted || d.submission_status === 'submitted' || d.submission_status === 'reopened') {
          return 'Tugasmu <b class="text-ink">sudah terkirim &amp; siap dinilai</b>, tapi <b class="text-ink">belum dinilai</b> guru — jadi nilainya belum keluar.';
        }
        if (d.submission_status === 'draft') {
          return 'Tugas ini masih berstatus <b class="text-ink">Draf</b> (belum kamu tekan <b>Kirim</b>), jadi belum ada yang bisa dinilai.';
        }
        if (d.reason === 'not_submitted') {
          return 'Tugas ini <b class="text-ink">belum kamu kumpulkan</b>, jadi nilainya belum ada.';
        }
        return 'Sepertinya tugas/kuis itu <b class="text-ink">belum dinilai</b> guru, jadi nilainya belum keluar.';
      };
      const msg = d.reason === 'not_found'
        ? 'Aku belum menemukan item itu di daftar nilai VClass. Coba pilih yang lain ya.'
        : d.reason === 'no_context'
          ? 'Akun/kelas Moodle-mu belum terbaca, jadi nilainya belum bisa aku ambil. Coba buka AI Buddy dari dalam VClass ya.'
          : d.reason === 'error'
            ? 'Aku gagal membaca daftar nilai dari VClass (kemungkinan izin sistem). Untuk hal ini paling tepat tanya gurumu ya.'
            : statusLine();
      const feedbackBox = d.feedback
        ? `<div class="text-left text-[12px] text-ink bg-surface-strong border border-hairline rounded-xl px-3 py-2 mb-4"><b class="block text-[11px] uppercase tracking-wide text-muted mb-1">Catatan guru</b>${esc(d.feedback)}</div>`
        : '';
      $body.html(`
        <div class="text-center py-2">
          <div class="text-[13px] text-muted mb-4">${msg}</div>
          ${feedbackBox}
          <div class="flex flex-col gap-2">
            <button type="button" id="alb-grade-yes" class="w-full bg-ink text-white rounded-xl py-2.5 text-[13px] font-semibold hover:opacity-90 transition-opacity">Tetap mau tanya ke guru</button>
            <button type="button" id="alb-grade-back" class="w-full bg-white text-ink border border-hairline-strong rounded-xl py-2.5 text-[13px] font-semibold hover:bg-surface-strong transition-colors">Pilih item lain</button>
          </div>
        </div>`);
      $body.find('#alb-grade-yes').on('click', () => closeAndSay(`Baik, aku bantu kamu hubungi guru soal ${title} ya. Klik tombol di bawah 👇`, [{ type: 'wa_teacher', label: 'Hubungi Guru (WhatsApp)' }]));
      $body.find('#alb-grade-back').on('click', () => openGradeComplaintModal(context));
    }
  }).catch(() => {
    $body.html('<div class="text-[13px] text-red-600 py-6 text-center">Gagal mengambil nilai. Coba lagi ya.</div>');
  });
}
