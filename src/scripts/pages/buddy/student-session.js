// ============================================================
// student-session.js — Identitas siswa aktif, sesi reuse harian, gate form email+kelas,
// dan tombol/modal hapus sesi. [v0.9.7] Diekstrak dari events.js.
// ============================================================
import $ from 'jquery';
import Toast from '../../components/toast.js';
import { ApiService } from '../../fetch/api.js';

function getVerifiedStudentKey(context, email = '', classCode = '') {
  const host = window.location.host || 'localhost';
  const projectKey = context?.projectKey || context?.project_key || 'default-project';
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanClass = String(classCode || '').trim().toUpperCase();
  return `alb:${host}:${projectKey}:student-session:${cleanEmail}:${cleanClass}`;
}

export function readActiveStudentIdentity(context) {
  try {
    const host = window.location.host || 'localhost';
    const projectKey = context?.projectKey || context?.project_key || 'default-project';
    const raw = localStorage.getItem(`alb:${host}:${projectKey}:active-student`);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function writeActiveStudentIdentity(context, identity = {}) {
  try {
    const host = window.location.host || 'localhost';
    const projectKey = context?.projectKey || context?.project_key || 'default-project';
    localStorage.setItem(`alb:${host}:${projectKey}:active-student`, JSON.stringify({ ...identity, savedAt: Date.now() }));
  } catch (_) {}
}

export function persistReusableStudentSession(context, identity = {}) {
  // [FIX SM-4] Email & kelas sering tidak ada di `identity` yang dioper (mis. saat
  // dipanggil setelah kirim pesan). Ambil dari identitas terverifikasi di
  // sessionStorage / contextData supaya kunci reuse benar-benar tertulis.
  let lmsIdentity = {};
  try { lmsIdentity = JSON.parse(sessionStorage.getItem('alb_student_lms_identity') || '{}') || {}; } catch (_) { lmsIdentity = {}; }
  const meta = (context?.contextData && context.contextData.session_meta) || {};

  const email = identity.email || identity.student_email || identity.username
    || lmsIdentity.email || sessionStorage.getItem('alb_student_email') || meta.email || '';
  const classCode = identity.class_code || identity.classCode || identity.kelas
    || lmsIdentity.class_code || sessionStorage.getItem('alb_student_class_code') || meta.class_code || '';
  const sessionId = identity.sessionId || identity.session_id || context?.sessionId || '';
  if (!email || !classCode || !sessionId) return;

  // Lengkapi atribut lain dari identitas terverifikasi bila kosong.
  identity = {
    moodle_user_id: lmsIdentity.moodle_user_id || meta.moodle_user_id,
    fullname: lmsIdentity.fullname || meta.display_name,
    course_id: lmsIdentity.course_id || meta.course_id,
    course_title: lmsIdentity.course_title || meta.course_title,
    ...identity
  };

  const payload = {
    sessionId,
    email: String(email).trim().toLowerCase(),
    class_code: String(classCode).trim().toUpperCase(),
    moodle_user_id: identity.moodle_user_id || identity.userid || null,
    fullname: identity.fullname || identity.display_name || identity.name || '',
    course_id: identity.course_id || identity.courseId || null,
    course_title: identity.course_title || '',
    savedAt: Date.now()
  };

  localStorage.setItem(getVerifiedStudentKey(context, payload.email, payload.class_code), JSON.stringify(payload));
  writeActiveStudentIdentity(context, payload);

  // Simpan registry kecil di DB supaya 1 siswa dapat memakai 1 session yang sama.
  // Kalau endpoint belum dipasang, localStorage tetap menjadi fallback.
  ApiService.post('/student-sessions/register', {
    projectKey: context?.projectKey,
    projectId: context?.projectId,
    sessionId: payload.sessionId,
    email: payload.email,
    classCode: payload.class_code,
    student_name: payload.fullname,
    moodle_user_id: payload.moodle_user_id,
    course_id: payload.course_id,
    course_title: payload.course_title
  }).catch(() => null);
}

function readReusableStudentSession(context, email = '', classCode = '') {
  try {
    const raw = localStorage.getItem(getVerifiedStudentKey(context, email, classCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.sessionId ? parsed : null;
  } catch (_) { return null; }
}

function removeReusableStudentSession(context) {
  const active = readActiveStudentIdentity(context);
  if (active?.email && active?.class_code) {
    localStorage.removeItem(getVerifiedStudentKey(context, active.email, active.class_code));
  }
  const host = window.location.host || 'localhost';
  const projectKey = context?.projectKey || context?.project_key || 'default-project';
  localStorage.removeItem(`alb:${host}:${projectKey}:active-student`);
  sessionStorage.removeItem('alb_student_name');
  sessionStorage.removeItem('alb_student_email');
  sessionStorage.removeItem('alb_student_class');
}

export function hydrateReusableSessionIfAvailable(context) {
  const active = readActiveStudentIdentity(context);
  if (!active?.sessionId) return false;
  if (context.sessionId && String(context.sessionId) === String(active.sessionId)) return true;

  context.sessionId = active.sessionId;
  context.contextData = {
    ...(context.contextData || {}),
    session_meta: {
      ...(context.contextData?.session_meta || {}),
      email: active.email,
      class_code: active.class_code,
      moodle_user_id: active.moodle_user_id || null,
      display_name: active.fullname || active.email,
      course_id: active.course_id || null,
      course_title: active.course_title || null,
      moodle_verified: true
    }
  };
  return true;
}


function ensureDeleteSessionModal(context) {
  if ($('#alb-delete-session-modal').length) return;

  // [v0.9.27 #6] Dua pilihan jelas: bersihkan tampilan saja vs hapus sesi.
  $('body').append(`
    <div id="alb-delete-session-modal" class="hidden fixed inset-0 z-[9999] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white border border-hairline rounded-2xl shadow-2xl w-full max-w-[460px] overflow-hidden">
        <div class="px-5 pt-5 pb-3">
          <h3 class="text-[17px] font-black text-ink mb-1">Mau bersihkan yang mana?</h3>
          <p class="text-[13px] text-muted leading-6">Pilih salah satu ya. Keduanya beda efeknya:</p>
        </div>
        <div class="px-5 pb-2 space-y-2.5">
          <button type="button" id="alb-clear-chat-only" class="w-full text-left rounded-xl border border-hairline hover:border-primary/40 hover:bg-primary/5 px-4 py-3 transition-colors flex items-start gap-3">
            <span class="w-9 h-9 shrink-0 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mt-0.5"><i class="fa-solid fa-broom"></i></span>
            <span class="min-w-0">
              <span class="block text-[14px] font-bold text-ink">Hapus Chat (bersihkan tampilan)</span>
              <span class="block text-[12px] text-muted-soft leading-snug mt-0.5">Pesan di layar dibersihkan sekarang. Tapi kalau halaman ini <b>dibuka lagi, chatmu muncul kembali</b> (riwayat tetap tersimpan).</span>
            </span>
          </button>
          <button type="button" id="alb-confirm-delete-session" class="w-full text-left rounded-xl border border-red-200 hover:border-red-400 hover:bg-red-50 px-4 py-3 transition-colors flex items-start gap-3">
            <span class="w-9 h-9 shrink-0 rounded-lg bg-red-50 text-red-600 flex items-center justify-center mt-0.5"><i class="fa-solid fa-trash-can"></i></span>
            <span class="min-w-0">
              <span class="block text-[14px] font-bold text-red-700">Hapus Sesi (mulai dari awal)</span>
              <span class="block text-[12px] text-muted-soft leading-snug mt-0.5">Sesi & riwayat dihapus permanen. Saat dibuka lagi, <b>riwayat TIDAK muncul</b> — kamu mulai sesi baru dari awal.</span>
            </span>
          </button>
        </div>
        <div class="p-4 flex items-center justify-end gap-2 bg-canvas-soft">
          <button type="button" id="alb-cancel-delete-session" class="px-4 py-2 rounded-full border border-hairline bg-white text-[13px] font-bold text-ink hover:bg-surface-strong">Batal</button>
        </div>
      </div>
    </div>
  `);

  $('#alb-cancel-delete-session').on('click', () => $('#alb-delete-session-modal').addClass('hidden'));
  $('#alb-delete-session-modal').on('click', function (e) {
    if (e.target === this) $(this).addClass('hidden');
  });

  // Hapus Chat = bersihkan tampilan saja (sesi & riwayat DB tetap → reload saat dibuka lagi).
  $('#alb-clear-chat-only').on('click', () => {
    try {
      if (context.$chatArea?.length) context.$chatArea.empty();
      context._lastBotMessageWaitsForFeedback = false;
      if (context.$inputArea?.length) context.$inputArea.prop('disabled', false).attr('placeholder', 'Tanya sesuatu atau pilih elemen...');
      if (context.$btnSend?.length) context.$btnSend.prop('disabled', false);
    } catch (_) {}
    $('#alb-delete-session-modal').addClass('hidden');
    Toast.show('Tampilan chat dibersihkan. Riwayat tetap tersimpan.', 'success');
  });

  $('#alb-confirm-delete-session').on('click', async function () {
    const $btn = $(this);
    const oldText = $btn.html();
    $btn.prop('disabled', true).addClass('opacity-70 cursor-not-allowed').html('<i class="fa-solid fa-spinner fa-spin mr-1"></i> Menghapus...');

    const oldSessionId = context.sessionId;
    removeReusableStudentSession(context);

    try {
      if (oldSessionId) {
        await ApiService.delete(`/student-sessions/session/${oldSessionId}`).catch(() => null);
        await ApiService.delete(`/chat/session/${oldSessionId}`).catch(() => null);
      }
      Toast.show('Session sudah dihapus. Silakan mulai sesi ulang.', 'success');
      $('#alb-delete-session-modal').addClass('hidden');
      setTimeout(() => {
        window.location.href = `/buddy?projectKey=${encodeURIComponent(context.projectKey || '')}`;
      }, 450);
    } catch (error) {
      console.error('[Delete Session] gagal:', error);
      Toast.show('Gagal menghapus session.', 'error');
      $btn.prop('disabled', false).removeClass('opacity-70 cursor-not-allowed').html(oldText);
    }
  });
}

export function ensureDeleteSessionButton(context) {
  const $chip = context.$btnSessionInfo || $('#btn-session-info, #alb-session-chip, [data-alb-session-chip]').first();
  if (!$chip?.length) return;

  const $header = $chip.closest('header');
  let $wrap = $('#alb-session-actions-wrap');

  if (!$wrap.length) {
    $wrap = $('<div id="alb-session-actions-wrap" class="flex items-center gap-2 shrink-0"></div>');

    if ($header.length) {
      const $deleteExisting = $('#alb-delete-session-btn');
      $chip.before($wrap);
      $wrap.append($chip.detach());
      if ($deleteExisting.length) $wrap.append($deleteExisting.detach());
    } else {
      $chip.wrap($wrap);
      $wrap = $('#alb-session-actions-wrap');
    }
  } else if (!$chip.closest('#alb-session-actions-wrap').length) {
    $wrap.prepend($chip.detach());
  }

  $chip.removeClass('ml-2').addClass('shrink-0');

  if ($('#alb-delete-session-btn').length) {
    const $existing = $('#alb-delete-session-btn')
      .removeClass('ml-2')
      .addClass('shrink-0')
      .appendTo($wrap);

    $existing.off('click.albDeleteSession').on('click.albDeleteSession', () => {
      ensureDeleteSessionModal(context);
      $('#alb-delete-session-modal').removeClass('hidden');
    });
    return;
  }

  const $btn = $(`
    <button type="button" id="alb-delete-session-btn" class="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-[11px] font-bold text-muted hover:bg-surface-strong hover:text-ink transition-colors shrink-0" title="Bersihkan chat atau hapus sesi">
      <i class="fa-solid fa-trash-can"></i>
      <span class="hidden sm:inline">Bersihkan / Hapus</span>
    </button>
  `);

  $wrap.append($btn);
  $btn.on('click', () => {
    ensureDeleteSessionModal(context);
    $('#alb-delete-session-modal').removeClass('hidden');
  });
}

function findExternalSessionFields() {
  const $email = $('#alb-student-email, #student-email, #student_email, input[name="student_email"], input[name="email"]').filter(':visible').first();
  const $class = $('#alb-student-class, #student-class, #student_class, select[name="classCode"], select[name="class_code"], select[name="kelas"]').filter(':visible').first();
  const $start = $('#alb-btn-start-session, #btn-start-session, [data-alb-start-session], button:contains("Mulai sesi"), button:contains("Mulai Sesi")').filter(':visible').first();
  return { $email, $class, $start };
}

export function bindExternalSessionGate(context) {
  const { $email, $class, $start } = findExternalSessionFields();
  if (!$start.length || $start.data('albGateBound')) return;
  $start.data('albGateBound', true);

  let verifiedIdentity = null;
  const setStartEnabled = (enabled, message = '') => {
    $start.prop('disabled', !enabled)
      .toggleClass('opacity-60 cursor-not-allowed', !enabled)
      .attr('title', enabled ? 'Mulai sesi AI Buddy' : (message || 'Isi email dan kelas terlebih dahulu'));
  };

  const validate = async () => {
    const email = String($email.val() || '').trim().toLowerCase();
    const classCode = String($class.val() || '').trim().toUpperCase();
    verifiedIdentity = null;

    if (!email || !email.includes('@') || !classCode) {
      setStartEnabled(false, 'Isi email Moodle dan kelas terlebih dahulu.');
      return;
    }

    const reusable = readReusableStudentSession(context, email, classCode);
    if (reusable?.sessionId) {
      context.sessionId = reusable.sessionId;
      persistReusableStudentSession(context, reusable);
      verifiedIdentity = reusable;
      setStartEnabled(true);
      Toast.show('Session lama siswa ditemukan. Sesi akan dilanjutkan.', 'success');
      return;
    }

    const reuseQuery = new URLSearchParams({ projectKey: context.projectKey || '', projectId: context.projectId || '', email, classCode }).toString();
    const reuseRes = await ApiService.get(`/student-sessions/reuse?${reuseQuery}`).catch(() => null);
    if (reuseRes?.status === 'success' && reuseRes.data?.found && reuseRes.data?.session?.session_id) {
      const oldSession = reuseRes.data.session;
      const reusableFromDb = {
        sessionId: oldSession.session_id,
        email: oldSession.student_email || email,
        class_code: oldSession.class_code || classCode,
        fullname: oldSession.student_name || '',
        moodle_user_id: oldSession.moodle_user_id || null,
        course_id: oldSession.course_id || null,
        course_title: oldSession.course_title || ''
      };
      context.sessionId = reusableFromDb.sessionId;
      persistReusableStudentSession(context, reusableFromDb);
      verifiedIdentity = reusableFromDb;
      setStartEnabled(true);
      Toast.show('Session lama siswa ditemukan dari server. Sesi dilanjutkan.', 'success');
      return;
    }

    setStartEnabled(false, 'Sedang memvalidasi email ke Moodle...');
    const res = await ApiService.post('/moodle/student/resolve', {
      projectKey: context.projectKey,
      projectId: context.projectId,
      sessionId: context.sessionId,
      email,
      classCode
    });

    if (res?.status === 'success' && res.data?.found) {
      verifiedIdentity = { ...res.data, email, class_code: res.data.class_code || classCode, sessionId: context.sessionId };
      persistReusableStudentSession(context, verifiedIdentity);
      sessionStorage.setItem('alb_student_email', email);
      sessionStorage.setItem('alb_student_class', verifiedIdentity.class_code || classCode);
      setStartEnabled(true);
      Toast.show('Email Moodle valid. Sesi bisa dimulai.', 'success');
    } else {
      setStartEnabled(false, res?.data?.message || res?.message || 'Email tidak ditemukan di kelas tersebut.');
      Toast.show(res?.data?.message || res?.message || 'Email tidak ditemukan di Moodle untuk kelas itu.', 'error');
    }
  };

  setStartEnabled(false, 'Isi email Moodle dan kelas terlebih dahulu.');
  $email.add($class).on('input change blur', () => {
    clearTimeout(window.__albSessionGateTimer);
    window.__albSessionGateTimer = setTimeout(validate, 450);
  });

  $start.on('click', (event) => {
    const email = String($email.val() || '').trim().toLowerCase();
    const classCode = String($class.val() || '').trim().toUpperCase();
    const reusable = readReusableStudentSession(context, email, classCode);
    if (reusable?.sessionId) {
      context.sessionId = reusable.sessionId;
      persistReusableStudentSession(context, reusable);
      return;
    }
    if (!verifiedIdentity) {
      event.preventDefault();
      event.stopImmediatePropagation();
      validate();
    }
  });
}
