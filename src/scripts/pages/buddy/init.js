import $ from 'jquery';
import { ApiService } from '../../fetch/api.js';
import { SourceViewer } from '../../components/source-viewer.js';
import { getPageElementOptions, resolvePageKeyFromContext } from './pageElements.js';

export function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const view = urlParams.get('view');
  this.projectKey = urlParams.get('projectKey');
  this.urlSessionId = urlParams.get('sessionId');
  this.mode = urlParams.get('mode');

  if (this.mode === 'external' && this.urlSessionId) {
    $('#view-workspace').removeClass('hidden');
    $('#view-landing').addClass('hidden');
    this.initWorkspace(true);
  } else if (view === 'ai' || this.urlSessionId) {
    $('#view-workspace').removeClass('hidden');
    $('#view-landing').addClass('hidden');
    this.initWorkspace(false);
  } else {
    $('#view-landing').removeClass('hidden');
    $('#view-workspace').addClass('hidden');
    this.initLanding();
  }
}

export async function initLanding() {
  this.$btnOpenAi = $('#open-ai-page');
  if (!this.$btnOpenAi.length) return;
  let fetchedConfig = null;

  try {
    const res = await ApiService.get(`/widget/config/${this.projectKey}`);
    if (res.status === 'success' && res.data) {
      fetchedConfig = res.data;
      let theme = fetchedConfig.theme;
      if (typeof theme === 'string') theme = JSON.parse(theme);
      if (theme?.primaryColor) this.$btnOpenAi.css('background-color', theme.primaryColor);
    }
  } catch (e) {
    console.error('Gagal load config widget', e);
  }

  this.$btnOpenAi.removeClass('opacity-0');
  this.$btnOpenAi.on('click', () => {
    const context = {
      title: document.title || 'Halaman VClass',
      summary: document.querySelector('main p')?.innerText?.trim() || 'Halaman Virtual Class.',
      sourceUrl: window.location.href,
      capturedAt: new Date().toISOString(),
      elements: this.collectPageElements(),
      userTasks: this.collectUserTasks() // AMBIL DATA DEADLINE
    };
    sessionStorage.setItem('alb_external_context', JSON.stringify(context));
    if (fetchedConfig) sessionStorage.setItem('alb_external_config', JSON.stringify(fetchedConfig));
    window.open(`/buddy?projectKey=${this.projectKey}&view=ai`, 'alb_ai_workspace');
  });
}

export function initWorkspace(isExternal = false) {
  this.sessionId = null;
  this.aiUsage = { max: 3, used: 0, cooldown_remaining_seconds: 0, cooldown_active: false };
  this.cooldownInterval = null;
  this.chatCount = 0;
  this.maxChat = 3;
  this.selectedElement = null;
  this.contextData = { elements: [] };
  this.isSuggestionHidden = false;
  this.hasStartedChat = false;
  this.activeTemplate = null;

  SourceViewer.init();

  this.cacheWorkspaceDOM();
  this.bindWorkspaceEvents();
  if (typeof this.renderPersistentManualContextSelector === 'function') {
    this.renderPersistentManualContextSelector();
  }

  if (isExternal && this.urlSessionId) {
    // Load session, verifikasi siswa LMS, baru tampilkan onboarding.
    this.loadExternalSessionContext(this.urlSessionId).then(async () => {
      if (typeof this.ensureLmsStudentIdentity === 'function') {
        await this.ensureLmsStudentIdentity({ silent: false });
      }

      // [v0.9.1] Tampilkan carousel bila belum pernah, ATAU versi flag lama (carousel di-update).
      if (localStorage.getItem('alb_external_onboarding_seen') !== 'v0.9.8') {
        this.showOnboardingCarousel();
      }

      this.toggleSuggestions?.();

      // [v0.9.26 #A] Kalau nama/konteks tak terbaca dari VClass → tawarkan form fallback
      // (dropdown nama siswa enrolled + dropdown konteks halaman).
      try { await this.ensureIdentityFallback?.(); } catch (_) {}
    });
  } else {
    this.loadSessionData();
    this.renderElementList();
    this.toggleSuggestions();

    // [v0.9.0] Entry langsung / PWA (bukan widget eksternal). Setelah sesi siap:
    //  • simpan projectKey terakhir untuk routing entry-point PWA (index.astro),
    //  • muat riwayat + state (agar divider "sesi dibuka kembali" & input aktif jalan),
    //  • kalau belum ada identitas siswa, tampilkan form email + kelas (cek email saja).
    Promise.resolve(this.createOrLoadSession()).then(async () => {
      try { if (this.projectKey) localStorage.setItem('alb:lastProjectKey', this.projectKey); } catch (_) {}

      if (this.sessionId) {
        await this.loadSessionState?.();
        await this.loadChatHistory?.();
        this.loadMateriMentions?.();
      }

      const meta = this.contextData?.session_meta || {};
      const hasVerifiedStudent = Boolean(meta.email && meta.class_code);
      if (!hasVerifiedStudent && typeof this.ensureLmsStudentIdentity === 'function') {
        await this.ensureLmsStudentIdentity({ silent: false });
      }

      // Setelah identitas siswa terkonfirmasi, tampilkan onboarding carousel
      // bila belum pernah dilihat (sama dengan jalur external).
      if (localStorage.getItem('alb_external_onboarding_seen') !== 'v0.9.8') {
        this.showOnboardingCarousel?.();
      }
    }).catch((err) => console.error('[Buddy] gagal inisialisasi entry langsung:', err));
  }
}

export async function renderPersistentManualContextSelector() {
  if (!this.$contextSidebar?.length || !this.projectKey) return;

  // Bersihkan UI dropdown lama jika masih ada agar rapi
  $('#manual-context-switcher').remove();

  // 1. Tambahkan tombol di sebelah header "PREVIEW KONTEKS"
  if (!$('#btn-open-context-modal').length) {
    // Kita menargetkan elemen tepat sebelum Judul Halaman (yaitu label Preview Konteks)
    const $headerSection = this.$elTitle.prev();

    if ($headerSection.length) {
      // Ubah layout label menjadi flex agar sejajar dengan tombol
      $headerSection.css({ 'display': 'flex', 'align-items': 'center', 'justify-content': 'space-between' });
      $headerSection.append(`
        <button id="btn-open-context-modal" class="text-primary bg-primary/10 hover:bg-primary hover:text-white px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 cursor-pointer border-0" title="Ganti Konteks Manual">
          <i class="fa-solid fa-exchange-alt text-[10px]"></i> <span class="text-[10px] font-bold">Ganti</span>
        </button>
      `);
    } else {
      // Fallback aman jika struktur HTML berbeda
      this.$elTitle.parent().prepend(`
        <div class="flex items-center justify-between mb-2">
          <span class="text-[11px] font-bold text-muted uppercase tracking-wider">Preview Konteks</span>
          <button id="btn-open-context-modal" class="text-primary bg-primary/10 hover:bg-primary hover:text-white px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 cursor-pointer border-0">
            <i class="fa-solid fa-exchange-alt text-[10px]"></i> <span class="text-[10px] font-bold">Ganti</span>
          </button>
        </div>
      `);
    }
  }

  // 2. Buat struktur HTML Modal (Hanya di-inject sekali ke dalam body)
  if (!$('#modal-context-switcher').length) {
    $('body').append(`
      <div id="modal-context-switcher" class="fixed inset-0 z-[9999] hidden flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity">
        <div class="bg-white rounded-2xl p-6 w-[90%] max-w-md shadow-2xl transform scale-95 transition-transform duration-200">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center text-lg">
              <i class="fa-solid fa-right-left"></i>
            </div>
            <h3 class="text-lg font-bold text-ink m-0">Ganti Konteks Halaman</h3>
          </div>
          <p class="text-[13px] text-muted-soft mb-5 leading-relaxed">
            Sistem otomatis membaca halaman saat ini. Namun, jika AI kesulitan memahami atau kamu ingin menanyakan halaman lain, silakan pindahkan fokus AI secara manual.
          </p>
          <div class="bg-surface-card border border-hairline rounded-xl p-3 mb-5">
            <label class="block text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Pilih Halaman Tujuan:</label>
            <select id="modal-context-select" class="w-full bg-white border border-hairline rounded-lg px-3 py-2.5 text-[13px] text-ink focus:outline-none focus:border-primary shadow-sm">
              <option value="" disabled selected>Memuat daftar halaman...</option>
            </select>
          </div>
          <div class="flex justify-end gap-3">
            <button id="btn-close-context-modal" class="px-5 py-2.5 text-[13px] font-medium text-muted hover:bg-surface-strong hover:text-ink rounded-xl transition-colors border-0 cursor-pointer">Batal</button>
            <button id="btn-apply-context-modal" class="px-5 py-2.5 text-[13px] font-semibold bg-primary text-white hover:bg-primary-active rounded-xl transition-colors shadow-sm disabled:opacity-50 border-0 cursor-pointer">Terapkan Konteks</button>
          </div>
        </div>
      </div>
    `);
  }

  const $modal = $('#modal-context-switcher');
  const $modalBox = $modal.find('.bg-white.rounded-2xl');
  const $select = $('#modal-context-select');
  const $btnApply = $('#btn-apply-context-modal');

  // [v0.3.0] Sumber konteks = folder /public/elements (manifest pageElements.js),
  // bukan lagi template DB. Ini juga menghilangkan bug "template belum tersedia".
  try {
    const pages = getPageElementOptions();
    const currentKey = resolvePageKeyFromContext(this.contextData || {});

    let options = '<option value="" disabled selected>-- Pilih Halaman VClass --</option>';
    pages.forEach((p) => {
      const selected = p.key === currentKey ? ' selected' : '';
      options += `<option value="${p.key}"${selected}>${this.escapeHtml(p.label)} (${p.count} elemen)</option>`;
    });
    $select.html(options);
    $btnApply.prop('disabled', false);

    // --- EVENT LISTENERS UNTUK MODAL ---
    $(document).off('click', '#btn-open-context-modal').on('click', '#btn-open-context-modal', () => {
      $modal.removeClass('hidden');
      setTimeout(() => $modalBox.removeClass('scale-95').addClass('scale-100'), 10);
    });

    const closeModal = () => {
      $modalBox.removeClass('scale-100').addClass('scale-95');
      setTimeout(() => $modal.addClass('hidden'), 200);
    };

    $('#btn-close-context-modal').off('click').on('click', closeModal);

    $btnApply.off('click').on('click', async () => {
      const pageKey = $select.val();
      if (!pageKey) {
        alert('Pilih halaman terlebih dahulu.');
        return;
      }

      $btnApply.html('<i class="fa-solid fa-spinner fa-spin"></i>').prop('disabled', true);
      $select.prop('disabled', true);

      try {
        const ok = await this.applyPageElements(pageKey, { silent: true });
        if (ok) {
          const label = getPageElementOptions().find((p) => p.key === pageKey)?.label || pageKey;
          this.appendBubble(`Fokus sistem dipindahkan ke **${label}**. Klik salah satu elemen di sidebar, atau tanyakan langsung di chat.`, false, 'system');
        }
        closeModal();
      } catch (err) {
        console.error('[BuddyPage] Gagal ganti konteks halaman:', err);
        alert('Gagal mengganti konteks.');
      } finally {
        $btnApply.html('Terapkan Konteks').prop('disabled', false);
        $select.prop('disabled', false);
      }
    });
  } catch (err) {
    console.error('[BuddyPage] Gagal menyiapkan konteks halaman:', err);
    $select.html('<option value="" selected disabled>Gagal memuat daftar halaman</option>');
    $btnApply.prop('disabled', true);
  }
}

// Tambahkan fungsi ini di init.js juga
export async function triggerManualFallback() {
  $('#template-preview-panel').addClass('hidden');
  try {
      // Asumsi kamu membuat route GET /api/page-templates/list yang isinya me-return semua template aktif
      const resList = await ApiService.get(`/page-templates/list?projectKey=${this.projectKey}`);
      if (resList.status === 'success' && resList.data) {
          this.renderManualTemplateSelector(resList.data);
      } else {
          this.$elList.html('<div class="p-4 text-muted text-[13px]">Konteks halaman tidak tersedia.</div>');
      }
  } catch (e) {
      this.$elList.html('<div class="p-4 text-muted text-[13px]">Gagal memuat fallback.</div>');
  }
}
