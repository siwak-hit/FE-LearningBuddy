import { ApiService } from '../../fetch/api.js';
import Toast from '../../components/toast.js';
import { resolvePageKeyFromContext } from './pageElements.js';

function getPrimaryCourseFromContext(contextData = {}) {
  const meta = contextData.session_meta || {};
  const enrolled = Array.isArray(meta.enrolled_courses) ? meta.enrolled_courses : [];
  const primary = enrolled.find((course) => String(course.course_id || course.courseId || '') === String(meta.course_id || '')) || enrolled[0] || {};

  return {
    count: enrolled.length || (meta.course_id ? 1 : 0),
    title: meta.course_title || primary.course_title || primary.courseTitle || primary.fullname || primary.displayname || primary.shortname || '',
    classCode: meta.class_code || primary.class_code || primary.classCode || ''
  };
}

export function updateConnectedCourseHeader() {
  const meta = (this.contextData && this.contextData.session_meta) || {};
  const storedName = sessionStorage.getItem('alb_student_name') || '';
  const displayName = meta.display_name || storedName || '';
  const course = getPrimaryCourseFromContext(this.contextData || {});

  if (displayName && this.$chatTitle?.length) {
    this.$chatTitle.text(`Hallo ${displayName}`);
  }

  if (this.$chatSubtitle?.length) {
    if (course.count > 0) {
      const courseName = course.title || (course.classCode ? `Kelas ${course.classCode}` : 'course VClass');
      this.$chatSubtitle.text(`${course.count} course terhubung (${courseName})`);
    } else if (displayName) {
      this.$chatSubtitle.text('Sesi siswa terhubung');
    }
  }
}

export async function loadExternalSessionContext(sessionId) {
  this.sessionId = sessionId;
  sessionStorage.setItem('alb_ai_session_' + this.projectKey, this.sessionId);

  try {
    const res = await ApiService.get(`/chat/session/${sessionId}`);
    if (res.status === 'success' && res.data?.session) {
      const session = res.data.session;
      // [v0.7.0] Simpan projectId (UUID) untuk fetch daftar materi (mention @materi-N).
      if (session.project_id) {
        this.projectId = session.project_id;
        this.loadMateriMentions?.();
      }
      const pageContext = this.safeParseJson(session.page_context || session.pageContext, {});

      const alias = session.student_alias || pageContext.session_meta?.display_name;
      if (alias) {
        sessionStorage.setItem('alb_student_name', alias);
      }

      const parsedElements = Array.isArray(pageContext.elements) ? pageContext.elements : [];

      // PERBAIKAN: Pastikan kita menyimpan state yang konsisten
      this.contextData = {
        ...pageContext,
        sourceUrl: session.source_url || pageContext.sourceUrl || pageContext.url || '',
        elements: parsedElements
      };

      // PERBAIKAN: Selalu sinkronkan DB truth ke local storage sebagai fallback
      sessionStorage.setItem('alb_external_context', JSON.stringify(this.contextData));
      this.updateConnectedCourseHeader?.();

      const displayTitle = pageContext.heading || pageContext.title || 'Halaman VClass';

      this.$elTitle.text(displayTitle);
      this.$elWelcome.text(displayTitle);

      if (session.source_url) {
        this.$btnBack.html('<i class="fa-solid fa-arrow-left mr-2"></i> Kembali ke VClass');
        this.$btnBack.off('click').on('click', () => {
          if (this.navigateSourceTab) this.navigateSourceTab(session.source_url, '', {});
          else window.open(session.source_url, '_blank');
        });
        this.$btnConfirmLeave.off('click').on('click', () => {
          if (this.navigateSourceTab) this.navigateSourceTab(session.source_url, '', {});
          else window.open(session.source_url, '_blank');
        });
      }

      let matchedTemplate = false;

      // [v0.3.0] Utamakan mapping konteks dari widget (judul/heading di sessionStorage)
      // ke folder /public/elements. Folder = sumber kebenaran "Element Halaman".
      const pageKey = resolvePageKeyFromContext(this.contextData || {});
      if (this.contextData.elements.length === 0 && pageKey && typeof this.applyPageElements === 'function') {
        matchedTemplate = await this.applyPageElements(pageKey, { silent: true, keepTitle: true });
      }

      // Fallback lama: coba template DB jika konteks tidak cocok ke folder manapun.
      if (!matchedTemplate && this.contextData.elements.length === 0 && typeof this.autoMatchTemplateFromContext === 'function') {
        matchedTemplate = await this.autoMatchTemplateFromContext();
      }

      if (!matchedTemplate) {
        this.renderElementList();
      }

      await this.loadSessionState();
      await this.loadChatHistory();
      if (typeof this.ensureLmsStudentIdentity === 'function') {
        await this.ensureLmsStudentIdentity({ silent: true });
      }
    }
  } catch (e) {
    console.error('Gagal load session context', e);
    this.$elTitle.text('Konteks tidak tersedia');
    this.renderElementList();
  }
}

export async function loadSessionState() {
  try {
    const res = await ApiService.get(`/chat/state/${this.sessionId}`);
    if (res.status === 'success' && res.data) {
      const { ai_usage, safety_state } = res.data;
      if (ai_usage) this.updateAiUsageUI(ai_usage);
      if (safety_state?.locked) this.handleLockdown(true);
    }
  } catch (e) {
    console.error('Gagal memuat session state', e);
  }
}

export async function loadChatHistory() {
  try {
    const res = await ApiService.get(`/chat/history/${this.sessionId}`);
    if (res.status === 'success' && res.data && res.data.length > 0) {
      this.$chatArea.empty();
      res.data.forEach(msg => {
        const isUser = msg.role === 'user';
        const source = msg.context_used?.response_source || 'system';
        const actions = msg.context_used?.actions || [];
        // [v0.9.0] Riwayat lama TIDAK boleh mengunci input. Tombol feedback pada
        // pesan historis sudah basi, jadi jangan picu lock "Klik Sudah jelas…".
        // Lockdown/cooldown nyata tetap ditangani loadSessionState terpisah.
        this.appendBubble(msg.message, isUser, source, actions, { noFeedbackLock: true });
      });

      // [v0.9.0] Tandai bahwa sesi lama dibuka kembali: divider waktu di bawah
      // riwayat, supaya siswa paham percakapan ini adalah lanjutan sesi sebelumnya.
      this.appendSessionReopenDivider?.();

      this.scrollToBottom();
    }
  } catch (e) {
    console.error('Gagal memuat history', e);
  }
}

// Divider "Sesi chat dibuka kembali pada <jam>" — dipanggil setelah riwayat termuat.
export function appendSessionReopenDivider() {
  if (!this.$chatArea?.length) return;

  const now = new Date();
  const jam = now.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
  });
  const tanggal = now.toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta'
  });

  this.$chatArea.append(`
    <div class="alb-session-reopen-divider flex items-center gap-3 my-2 select-none" data-alb-reopen-divider="1">
      <div class="flex-1 h-px bg-hairline"></div>
      <div class="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-soft bg-canvas-soft border border-hairline rounded-full px-3 py-1">
        <i class="fa-solid fa-clock-rotate-left text-[10px]"></i>
        Sesi dibuka kembali · ${tanggal}, ${jam} WIB
      </div>
      <div class="flex-1 h-px bg-hairline"></div>
    </div>
  `);
}

// [v0.9.8] Divider khusus saat konteks halaman diganti (beda gaya dgn "sesi dibuka kembali").
// Pakai aksen primary + ikon tukar agar jelas ini perpindahan konteks tab, bukan jawaban chat.
export function appendContextSwitchDivider(label = '') {
  if (!this.$chatArea?.length) return;
  const safe = String(label || 'Halaman').replace(/[<>&"]/g, '');
  this.$chatArea.append(`
    <div class="alb-context-switch-divider flex items-center gap-3 my-2 select-none" data-alb-context-divider="1">
      <div class="flex-1 h-px bg-primary/20"></div>
      <div class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
        <i class="fa-solid fa-right-left text-[10px]"></i>
        Konteks halaman: ${safe}
      </div>
      <div class="flex-1 h-px bg-primary/20"></div>
    </div>
  `);
  this.$chatArea[0]?.scrollTo?.({ top: this.$chatArea[0].scrollHeight, behavior: 'smooth' });
}

export async function createOrLoadSession() {
  if (this.urlSessionId) {
    this.sessionId = this.urlSessionId;
    sessionStorage.setItem('alb_ai_session_' + this.projectKey, this.sessionId);
    return;
  }

  // [v0.9.13] Ganti course konteks: buat SESI BARU untuk course terpilih (lewati reuse).
  try {
    const rawSwitch = sessionStorage.getItem('alb:switchCourse');
    if (rawSwitch) {
      sessionStorage.removeItem('alb:switchCourse');
      const sw = JSON.parse(rawSwitch);
      const active = JSON.parse(localStorage.getItem(`alb:${window.location.host || 'localhost'}:${this.projectKey}:active-student`) || '{}');
      const res = await ApiService.post('/chat/session', {
        projectKey: this.projectKey,
        sourceUrl: this.contextData?.sourceUrl || window.location.href,
        pageContext: this.contextData || { title: document.title },
        moodleContext: {
          course_id: sw.id,
          course_title: sw.title || sw.shortname || '',
          email: active.email || null,
          moodle_user_id: active.moodle_user_id || null,
          student_name: active.fullname || null
        }
      });
      if (res.status === 'success') {
        this.sessionId = res.data.session.id;
        sessionStorage.setItem('alb_ai_session_' + this.projectKey, this.sessionId);
        Toast.show(`Konteks course diganti ke: ${sw.title || sw.shortname || 'course baru'}`, 'success');
        return;
      }
    }
  } catch (e) { console.warn('[Buddy] Gagal ganti course konteks:', e); }

  let existingSession = sessionStorage.getItem('alb_ai_session_' + this.projectKey);
  if (existingSession) {
    this.sessionId = existingSession;
    return;
  }

  // [PATCH] Cek localStorage untuk session reusable sebelum buat baru
  try {
    const host = window.location.host || 'localhost';
    const activeStudentRaw = localStorage.getItem(`alb:${host}:${this.projectKey}:active-student`);
    if (activeStudentRaw) {
      const activeStudent = JSON.parse(activeStudentRaw);
      if (activeStudent.email && activeStudent.class_code) {
        const reuseQuery = new URLSearchParams({
          projectKey: this.projectKey || '',
          email: activeStudent.email,
          classCode: activeStudent.class_code
        }).toString();

        const reuseRes = await ApiService.get(`/student-sessions/reuse?${reuseQuery}`).catch(() => null);
        if (reuseRes?.status === 'success' && reuseRes.data?.found && reuseRes.data?.session?.session_id) {
          this.sessionId = reuseRes.data.session.session_id;
          sessionStorage.setItem('alb_ai_session_' + this.projectKey, this.sessionId);
          return; // Berhasil melanjutkan sesi lama
        }
      }
    }
  } catch (e) {
    console.warn('Gagal membaca reusable session:', e);
  }

  // Fallback: Buat sesi baru jika tidak ada sesi yang bisa di-reuse
  try {
    const payload = {
      projectKey: this.projectKey,
      sourceUrl: this.contextData?.sourceUrl || window.location.href,
      pageContext: this.contextData || { title: document.title }
    };
    if (this.mode === 'external') payload.mode = 'external';

    const res = await ApiService.post('/chat/session', payload);
    if (res.status === 'success') {
      this.sessionId = res.data.session.id;
      sessionStorage.setItem('alb_ai_session_' + this.projectKey, this.sessionId);
    }
  } catch (e) {
    console.error('Gagal inisiasi sesi chat', e);
    Toast.show('Gagal terhubung ke server', 'error');
  }
}

export function loadSessionData() {
  try {
    const rawContext = sessionStorage.getItem('alb_external_context');
    if (rawContext) {
      this.contextData = JSON.parse(rawContext);
      this.$elTitle.text(this.contextData.title || 'Halaman VClass');
      this.$elWelcome.text(this.contextData.title || 'Halaman VClass');
      this.updateConnectedCourseHeader?.();
    }
    const rawConfig = sessionStorage.getItem('alb_external_config');
    if (rawConfig) {
      const config = JSON.parse(rawConfig);
      let theme = config.theme;
      if (typeof theme === 'string') theme = JSON.parse(theme);
      if (!this.contextData?.session_meta?.display_name) {
        this.$chatTitle.text(theme?.title || 'AI Learning Buddy');
        this.$chatSubtitle.text(theme?.subtitle || 'Tanya materi atau panduan VClass');
      } else {
        this.updateConnectedCourseHeader?.();
      }
    }
  } catch (e) {
    console.error('Gagal parse session data', e);
  }
}


function getNested(obj, path, fallback = null) {
  try {
    return path.split('.').reduce((acc, key) => acc && acc[key], obj) ?? fallback;
  } catch (_) {
    return fallback;
  }
}

export function getCandidateStudentEmail() {
  const storedIdentity = this.safeParseJson?.(sessionStorage.getItem('alb_student_lms_identity'), null) || null;
  return (
    storedIdentity?.email ||
    sessionStorage.getItem('alb_student_email') ||
    getNested(this.contextData, 'session_meta.email') ||
    getNested(this.contextData, 'moodleContext.email') ||
    getNested(this.contextData, 'moodle_context.email') ||
    getNested(this.contextData, 'user.email') ||
    ''
  );
}

export function getCandidateClassCode() {
  const storedIdentity = this.safeParseJson?.(sessionStorage.getItem('alb_student_lms_identity'), null) || null;
  return (
    storedIdentity?.class_code ||
    sessionStorage.getItem('alb_student_class_code') ||
    getNested(this.contextData, 'session_meta.class_code') ||
    getNested(this.contextData, 'session_meta.kelas') ||
    getNested(this.contextData, 'moodleContext.class_code') ||
    getNested(this.contextData, 'course_context.class_code') ||
    ''
  );
}

export function applyStudentIdentity(identity = {}) {
  if (!identity || !identity.found) return;

  const primaryCourse = identity.enrolled_courses?.[0] || {};
  this.contextData = {
    ...(this.contextData || {}),
    session_meta: {
      ...((this.contextData || {}).session_meta || {}),
      display_name: identity.fullname || identity.email,
      moodle_verified: true,
      moodle_user_id: identity.moodle_user_id,
      username: identity.username,
      email: identity.email,
      class_code: identity.class_code || primaryCourse.class_code || null,
      course_id: identity.course_id || primaryCourse.course_id || null,
      course_title: identity.course_title || primaryCourse.course_title || null,
      enrolled_courses: identity.enrolled_courses || []
    }
  };

  sessionStorage.setItem('alb_external_context', JSON.stringify(this.contextData));
  sessionStorage.setItem('alb_student_name', identity.fullname || identity.email || 'Siswa');
  sessionStorage.setItem('alb_student_email', identity.email || '');
  sessionStorage.setItem('alb_student_class_code', identity.class_code || primaryCourse.class_code || '');
  sessionStorage.setItem('alb_student_lms_identity', JSON.stringify(identity));

  this.updateConnectedCourseHeader?.();
}

export async function resolveStudentIdentityByEmail(email, classCode = '') {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { found: false, message: 'Email tidak valid.' };
  }

  const res = await ApiService.post('/moodle/student/resolve', {
    projectKey: this.projectKey,
    sessionId: this.sessionId,
    email: cleanEmail,
    classCode: String(classCode || '').trim().toUpperCase()
  });

  if (res?.status === 'success' && res.data) {
    if (res.data.found) this.applyStudentIdentity?.(res.data);
    return res.data;
  }

  return { found: false, message: res?.message || 'Siswa tidak ditemukan.' };
}

export function showStudentIdentityModal(defaultEmail = '', reason = '') {
  return new Promise((resolve) => {
    $('#alb-student-identity-modal').remove();

    const emailValue = this.escapeHtml ? this.escapeHtml(defaultEmail || '') : String(defaultEmail || '');
    const classValue = this.escapeHtml ? this.escapeHtml(this.getCandidateClassCode?.() || '') : String(this.getCandidateClassCode?.() || '');
    const reasonHtml = reason
      ? `<div class="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">${this.escapeHtml ? this.escapeHtml(reason) : reason}</div>`
      : '';

    const html = `
      <div id="alb-student-identity-modal" class="fixed inset-0 z-[9500] bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-surface-card w-full max-w-[420px] rounded-2xl shadow-2xl border border-hairline p-6">
          <div class="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center text-2xl mb-4">
            <i class="fa-solid fa-id-card-clip"></i>
          </div>
          <h2 class="font-serif text-2xl text-ink mb-2">Verifikasi Siswa VClass</h2>
          <p class="text-[14px] text-body leading-relaxed mb-4">Masukkan email Moodle/VClass dan kelas kamu. Sistem akan mengecek apakah email tersebut benar-benar terdaftar di kelas yang dipilih.</p>
          ${reasonHtml}
          <label class="block text-[12px] font-bold text-muted uppercase tracking-wide mb-1">Email Moodle</label>
          <input id="alb-student-email-input" type="email" value="${emailValue}" class="w-full bg-canvas border border-hairline-strong rounded-xl px-4 py-3 text-[14px] text-ink focus:outline-none focus:border-primary mb-3" placeholder="nama@smpn167jakarta.sch.id">
          <label class="block text-[12px] font-bold text-muted uppercase tracking-wide mb-1">Kelas</label>
          <input id="alb-student-class-input" type="text" value="${classValue}" class="w-full bg-canvas border border-hairline-strong rounded-xl px-4 py-3 text-[14px] text-ink focus:outline-none focus:border-primary mb-3 uppercase" placeholder="Contoh: 8A atau 9A">
          <div id="alb-student-verify-status" class="hidden text-[13px] mb-3"></div>
          <div class="flex gap-2 justify-end">
            <button type="button" id="alb-student-skip" class="px-4 py-2 rounded-xl border border-hairline-strong text-muted hover:text-ink hover:bg-surface-strong text-[13px] font-semibold">Lewati dulu</button>
            <button type="button" id="alb-student-verify" class="px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-active text-[13px] font-bold shadow-sm"><i class="fa-solid fa-magnifying-glass mr-1"></i> Cek Siswa</button>
          </div>
        </div>
      </div>`;

    $('body').append(html);
    $('#alb-student-email-input').focus();

    $('#alb-student-skip').on('click', () => {
      $('#alb-student-identity-modal').remove();
      resolve(false);
    });

    $('#alb-student-verify').on('click', async () => {
      const email = $('#alb-student-email-input').val().trim();
      const classCode = $('#alb-student-class-input').val().trim().toUpperCase();
      const $status = $('#alb-student-verify-status');
      const $btn = $('#alb-student-verify');

      if (!email || !email.includes('@')) {
        $status.removeClass('hidden text-emerald-700 text-rose-700').addClass('text-rose-700').text('Masukkan email yang valid.');
        return;
      }
      if (!classCode) {
        $status.removeClass('hidden text-emerald-700 text-rose-700').addClass('text-rose-700').text('Masukkan kelas kamu, contoh: 8A atau 9A.');
        return;
      }

      $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin mr-1"></i> Mengecek...');
      $status.removeClass('hidden text-rose-700 text-emerald-700').addClass('text-muted').text('Mengecek daftar user Moodle...');

      try {
        const identity = await this.resolveStudentIdentityByEmail?.(email, classCode);
        if (identity?.found) {
          $status.removeClass('text-muted text-rose-700').addClass('text-emerald-700').html(`<i class="fa-solid fa-check"></i> Ditemukan: ${this.escapeHtml ? this.escapeHtml(identity.fullname || identity.email) : identity.fullname}`);
          setTimeout(() => {
            $('#alb-student-identity-modal').remove();
            resolve(true);
          }, 600);
        } else {
          $status.removeClass('text-muted text-emerald-700').addClass('text-rose-700').text(identity?.message || 'Email ini tidak ditemukan di course Moodle project ini.');
        }
      } catch (error) {
        $status.removeClass('text-muted text-emerald-700').addClass('text-rose-700').text('Gagal mengecek siswa: ' + (error.message || 'unknown error'));
      } finally {
        $btn.prop('disabled', false).html('<i class="fa-solid fa-magnifying-glass mr-1"></i> Cek Siswa');
      }
    });
  });
}

export async function ensureLmsStudentIdentity(options = {}) {
  if (this.studentIdentityChecked) return true;
  if (!this.projectKey || !this.sessionId) return false;

  const existing = this.safeParseJson?.(sessionStorage.getItem('alb_student_lms_identity'), null) || null;
  if (existing?.found && existing?.email) {
    this.applyStudentIdentity?.(existing);
    this.studentIdentityChecked = true;
    return true;
  }

  const candidateEmail = this.getCandidateStudentEmail?.() || '';
  const candidateClassCode = this.getCandidateClassCode?.() || '';

  if (candidateEmail && candidateClassCode) {
    const identity = await this.resolveStudentIdentityByEmail(candidateEmail, candidateClassCode);
    if (identity?.found) {
      this.studentIdentityChecked = true;
      return true;
    }
    if (options.silent) {
      this.studentIdentityChecked = true;
      await this.showStudentIdentityModal?.(candidateEmail, identity?.message || 'Email dari sesi belum cocok dengan daftar user Moodle.');
      return false;
    }
  }

  this.studentIdentityChecked = true;
  await this.showStudentIdentityModal?.(candidateEmail, 'Agar jawaban deadline/tugas lebih akurat, verifikasi email Moodle kamu terlebih dahulu.');
  return false;
}
