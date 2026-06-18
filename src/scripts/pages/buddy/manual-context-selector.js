// ============================================================
// manual-context-selector.js — Selector manual konteks halaman/template di sidebar
// (saat auto-detect gagal). [v0.9.7] Diekstrak dari dom-ui.js. Method BuddyPage.
// ============================================================
import $ from 'jquery';
import { ApiService } from '../../fetch/api.js';
import Toast from '../../components/toast.js';
import { PAGE_ELEMENTS, buildElementsForPage } from './pageElements.js';

// [v0.9.7] Tombol kecil "Ganti" di samping label "Preview Konteks". Diklik →
// membuka OVERLAY MODAL berisi daftar konteks halaman. Pilih satu → applyTemplateToWorkspace
// (tab Elemen Halaman ikut menyesuaikan), lalu modal ditutup.
export async function renderPersistentManualContextSelector() {
  if (!this.$contextSidebar?.length || !this.projectKey) return;

  const $anchor = $('#manual-context-anchor');
  const $mount = $anchor.length ? $anchor : this.$contextSidebar.children().first();
  if (!$mount.length) return;

  const context = this;

  // 1) Tombol kecil di header.
  if (!$('#manual-context-toggle').length) {
    $mount.append(`
      <button type="button" id="manual-context-toggle" class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-soft hover:text-ink bg-white/70 border border-hairline rounded-full px-2.5 py-1 transition-colors" title="Ganti konteks halaman secara manual">
        <i class="fa-solid fa-right-left text-[10px]"></i> Ganti
      </button>
    `);
  }

  // 2) Overlay modal (sekali buat, di-append ke body agar tidak terjebak stacking sidebar).
  if (!$('#manual-context-overlay').length) {
    $('body').append(`
      <div id="manual-context-overlay" class="hidden fixed inset-0 z-[9650] bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-surface-card w-full max-w-[460px] max-h-[80vh] rounded-2xl shadow-2xl border border-hairline flex flex-col overflow-hidden">
          <div class="px-5 py-4 border-b border-hairline flex items-start justify-between gap-3 shrink-0 bg-white">
            <div class="min-w-0">
              <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted flex items-center gap-2"><i class="fa-solid fa-right-left text-[11px] text-muted-soft"></i> Ganti Konteks Halaman</div>
              <div class="text-[12px] text-muted-soft mt-1 leading-snug">Pilih konteks halaman secara manual kalau deteksi otomatis kurang sesuai. Tab <b>Elemen Halaman</b> akan menyesuaikan.</div>
            </div>
            <button type="button" id="manual-context-close" class="w-9 h-9 rounded-full bg-surface-strong border border-hairline text-ink hover:bg-hairline shrink-0"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div id="manual-context-list" class="p-3 overflow-y-auto flex-1 space-y-1.5 bg-canvas">
            <div class="text-center py-8 text-muted text-[13px]"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Memuat konteks...</div>
          </div>
          <div class="px-5 py-3 border-t border-hairline text-[11px] text-muted-soft shrink-0 bg-white">Pilihan ini hanya mengganti konteks visual &amp; bantuan AI di sidebar, bukan halaman asli.</div>
        </div>
      </div>
    `);

    const closeModal = () => $('#manual-context-overlay').addClass('hidden');
    $(document).off('click.albManualCtxClose').on('click.albManualCtxClose', '#manual-context-close', closeModal);
    // Klik area gelap (overlay) menutup; klik di dalam kartu tidak.
    $(document).off('click.albManualCtxOverlay').on('click.albManualCtxOverlay', '#manual-context-overlay', (e) => {
      if (e.target.id === 'manual-context-overlay') closeModal();
    });
  }

  // 3) Tombol membuka modal. Daftar konteks diambil dari PAGE_ELEMENTS (8 konteks
  //    statis yang punya elemen+gambar terdefinisi), BUKAN dari template backend.
  $(document).off('click.albManualCtxOpen').on('click.albManualCtxOpen', '#manual-context-toggle', () => {
    $('#manual-context-overlay').removeClass('hidden');
    const $list = $('#manual-context-list');
    const activeKey = context.contextData?.page_key || '';

    $list.html(PAGE_ELEMENTS.map((p) => {
      const count = (buildElementsForPage(p.key) || []).length || (p.names?.length || 0);
      const isActive = activeKey && p.key === activeKey;
      return `
        <button type="button" class="manual-context-item w-full text-left rounded-xl border ${isActive ? 'border-primary bg-primary/10' : 'border-hairline bg-white hover:bg-surface-strong'} px-3.5 py-3 transition-colors flex items-center justify-between gap-3" data-key="${p.key}">
          <span class="min-w-0">
            <span class="block text-[13px] font-semibold text-ink truncate">${context.escapeHtml(p.label)}</span>
            <span class="block text-[11px] text-muted-soft mt-0.5">${count} elemen</span>
          </span>
          ${isActive ? '<i class="fa-solid fa-check text-primary text-[12px] shrink-0"></i>' : '<i class="fa-solid fa-chevron-right text-muted-soft text-[11px] shrink-0"></i>'}
        </button>`;
    }).join(''));

    $list.off('click', '.manual-context-item').on('click', '.manual-context-item', async function () {
      const key = $(this).attr('data-key');
      const $btn = $(this);
      $('.manual-context-item').prop('disabled', true).addClass('opacity-60');
      $btn.html('<span class="text-[13px] font-semibold text-primary"><i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Memasang konteks...</span>');

      try {
        // applyPageElements: ganti elemen tab "Elemen Halaman" + judul + bubble konfirmasi.
        const ok = await context.applyPageElements(key);
        if (ok === false) throw new Error('Konteks tidak ditemukan');
        $('#manual-context-overlay').addClass('hidden');
      } catch (err) {
        console.error('[BuddyPage] Gagal ganti konteks manual:', err);
        context.appendBubble?.('Konteks manual gagal dipasang. Coba pilih konteks lain atau refresh halaman.', false, 'system');
        $('.manual-context-item').prop('disabled', false).removeClass('opacity-60');
      }
    });
  });
}


export function renderManualTemplateSelector(availableTemplates = []) {
  this.$elList.empty();
  $('#template-preview-panel').addClass('hidden');

  const templates = this.extractTemplateList(availableTemplates)
    .map(t => this.normalizeTemplatePayload(t))
    .filter(t => t && (t.page_type || t.template_name));

  const contextTitle = this.contextData?.heading || this.contextData?.title || 'halaman ini';
  const contextInfo = this.escapeHtml(contextTitle);

  if (!templates.length) {
    this.$elList.html(`
      <div class="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-4">
        <div class="text-[13px] text-amber-800 font-semibold mb-2">
          <i class="fa-solid fa-triangle-exclamation mr-1"></i> Konteks belum tersedia
        </div>
        <p class="text-[12px] text-amber-700 leading-relaxed">
          Sistem membaca judul <span class="font-semibold">${contextInfo}</span>, tetapi daftar template tidak berhasil dimuat dari server.
        </p>
      </div>
    `);
    return;
  }

  let optionsHtml = '<option value="" disabled selected>-- Pilih konteks halaman --</option>';
  templates.forEach((t, idx) => {
    const label = t.template_name || t.page_type || `Template ${idx + 1}`;
    const typeBadge = t.page_type ? ` (${t.page_type})` : '';
    optionsHtml += `<option value="${idx}">${this.escapeHtml(label + typeBadge)}</option>`;
  });

  const fallbackHtml = `
    <div class="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-3">
      <div class="text-[13px] text-amber-800 font-semibold mb-2">
        <i class="fa-solid fa-triangle-exclamation mr-1"></i> Konteks halaman belum cocok otomatis
      </div>
      <p class="text-[12px] text-amber-700 leading-relaxed mb-3">
        Sistem membaca judul <span class="font-semibold">${contextInfo}</span>, tetapi elemen halaman belum berhasil dipasang otomatis.
        Kamu bisa ganti / pindah konteks halaman secara manual di bawah ini.
      </p>

      <select id="manual-page-select" class="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-amber-500">
        ${optionsHtml}
      </select>

      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" id="btn-auto-rematch-context" class="bg-white border border-amber-300 text-amber-800 rounded-lg px-3 py-2 text-[12px] font-semibold hover:bg-amber-100 transition-colors">
          <i class="fa-solid fa-rotate mr-1"></i> Coba deteksi ulang
        </button>
        <button type="button" id="btn-suggest-change-context" class="bg-white border border-amber-300 text-amber-800 rounded-lg px-3 py-2 text-[12px] font-semibold hover:bg-amber-100 transition-colors">
          <i class="fa-solid fa-lightbulb mr-1"></i> Saran ganti konteks
        </button>
      </div>
    </div>
    <div id="manual-elements-area" class="space-y-3"></div>
  `;

  this.$elList.append(fallbackHtml);

// Di dalam fungsi renderManualTemplateSelector()
const applySelectedTemplate = async (selectedIndex) => {
  const template = templates[Number(selectedIndex)];
  if (!template) return;

  $('#loading-manual, .manual-load-error').remove();
  $('#manual-elements-area').html('<div id="loading-manual" class="text-center py-4 text-muted text-[12px]"><i class="fa-solid fa-spinner fa-spin"></i> Memuat elemen...</div>');

  try {
    await this.applyTemplateToWorkspace(template, {
      // PERBAIKAN: Karena ini dipilih manual, paksa ganti judul ke nama template
      displayTitle: template.template_name || template.page_type
    });

    this.appendBubble(`Konteks halaman diganti ke: ${template.template_name || template.page_type}.`, false, 'system');
  } catch (err) {
    $('#loading-manual').remove();
    $('#manual-elements-area').html('<div class="manual-load-error text-semantic-error text-[12px] text-center mt-2">Gagal memasang template pilihan.</div>');
    console.error('[BuddyPage] Gagal apply template manual:', err);
  }
};

  $('#manual-page-select').off('change').on('change', (e) => {
    applySelectedTemplate(e.target.value);
  });

  $('#btn-auto-rematch-context').off('click').on('click', async () => {
    $('#manual-elements-area').html('<div id="loading-manual" class="text-center py-4 text-muted text-[12px]"><i class="fa-solid fa-spinner fa-spin"></i> Mendeteksi ulang...</div>');
    const ok = await this.autoMatchTemplateFromContext();
    if (!ok) {
      $('#loading-manual').remove();
      $('#manual-elements-area').html('<div class="manual-load-error text-[12px] text-amber-700 text-center mt-2">Belum ketemu otomatis. Pilih konteks lewat dropdown di atas.</div>');
    }
  });

  $('#btn-suggest-change-context').off('click').on('click', () => {
    this.$suggestionChips.empty();

    templates.slice(0, 6).forEach((t, idx) => {
      const label = t.template_name || t.page_type || `Template ${idx + 1}`;
      const $btn = $(`<button type="button" class="shrink-0 bg-surface-card border border-amber-300 text-[13px] font-medium text-amber-800 px-4 py-1.5 rounded-full hover:bg-amber-100 transition-colors whitespace-nowrap shadow-sm"><i class="fa-solid fa-right-left mr-1"></i> ${this.escapeHtml(label)}</button>`);
      $btn.on('click', () => applySelectedTemplate(idx));
      this.$suggestionChips.append($btn);
    });

    this.$suggestionWrapper.removeClass('hidden pointer-events-none').stop(true, true).slideDown(200);
    this.isSuggestionHidden = false;
  });
}
