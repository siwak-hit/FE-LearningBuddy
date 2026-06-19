// ============================================================
// reminder-toast.js — [v0.9.27 #1] Pengingat/notice TIDAK lagi jadi kartu inline di chat,
// melainkan TOAST kecil yang bisa diklik → buka MODAL berisi detail + tombol aksi.
// Toast auto-hilang setelah agak lama; klik tombol ✕ untuk menutup lebih cepat.
// ============================================================
import $ from 'jquery';
import { ApiService } from '../../fetch/api.js';
import Toast from '../../components/toast.js';

const RT_VARIANTS = {
  reminder: { wrap: 'border-amber-200 bg-amber-50', chip: 'bg-amber-200/70 text-amber-900', icon: 'fa-lightbulb', label: 'Pengingat' },
  context: { wrap: 'border-primary/20 bg-primary/5', chip: 'bg-primary/15 text-primary', icon: 'fa-right-left', label: 'Konteks dialihkan' }
};
const RT_AUTO_MS = 14000;

function rtHost() {
  if (!$('#alb-reminder-toast-host').length) {
    $('body').append('<div id="alb-reminder-toast-host" class="fixed z-[9600] bottom-24 right-4 md:right-6 flex flex-col gap-2 items-end pointer-events-none"></div>');
  }
  return $('#alb-reminder-toast-host');
}

export function showReminderToast(payload = {}) {
  const context = this;
  const variant = payload.notice === 'context' ? 'context' : 'reminder';
  const cfg = RT_VARIANTS[variant];
  const message = String(payload.message ?? '');
  const actions = Array.isArray(payload.actions) ? payload.actions : [];

  const preview = message.replace(/\*\*/g, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const shortPreview = preview.slice(0, 72);

  const $toast = $(`
    <div class="alb-reminder-toast pointer-events-auto cursor-pointer w-[300px] max-w-[88vw] border ${cfg.wrap} rounded-2xl shadow-xl p-3 pr-9 relative">
      <button type="button" class="rt-close absolute top-2 right-2 w-6 h-6 rounded-full text-muted hover:text-ink hover:bg-black/5 flex items-center justify-center"><i class="fa-solid fa-xmark text-[11px]"></i></button>
      <div class="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.1em] ${cfg.chip} rounded-full px-2 py-0.5 mb-1.5"><i class="fa-solid ${cfg.icon} text-[9px]"></i> ${cfg.label}</div>
      <div class="text-[12.5px] text-ink leading-snug">${context.escapeHtml ? context.escapeHtml(shortPreview) : shortPreview}${preview.length > 72 ? '…' : ''}</div>
      <div class="text-[10px] text-muted-soft mt-1.5 inline-flex items-center gap-1"><i class="fa-solid fa-hand-pointer text-[9px]"></i> Ketuk untuk lihat & pilih</div>
    </div>`);

  rtHost().append($toast);
  $toast.data('rtPayload', { variant, message, actions });

  const timer = setTimeout(() => { $toast.fadeOut(250, () => $toast.remove()); }, RT_AUTO_MS);
  $toast.find('.rt-close').on('click', (e) => { e.stopPropagation(); clearTimeout(timer); $toast.remove(); });
  $toast.on('click', () => { clearTimeout(timer); $toast.remove(); openReminderModal.call(context, { variant, message, actions }); });
}

// [v0.9.28 #6] Saat input DIKUNCI (menunggu konfirmasi) lalu user mencoba mengetik/klik,
// tampilkan TOAST yang bisa diklik → buka MODAL berisi placeholder mirip respons terakhir +
// arahan untuk klik tombol konfirmasi.
export function showInputLockedToast() {
  const context = this;
  if ($('#alb-input-locked-toast').length) return; // jangan tumpuk
  rtHost();
  const $toast = $(`
    <div id="alb-input-locked-toast" class="alb-reminder-toast pointer-events-auto cursor-pointer w-[300px] max-w-[88vw] border border-amber-200 bg-amber-50 rounded-2xl shadow-xl p-3 pr-9 relative">
      <button type="button" class="rt-close absolute top-2 right-2 w-6 h-6 rounded-full text-muted hover:text-ink hover:bg-black/5 flex items-center justify-center"><i class="fa-solid fa-xmark text-[11px]"></i></button>
      <div class="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.1em] bg-amber-200/70 text-amber-900 rounded-full px-2 py-0.5 mb-1.5"><i class="fa-solid fa-lock text-[9px]"></i> Input terkunci</div>
      <div class="text-[12.5px] text-ink leading-snug">Pilih dulu konfirmasi pada respons terakhir ya.</div>
      <div class="text-[10px] text-muted-soft mt-1.5 inline-flex items-center gap-1"><i class="fa-solid fa-hand-pointer text-[9px]"></i> Ketuk untuk lihat caranya</div>
    </div>`);
  rtHost().append($toast);
  const timer = setTimeout(() => { $toast.fadeOut(250, () => $toast.remove()); }, 9000);
  $toast.find('.rt-close').on('click', (e) => { e.stopPropagation(); clearTimeout(timer); $toast.remove(); });
  $toast.on('click', () => { clearTimeout(timer); $toast.remove(); openInputLockedModal.call(context); });
}

function ensureInputLockedModal() {
  if ($('#alb-ilm-overlay').length) return;
  $('body').append(`
    <div id="alb-ilm-overlay" class="hidden fixed inset-0 z-[9650] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-surface-card w-full max-w-[480px] rounded-2xl shadow-2xl border border-hairline overflow-hidden">
        <div class="px-5 py-4 border-b border-hairline bg-white flex items-start justify-between gap-3">
          <span class="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] rounded-full px-2.5 py-1 bg-amber-200/70 text-amber-900"><i class="fa-solid fa-lock"></i> Tunggu sebentar</span>
          <button type="button" id="alb-ilm-close" class="w-8 h-8 rounded-full text-muted hover:text-ink hover:bg-black/5 flex items-center justify-center shrink-0"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="p-5">
          <div class="text-[13px] text-ink leading-relaxed mb-3">Sebelum lanjut bertanya, pilih dulu salah satu tombol dari respons terakhir ini: klik <b>"Sudah jelas"</b> kalau sudah paham, atau <b>"Tanya AI"</b> kalau mau penjelasan lebih lanjut. 👇</div>
          <div id="alb-ilm-mirror" class="border border-hairline rounded-2xl p-3 bg-surface-strong/30"></div>
        </div>
      </div>
    </div>`);
  $('#alb-ilm-close').on('click', () => $('#alb-ilm-overlay').addClass('hidden'));
  $('#alb-ilm-overlay').on('click', (e) => { if (e.target.id === 'alb-ilm-overlay') $('#alb-ilm-overlay').addClass('hidden'); });
}

export function openInputLockedModal() {
  const context = this;
  ensureInputLockedModal();
  const close = () => $('#alb-ilm-overlay').addClass('hidden');

  const $wrap = context.$chatArea?.find('.alb-system-message-wrap[data-waiting-feedback="1"]').last();
  const $origGroup = $wrap && $wrap.length ? $wrap.find('.alb-action-group').first() : $();
  const $origBtns = $origGroup.find('button');
  const $mirror = $('#alb-ilm-mirror').empty();

  if ($origGroup.length && $origBtns.length) {
    // Tampilkan SALINAN tombol asli (visual sama) → klik salinan memicu tombol aslinya.
    const $clone = $($origGroup.prop('outerHTML'));
    $clone.removeClass('alb-superseded').find('button').prop('disabled', false).removeClass('opacity-50 cursor-not-allowed pointer-events-none');
    $mirror.append($clone);
    $mirror.find('button').each((i, btn) => {
      $(btn).on('click', (e) => {
        e.preventDefault();
        close();
        const $orig = $origBtns.eq(i);
        if ($orig.length) $orig.trigger('click');
      });
    });
  } else {
    // Tak ada tombol terdeteksi → arahkan scroll ke respons terakhir.
    $mirror.html(`<button type="button" id="alb-ilm-goto" class="w-full bg-primary hover:bg-primary-active text-white rounded-xl px-5 py-2.5 text-[13px] font-bold inline-flex items-center justify-center gap-2"><i class="fa-solid fa-arrow-down"></i> Bawa aku ke respons terakhir</button>`);
    $('#alb-ilm-goto').on('click', () => {
      close();
      if ($wrap && $wrap.length) {
        $wrap[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        $wrap.addClass('ring-2 ring-amber-400 ring-offset-2 rounded-2xl transition');
        setTimeout(() => $wrap.removeClass('ring-2 ring-amber-400 ring-offset-2'), 2200);
      } else { context.scrollToBottom?.(); }
    });
  }

  $('#alb-ilm-overlay').removeClass('hidden');
}

function ensureReminderModal() {
  if ($('#alb-rm-overlay').length) return;
  $('body').append(`
    <div id="alb-rm-overlay" class="hidden fixed inset-0 z-[9650] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-surface-card w-full max-w-[460px] rounded-2xl shadow-2xl border border-hairline overflow-hidden">
        <div class="px-5 py-4 border-b border-hairline bg-white flex items-start justify-between gap-3">
          <span id="alb-rm-chip" class="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] rounded-full px-2.5 py-1"></span>
          <button type="button" id="alb-rm-close" class="w-8 h-8 rounded-full text-muted hover:text-ink hover:bg-black/5 flex items-center justify-center shrink-0"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="alb-rm-body" class="p-5 text-[14px] leading-relaxed text-ink max-h-[50vh] overflow-y-auto"></div>
        <div id="alb-rm-actions" class="px-5 pb-5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2"></div>
      </div>
    </div>`);
  $('#alb-rm-close').on('click', () => $('#alb-rm-overlay').addClass('hidden'));
  $('#alb-rm-overlay').on('click', (e) => { if (e.target.id === 'alb-rm-overlay') $('#alb-rm-overlay').addClass('hidden'); });
}

export function openReminderModal(payload = {}) {
  const context = this;
  const cfg = RT_VARIANTS[payload.variant] || RT_VARIANTS.reminder;
  ensureReminderModal();

  $('#alb-rm-chip').attr('class', `inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] rounded-full px-2.5 py-1 ${cfg.chip}`)
    .html(`<i class="fa-solid ${cfg.icon}"></i> ${cfg.label}`);
  $('#alb-rm-body').html(context.formatResponseText ? context.formatResponseText(payload.message) : (context.escapeHtml ? context.escapeHtml(payload.message) : payload.message));

  const close = () => $('#alb-rm-overlay').addClass('hidden');
  const $acts = $('#alb-rm-actions').empty();
  (Array.isArray(payload.actions) ? payload.actions : []).forEach((act) => {
    const label = context.escapeHtml ? context.escapeHtml(act.label || 'Aksi') : (act.label || 'Aksi');
    let cls = 'bg-surface-card border border-hairline hover:bg-surface-strong text-ink';
    let icon = 'fa-arrow-right';
    if (act.type === 'feedback_resolved') { cls = 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'; icon = 'fa-circle-check'; }
    else if (act.type === 'wa_teacher') { cls = 'bg-green-500 text-white hover:bg-green-600 border-0'; icon = 'fa-whatsapp'; }
    else if (act.type === 'continue_prompt') { icon = 'fa-forward-step'; }
    const faStyle = act.type === 'wa_teacher' ? 'fa-brands' : 'fa-solid';
    const $btn = $(`<button type="button" class="w-full inline-flex items-center justify-center gap-1.5 ${cls} text-[13px] font-semibold px-4 py-2 rounded-full transition-colors shadow-sm"><i class="${faStyle} ${icon}"></i> ${label}</button>`);

    $btn.on('click', async () => {
      if (act.type === 'continue_prompt' && act.prompt) {
        close();
        context.sendDirectMessage?.({ message: act.prompt, responseMode: 'system', forceAI: false });
      } else if (act.type === 'feedback_resolved') {
        try { await ApiService.post('/chat/feedback', { sessionId: context.sessionId, type: 'resolved' }); } catch (_) {}
        close();
        Toast.show('Mantap! Senang bisa membantu. 😊', 'success');
      } else if (act.type === 'wa_teacher' && act.url) {
        window.open(act.url, '_blank', 'noopener');
        close();
      } else if (act.prompt) {
        close();
        context.sendDirectMessage?.({ message: act.prompt, responseMode: 'system' });
      } else {
        close();
      }
    });
    $acts.append($btn);
  });
  if (!$acts.children().length) $acts.addClass('hidden'); else $acts.removeClass('hidden');

  $('#alb-rm-overlay').removeClass('hidden');
}
