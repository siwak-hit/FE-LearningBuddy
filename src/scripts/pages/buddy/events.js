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

  bindIfExists(this.$form, 'submit', async (e) => {
    e.preventDefault();
    if (!navigator.onLine) {
      Toast.show('Tidak ada koneksi internet. Pesan gagal dikirim.', 'error');
      this.appendBubble('Sistem tidak dapat terhubung ke jaringan. Mohon periksa koneksi internet.', false, 'system');
      return;
    }

    // FIX: CEK COOLDOWN SAAT USER INGIN MENGIRIM PESAN KE 4/3
    // Cegat pengiriman API, tampilkan overlay cooldown, BIARKAN value input tetap ada
    if (this.aiUsage && (this.aiUsage.cooldown_active || this.aiUsage.used >= (this.aiUsage.max || 3))) {
      Toast.show('Batas AI Buddy mencapai limit. Tunggu waktu jeda selesai.', 'warning');
      this.triggerCooldown();
      return;
    }

    const text = this.$inputArea.val().trim();
    if (!text || this.isRequesting) return;

    this.hasStartedChat = true;
    this.isRequesting = true;
    this.appendBubble(text, true);

    this.$inputArea.val('').prop('disabled', true);
    this.$btnSend.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i>');

    const currentElementContext = this.selectedElement;
    this.selectedElement = null;
    this.$selectedBar.addClass('hidden').removeClass('flex');
    this.toggleSuggestions();
    this.appendTypingIndicator();

    const slowNetworkTimer = setTimeout(() => {
      if (this.isRequesting) Toast.show('Koneksi lambat, sedang memproses balasan...', 'warning');
    }, 8000);

    try {
      const payload = {
        sessionId: this.sessionId,
        message: text,
        pageContext: this.contextData || {},
        elementContext: currentElementContext || null,
        expectedSourceType: 'all',
        forceAI: this.forceNextAI === true
      };

      this.forceNextAI = false;

      const res = await ApiService.post('/chat/send', payload);
      clearTimeout(slowNetworkTimer);
      this.removeTypingIndicator();

      if (res.status === 'success' && res.data) {
        const { botMessage, response_source, ai_usage, is_locked, ai_error_fallback } = res.data;
        const finalSource = ai_error_fallback ? 'fallback' : response_source;
        const finalActions = finalSource === 'system' && this.inferSystemActions
          ? this.inferSystemActions(text, botMessage.actions || [])
          : (botMessage.actions || []);
        this.appendBubble(botMessage.message, false, finalSource, finalActions);
        if (ai_usage) this.updateAiUsageUI(ai_usage);
        if (is_locked) this.handleLockdown(true);
      } else {
        this.appendBubble('Maaf, terjadi kesalahan saat memproses data.', false, 'system');
      }
    } catch (error) {
      clearTimeout(slowNetworkTimer);
      this.removeTypingIndicator();
      this.appendBubble('Koneksi ke AI Buddy gagal atau terputus. Silakan coba lagi.', false, 'fallback');
    } finally {
      this.isRequesting = false;
      this.$btnSend.html('<i class="fa-solid fa-arrow-up"></i>');
      if (!this.isLocked && (!this.aiUsage || !this.aiUsage.cooldown_active)) {
        this.$inputArea.prop('disabled', false).focus();
        this.$btnSend.prop('disabled', false);
      }
    }
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
}
