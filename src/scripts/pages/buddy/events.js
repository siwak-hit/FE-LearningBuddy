import $ from 'jquery';
import Toast from '../../components/toast.js';
import { Modal } from '../../components/modal.js';
import { ApiService } from '../../fetch/api.js';


export function getLmsCourseIdFromSource(url = '') {
  try {
    const parsed = new URL(url || this.contextData?.sourceUrl || this.contextData?.url || window.location.href, window.location.href);
    return parsed.searchParams.get('id') || '2';
  } catch (_) {
    return '2';
  }
}

export function resolveLmsActionUrl(targetUrl = '', pageType = '', courseId = '') {
  const LMS_BASE = 'https://lms.smpn167jakarta.sch.id';
  const cleanType = String(pageType || '').toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
  const id = courseId || this.getLmsCourseIdFromSource?.() || '2';

  if (targetUrl) {
    try {
      const resolved = new URL(targetUrl, LMS_BASE).href;
      if (resolved.includes('/login/logout.php')) return `${LMS_BASE}/login/logout.php`;
      return resolved;
    } catch (_) {
      return targetUrl;
    }
  }

  if (cleanType === 'login' || cleanType === 'masuk') return `${LMS_BASE}/login/index.php`;
  if (cleanType === 'dashboard' || cleanType === 'beranda' || cleanType === 'mycourses' || cleanType === 'kursussaya') return `${LMS_BASE}/my/courses.php`;
  if (cleanType === 'course' || cleanType === 'kursus' || cleanType === 'detailkursus' || cleanType === 'kelas') return `${LMS_BASE}/course/view.php?id=${encodeURIComponent(id)}`;
  if (cleanType === 'logout' || cleanType === 'keluar') return `${LMS_BASE}/login/logout.php`;
  if (cleanType === 'grade' || cleanType === 'nilai' || cleanType === 'lihatnilai') return `${LMS_BASE}/grade/report/user/index.php?id=${encodeURIComponent(id)}`;
  if (cleanType === 'activities' || cleanType === 'activity' || cleanType === 'aktivitas' || cleanType === 'listaktivitas') return `${LMS_BASE}/course/overview.php?id=${encodeURIComponent(id)}`;
  if (cleanType === 'participants' || cleanType === 'siswa' || cleanType === 'listsiswa' || cleanType === 'peserta') return `${LMS_BASE}/user/index.php?id=${encodeURIComponent(id)}`;
  if (cleanType === 'materi' || cleanType === 'modul' || cleanType === 'resource') return `${LMS_BASE}/course/view.php?id=${encodeURIComponent(id)}`;

  return targetUrl || this.contextData?.sourceUrl || this.contextData?.url || '';
}

export function navigateSourceTab(targetUrl = '', pageType = '', options = {}) {
  const courseId = options.courseId || options.course_id || this.getLmsCourseIdFromSource?.();
  const destination = this.resolveLmsActionUrl ? this.resolveLmsActionUrl(targetUrl, pageType, courseId) : targetUrl;

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
    try { opened.focus(); } catch (_) {}
    Toast.show('Tab asal tidak ditemukan. Link dibuka di tab baru.', 'warning');
  } else {
    Toast.show('Browser memblokir tab baru. Silakan buka link secara manual.', 'warning');
  }
}

export function bindWorkspaceEvents() {
  const bindIfExists = ($el, eventName, handler) => {
    if ($el && $el.length) $el.off(eventName).on(eventName, handler);
  };

  // Logika Pindah Fokus Tab Sidebar
  bindIfExists(this.$tabBtnGuide, 'click', () => {
    this.$tabBtnGuide.addClass('font-bold text-primary border-primary').removeClass('font-semibold text-muted border-transparent');
    this.$tabBtnElements.addClass('font-semibold text-muted border-transparent').removeClass('font-bold text-primary border-primary');
    this.$tabContentGuide.removeClass('hidden');
    this.$elList.addClass('hidden');
  });

  bindIfExists(this.$tabBtnElements, 'click', () => {
    this.$tabBtnElements.addClass('font-bold text-primary border-primary').removeClass('font-semibold text-muted border-transparent');
    this.$tabBtnGuide.addClass('font-semibold text-muted border-transparent').removeClass('font-bold text-primary border-primary');
    this.$elList.removeClass('hidden');
    this.$tabContentGuide.addClass('hidden');
  });

  const sendChatMessage = async (payloadOverride = {}) => {
    if (!navigator.onLine) {
      Toast.show('Tidak ada koneksi internet.', 'error');
      return;
    }

    if (this.aiUsage && (this.aiUsage.cooldown_active || this.aiUsage.used >= (this.aiUsage.max || 3))) {
      Toast.show('Batas AI Buddy mencapai limit. Tunggu waktu jeda selesai.', 'warning');
      this.triggerCooldown();
      return;
    }

    this.hasStartedChat = true;
    this.isRequesting = true;

    this.$chatArea.find('.alb-action-group button, .btn-wa-action, .btn-ask-ai-fallback, .btn-system-feedback-ok, .btn-system-feedback-ai, .btn-tutorial-action, .btn-continue-prompt, .btn-return-source')
        .prop('disabled', true)
        .css({'opacity': '0.5', 'cursor': 'not-allowed', 'pointer-events': 'none'});

    // Tampilkan di UI
    this.appendBubble(payloadOverride.message, true);
    this.$inputArea.val('').prop('disabled', true);
    this.$btnSend.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i>');
    this.appendTypingIndicator();

    // Default Payload dipadukan dengan Override
    const finalPayload = {
      sessionId: this.sessionId,
      message: payloadOverride.message,
      pageContext: this.contextData || {},
      elementContext: payloadOverride.elementContext || null,
      expectedSourceType: 'all',
      responseMode: this.getResponseMode(), // Tarik value dari checkbox
      forceFAQ: payloadOverride.forceFAQ || false,
      forceAI: payloadOverride.forceAI || false,
      intent: payloadOverride.intent || null // Explicit intent
    };

    try {
      const res = await ApiService.post('/chat/send', finalPayload);
      this.removeTypingIndicator();

      if (res.status === 'success' && res.data) {
        const { botMessage, response_source, ai_usage, is_locked, ai_error_fallback } = res.data;
        const finalSource = ai_error_fallback ? 'fallback' : response_source;

        // Cek fallback action system
        const finalActions = finalSource === 'system' && this.inferSystemActions
          ? this.inferSystemActions(payloadOverride.message, botMessage.actions || [])
          : (botMessage.actions || []);

        this.appendBubble(botMessage.message, false, finalSource, finalActions);

        if (ai_usage) this.updateAiUsageUI(ai_usage);
        if (is_locked) this.handleLockdown(true);
      } else {
        this.appendBubble('Maaf, terjadi kesalahan saat memproses data.', false, 'system');
      }
    } catch (error) {
      this.removeTypingIndicator();
      this.appendBubble('Koneksi ke AI Buddy gagal. Silakan coba lagi.', false, 'fallback');
    } finally {
      this.isRequesting = false;
      this.$btnSend.html('<i class="fa-solid fa-arrow-up"></i>');
      if (!this.isLocked && (!this.aiUsage || !this.aiUsage.cooldown_active)) {
        this.$inputArea.prop('disabled', false).focus();
        this.$btnSend.prop('disabled', false);
      }
    }
  };

  bindIfExists(this.$btnOpenContext, 'click', () => {
    const isDesktop = window.innerWidth >= 768;
    if (isDesktop) {
      this.$contextSidebar.toggleClass('desktop-collapsed');
    } else {
      this.openContextSidebar();
    }
  });

  this.$chatArea.on('click', '.btn-return-source', (e) => {
    const $btn = $(e.currentTarget);
    const targetUrl = $btn.attr('data-url') || '';
    const pageType = $btn.attr('data-page-type') || '';
    const courseId = $btn.attr('data-course-id') || '';

    if (this.navigateSourceTab) {
      this.navigateSourceTab(targetUrl, pageType, { courseId });
      return;
    }

    if (targetUrl) window.open(targetUrl, '_blank');
    else Toast.show('Tab asal tidak ditemukan. Silakan kembali ke halaman VClass secara manual.', 'warning');
  });

  bindIfExists(this.$btnCloseContext, 'click', () => this.closeContextSidebar());
  bindIfExists(this.$contextBackdrop, 'click', () => this.closeContextSidebar());

  bindIfExists(this.$inputArea, 'input keyup paste', () => {
    setTimeout(() => {
      const val = this.$inputArea.val();

      if (!val.match(/@\w+/)) {
        this.selectedElement = null;
        this.$selectedBar.addClass('hidden').removeClass('flex');
      }

      // HAPUS this.toggleSuggestions() di sini, ganti dengan ini saja:
      this.handleTriggerWords(val);

    }, 0);
  });

  bindIfExists(this.$btnClearSelected, 'click', (e) => {
    e.preventDefault();
    this.selectedElement = null;
    this.$selectedBar.addClass('hidden').removeClass('flex');
    this.$selectedText.empty();
    const cleanedValue = this.$inputArea.val().replace(/@\w+\s?/g, '');
    this.$inputArea.val(cleanedValue).focus();
    this.toggleSuggestions();
  });

  bindIfExists(this.$form, 'submit', (e) => {
    e.preventDefault();
    const text = this.$inputArea.val().trim();
    if (!text || this.isRequesting) return;

    const currentElementContext = this.selectedElement;
    this.selectedElement = null;
    this.$selectedBar.addClass('hidden').removeClass('flex');
    this.toggleSuggestions();

    sendChatMessage({
      message: text,
      elementContext: currentElementContext,
      forceAI: this.forceNextAI === true
    });
    this.forceNextAI = false;
  });

  $('.btn-fast-guide').on('click', (e) => {
    if (window.innerWidth < 768) this.closeContextSidebar(); // Auto tutup di mobile
    const intent = $(e.currentTarget).data('intent');
    const msg = $(e.currentTarget).data('msg');

    // Paksa agar Buka Materi diproses oleh AI (Tutorial Steps) agar rapi
    const useAI = ['bantuan_buka_materi'].includes(intent);

    sendChatMessage({
      message: msg,
      intent: intent,
      forceFAQ: !useAI, // False jika useAI
      forceAI: useAI    // True jika useAI
    });
  });

  bindIfExists(this.$btnReload, 'click', () => window.location.reload());
  bindIfExists(this.$btnSessionInfo, 'click', () => Modal.open('modal-session-info'));

  bindIfExists($('#btn-unlock-chat'), 'click', async () => {
    const name = $('#unlock-name-input').val().trim();
    const key = $('#unlock-key-input').val().trim();

    // Validasi input
    if (!name) {
      Toast.show('Harap masukkan nama panggilanmu!', 'error');
      $('#unlock-name-input').addClass('border-semantic-error');
      return;
    } else {
      $('#unlock-name-input').removeClass('border-semantic-error');
    }

    if (!key) {
      Toast.show('Harap masukkan key dari guru!', 'error');
      return;
    }

    $('#btn-unlock-chat').html('<i class="fa-solid fa-spinner fa-spin"></i>').prop('disabled', true);

    try {
      // 1. Simpan Nama Siswa terlebih dahulu menggunakan metode PATCH
      // (Asumsi ApiService Anda mendukung .patch, jika tidak Anda bisa menggunakan fetch API standar)
      try {
         await ApiService.patch(`/chat/session/${this.sessionId}/profile`, { student_name: name });
      } catch (err) {
         console.warn("Gagal update profil nama, lanjut unlock", err);
      }

      // 2. Proses Buka Kunci (Unlock Chat)
      const res = await ApiService.post('/chat/unlock', { sessionId: this.sessionId, key });

      if (res.status === 'success') {
        this.handleLockdown(false);
        Toast.show('Chat berhasil dibuka kembali.', 'success');
        this.appendBubble(`Akses chat telah dibuka kembali. Mari kita lanjutkan belajar dengan baik dan sopan ya, ${this.escapeHtml(name)}!`, false, 'system');
      } else {
        Toast.show(res.message || 'Key salah atau kedaluwarsa!', 'error');
      }
    } catch (err) {
      Toast.show('Gagal menghubungi server.', 'error');
    } finally {
      $('#btn-unlock-chat').html('Verifikasi & Buka Akses').prop('disabled', false);
      $('#unlock-key-input').val('');
    }
  });

  if (!(this.mode === 'external' && this.urlSessionId)) {
    bindIfExists(this.$btnBack, 'click', () => Modal.open('modal-confirm-back'));
    bindIfExists(this.$btnConfirmLeave, 'click', () => { window.location.href = `/buddy?projectKey=${this.projectKey}`; });
  }

  // Listener tombol WhatsApp harus idempotent agar form tidak dobel.
  this.$chatArea
    .off('click', '.btn-wa-action')
    .on('click', '.btn-wa-action', (e) => {
      e.preventDefault();
      const existingForm = $('.alb-wa-help-form');
      if (existingForm.length) {
        existingForm[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      this.renderWaForm(e.currentTarget);
    });

  // Tombol "sudah menyelesaikan masalah" untuk jawaban sistem.
  this.$chatArea
    .off('click', '.btn-system-feedback-ok')
    .on('click', '.btn-system-feedback-ok', (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      const $wrap = $btn.closest('.alb-system-message-wrap');
      $wrap.find('.alb-action-group button').prop('disabled', true).addClass('opacity-60 cursor-not-allowed');
      $btn.removeClass('bg-emerald-50').addClass('bg-emerald-600 text-white').html('<i class="fa-solid fa-check"></i> Sip, masalah selesai');
      Toast.show('Terima kasih. Jawaban sistem ditandai membantu.', 'success');
    });

  // Tombol "belum" akan memakai AI dengan forceAI=true.
  this.$chatArea
    .off('click', '.btn-system-feedback-ai')
    .on('click', '.btn-system-feedback-ai', async (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      const prompt = $btn.attr('data-prompt') || 'Tolong jelaskan lebih detail dengan AI.';

      if (this.aiUsage && (this.aiUsage.cooldown_active || this.aiUsage.used >= (this.aiUsage.max || 3))) {
        Toast.show('Batas AI Buddy mencapai limit. Tunggu waktu jeda selesai.', 'warning');
        this.triggerCooldown();
        return;
      }
      if (this.isRequesting) return;

      this.isRequesting = true;

      // Setelah siswa memilih "Belum", semua action pada bubble sistem sebelumnya dikunci.
      // Ini mencegah siswa iseng menekan tombol lama berkali-kali saat AI sedang menjawab.
      const $wrap = $btn.closest('.alb-system-message-wrap');
      $wrap.find('.alb-action-group button').prop('disabled', true).addClass('opacity-60 cursor-not-allowed');
      $btn.removeClass('bg-sky-50').addClass('bg-sky-600 text-white').html('<i class="fa-solid fa-spinner fa-spin"></i> Meminta AI...');

      this.appendBubble('Belum, jelaskan dengan AI.', true);
      this.appendTypingIndicator();

      try {
        const res = await ApiService.post('/chat/send', {
          sessionId: this.sessionId,
          message: prompt,
          pageContext: this.contextData || {},
          elementContext: null,
          expectedSourceType: 'all',
          forceAI: true
        });

        this.removeTypingIndicator();
        if (res.status === 'success' && res.data) {
          const { botMessage, response_source, ai_usage, is_locked, ai_error_fallback } = res.data;
          const finalSource = ai_error_fallback ? 'fallback' : response_source;
          const finalActions = finalSource === 'system' && this.inferSystemActions
            ? this.inferSystemActions(prompt, botMessage.actions || [])
            : (botMessage.actions || []);
          this.appendBubble(botMessage.message, false, finalSource, finalActions);
          if (ai_usage) this.updateAiUsageUI(ai_usage);
          if (is_locked) this.handleLockdown(true);
        } else {
          this.appendBubble('Maaf, AI belum bisa menjelaskan lebih lanjut saat ini.', false, 'fallback');
        }
      } catch (err) {
        this.removeTypingIndicator();
        this.appendBubble('Koneksi ke AI Buddy gagal saat meminta penjelasan lanjutan.', false, 'fallback');
      } finally {
        this.isRequesting = false;
      }
    });

  // Tombol lanjut tahap berikutnya: isi input agar siswa sadar tahapnya dicicil.
  this.$chatArea
    .off('click', '.btn-continue-prompt')
    .on('click', '.btn-continue-prompt', (e) => {
      e.preventDefault();
      const prompt = $(e.currentTarget).attr('data-prompt') || '';
      this.$inputArea.val(prompt).focus();
      this.toggleSuggestions();
    });

  // --- Listener untuk Tombol Tutorial ---
  this.$chatArea
    .off('click', '.btn-tutorial-action')
    .on('click', '.btn-tutorial-action', (e) => {
      const $btn = $(e.currentTarget);
      const rawSteps = $btn.attr('data-steps');
      if (!rawSteps) return;

      try {
        const steps = JSON.parse(decodeURIComponent(rawSteps));
        if (steps.length > 0) {
          this.highlightElementInPreview(steps[0].element_key);
          $btn.removeClass('bg-primary').addClass('bg-green-500 hover:bg-green-600').html('<i class="fa-solid fa-check-circle"></i> Menampilkan Visual');
        }
      } catch(err) {
        console.error('Gagal parse tutorial steps', err);
      }
    });

    this.$chatArea
    .off('click', '.btn-switch-context')
    .on('click', '.btn-switch-context', async (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      const rawTemplate = $btn.attr('data-template');
      const pendingMessage = $btn.attr('data-message');

      if (!rawTemplate) return;

      // Kunci tombol agar tidak diklik dua kali
      $btn.removeClass('bg-primary hover:bg-primary-active').addClass('bg-emerald-600 text-white').html('<i class="fa-solid fa-spinner fa-spin"></i> Memindahkan...');
      $btn.closest('.alb-action-group').find('button').prop('disabled', true);

      try {
        const template = JSON.parse(decodeURIComponent(rawTemplate));

        // Ganti konteks halaman di FE secara otomatis
        await this.applyTemplateToWorkspace(template, {
          displayTitle: template.template_name || template.page_type
        });

        Toast.show('Konteks berhasil dipindahkan. Sedang menjawab pertanyaan...', 'success');
        $btn.html('<i class="fa-solid fa-check"></i> Konteks Terpasang');

        // Kirim ulang pesan asli agar AI bisa menjawab dengan konteks visual yang baru
        setTimeout(() => {
          this.$inputArea.val(pendingMessage);
          this.$btnSend.click();
        }, 500);

      } catch (err) {
        console.error('Gagal memindahkan konteks', err);
        Toast.show('Gagal memindahkan konteks', 'error');
        $btn.html('<i class="fa-solid fa-triangle-exclamation"></i> Gagal');
      }
    });

    this.$chatArea
    .off('click', '.btn-ask-ai-fallback')
    .on('click', '.btn-ask-ai-fallback', (e) => {
      e.preventDefault();
      const $btn = $(e.currentTarget);
      const rawPayload = $btn.attr('data-payload');

      if (!rawPayload || this.isRequesting) return;

      $btn.removeClass('bg-primary hover:bg-primary-active').addClass('bg-primary-active').html('<i class="fa-solid fa-spinner fa-spin"></i> Menghubungi AI...');
      $btn.closest('.alb-action-group').find('button').prop('disabled', true).addClass('opacity-60 cursor-not-allowed');

      try {
        const payloadData = JSON.parse(decodeURIComponent(rawPayload));

        // Gunakan sendChatMessage yang sudah kita buat
        sendChatMessage({
          message: "Tolong jelaskan secara visual atau lebih detail via AI.",
          forceAI: payloadData.forceAI || true,
          forceFAQ: false,
          intent: payloadData.intent
        });
      } catch (err) {
        console.error("Gagal parsing payload AI FAQ", err);
      }
    });

    bindIfExists(this.$modeToggleBtn, 'click', (e) => {
      e.stopPropagation();
      this.$modeMenu.toggleClass('hidden');
    });

    // 2. Tutup Pop-up Menu Secara Otomatis Jika Pengguna Klik di Luar Area Menu
    $(document).on('click', () => {
      if (this.$modeMenu) this.$modeMenu.addClass('hidden');
    });

    // 3. Tangani Pemilihan Opsi Item di Dalam Menu Dropup
    const self = this;
    $('.opt-response-mode').off('click').on('click', function(e) {
      e.preventDefault();
      const $opt = $(this);
      const selectedMode = $opt.data('mode');

      // Simpan state pilihan ke variabel utama internal sistem
      self.currentResponseMode = selectedMode;

      // Perbarui Teks Label Indikator pada Tombol Utama
      if (selectedMode === 'short') {
        self.$currentModeLabel.text('Singkat');
        self.$modeToggleBtn.addClass('border-amber-200 bg-amber-50/50').removeClass('bg-surface-strong');
      } else {
        self.$currentModeLabel.text('Default');
        self.$modeToggleBtn.addClass('bg-surface-strong').removeClass('border-amber-200 bg-amber-50/50');
      }

      // Variasi Warna CSS Active State pada Menu Item
      $('.opt-response-mode').removeClass('text-primary').addClass('text-ink');
      $opt.removeClass('text-ink').addClass('text-primary');

      // Sembunyikan menu kembali setelah opsi dipilih
      if (self.$modeMenu) self.$modeMenu.addClass('hidden');
    });
}

// TIMPA SELURUH FUNGSI renderWaForm DENGAN KODE INI
export function renderWaForm(btnNode, specificTaskContext = null) {
  // Bersihkan form WA lama yang terbuka di tempat lain
  $('.alb-wa-help-form').remove();
  $('.btn-wa-action, .btn-wa-specific-task').not(':disabled').css({'opacity': '1', 'cursor': 'pointer', 'pointer-events': 'auto'});

  // Kunci tombol pemicu form ini agar tidak ganda
  $(btnNode).prop('disabled', true).css({'opacity': '0.5', 'cursor': 'not-allowed'});
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

  // Apend form ke luar wrapper agar tidak pecah layout tabelnya
  const $wrap = $(btnNode).closest('.alb-system-message-wrap');
  if ($wrap.length) {
      $wrap.append($form);
  } else {
      $(btnNode).parent().append($form);
  }

  this.scrollToBottom();

  // Mode Injeksi: Jika dari tabel tugas yang tidak ada deadline-nya
  if (specificTaskContext) {
    $form.find('.wa-select-issue').val('Tanya Jadwal / Deadline Tugas');
    $form.find('.wa-manual-issue-wrap').removeClass('hidden');
    $form.find('.wa-input-issue').val(`Mohon info batas waktu (deadline) untuk aktivitas: ${specificTaskContext}`);
  }

  $form.find('.wa-select-issue').off('change').on('change', function() {
    if ($(this).val() === 'Lainnya' || specificTaskContext) {
      $form.find('.wa-manual-issue-wrap').removeClass('hidden');
    } else {
      $form.find('.wa-manual-issue-wrap').addClass('hidden');
    }
  });
  if (!specificTaskContext) $form.find('.wa-select-issue').trigger('change');

  $form.find('.wa-cancel-btn').off('click').on('click', () => {
    $form.remove();
    $(btnNode).prop('disabled', false).css({'opacity': '1', 'cursor': 'pointer'});
  });

  $form.find('.wa-submit-btn').off('click').on('click', () => {
    const name = $form.find('.wa-input-name').val().trim() || 'Siswa';
    const selectedIssue = $form.find('.wa-select-issue').val();
    const manualIssue = $form.find('.wa-input-issue').val().trim();

    let issue = selectedIssue;
    if (selectedIssue === 'Lainnya' || manualIssue !== '') issue = manualIssue || 'Kendala lainnya di sistem';

    const text = `Halo Pak Ilyas, saya ingin meminta bantuan.\n\nNama: ${name}\nKendala: ${issue}\nHalaman: ${window.location.href}\n\nMohon bantuannya Pak. Terima kasih.`;

    window.open('https://api.whatsapp.com/send/?phone=628989807094&text=' + encodeURIComponent(text), '_blank');
    $form.html('<div class="text-[13px] text-green-600 text-center py-4 font-medium"><i class="fa-solid fa-check mr-1"></i> Membuka WhatsApp...</div>');

    // Perbaikan Bug WA: Buka kunci tombol kembali setelah WA dikirim & reset form
    setTimeout(() => {
      $form.remove();
      $(btnNode).prop('disabled', false).css({'opacity': '1', 'cursor': 'pointer'});
    }, 2500);
  });

  this.$chatArea
  .off('click', '.btn-wa-specific-task')
  .on('click', '.btn-wa-specific-task', (e) => {
    e.preventDefault();

    const taskName = $(e.currentTarget).attr('data-task') || '';

    const existingForm = $('.alb-wa-help-form');
    if (existingForm.length) {
      existingForm[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    this.renderWaForm(e.currentTarget, taskName);
  });
}
