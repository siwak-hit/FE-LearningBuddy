// ============================================================
// safety-overlays.js — Overlay cooldown kuota AI & lockdown bahasa (profanity),
// plus persistensi state-nya di localStorage. [v0.9.7] Diekstrak dari events.js.
// Semua fungsi menerima `context` (BuddyPage) dan memanggil method context bila ada.
// ============================================================
import $ from 'jquery';
import Toast from '../../components/toast.js';
import { ApiService } from '../../fetch/api.js';

const AI_COOLDOWN_FALLBACK_SECONDS = 180;

function getLocalScopeKey(context, suffix) {
  const host = window.location.host || 'localhost';
  const projectKey = context?.projectKey || context?.project_key || 'default-project';
  return `alb:${host}:${projectKey}:${suffix}`;
}

// [FIX] Nama siswa sering sudah diketahui (verifikasi identitas) tapi tidak selalu ada di
// sessionStorage → dulu field nama di overlay lockdown tampil kosong & unlock minta "isi nama".
// Ambil dari semua sumber yang mungkin.
function resolveKnownStudentName(context) {
  return String(
    context?.studentName ||
    context?.contextData?.session_meta?.display_name ||
    context?.sessionMeta?.display_name ||
    sessionStorage.getItem('alb_student_name') || ''
  ).trim();
}

export function persistLockdown(context, locked = true, extra = {}) {
  const key = getLocalScopeKey(context, 'lockdown');
  if (!locked) {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, JSON.stringify({
    locked: true,
    reason: extra.reason || 'profanity_limit',
    warnings: Number(extra.warnings || 3),
    savedAt: Date.now()
  }));
}

export function readPersistedLockdown(context) {
  try {
    const raw = localStorage.getItem(getLocalScopeKey(context, 'lockdown'));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.locked ? parsed : null;
  } catch (_) {
    return null;
  }
}

function ensureFullScreenCooldownOverlay(context, remainingOverride = null) {
  const remainingSeconds = Number(
    remainingOverride || context?.aiUsage?.cooldown_remaining_seconds || AI_COOLDOWN_FALLBACK_SECONDS
  );

  const endAt = Date.now() + Math.max(1, remainingSeconds) * 1000;
  localStorage.setItem(getLocalScopeKey(context, 'cooldown'), JSON.stringify({ endAt }));

  if (!$('#alb-global-cooldown-overlay').length) {
    $('body').append(`
      <div id="alb-global-cooldown-overlay" class="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
        <div class="w-full max-w-[460px] bg-white rounded-3xl shadow-2xl border border-white/20 p-6 text-center">
          <div class="w-16 h-16 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-2xl mb-4">
            <i class="fa-solid fa-hourglass-half"></i>
          </div>
          <h2 class="text-[22px] font-black text-ink mb-2">AI Buddy sedang cooldown</h2>
          <p class="text-[14px] text-body leading-6 mb-4">Batas penggunaan AI sementara tercapai. Seluruh layar ditahan dulu supaya tidak terjadi request berulang.</p>
          <div class="bg-canvas-soft border border-hairline rounded-2xl p-4">
            <div class="text-[12px] text-muted-soft mb-1">Tunggu sekitar</div>
            <div id="alb-global-cooldown-time" class="text-[34px] font-black text-primary tracking-tight">03:00</div>
          </div>
        </div>
      </div>
    `);
  }

  const tick = () => {
    const remain = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    const minutes = Math.floor(remain / 60).toString().padStart(2, '0');
    const seconds = (remain % 60).toString().padStart(2, '0');
    $('#alb-global-cooldown-time').text(`${minutes}:${seconds}`);

    if (remain <= 0) {
      clearInterval(window.__albGlobalCooldownTimer);
      window.__albGlobalCooldownTimer = null;
      localStorage.removeItem(getLocalScopeKey(context, 'cooldown'));
      $('#alb-global-cooldown-overlay').remove();
      if (context?.aiUsage) {
        context.aiUsage.cooldown_active = false;
        context.aiUsage.cooldown_remaining_seconds = 0;
        context.aiUsage.used = 0;
        context.aiUsage.remaining = Number(context.aiUsage.max || 3);
        context.aiUsage.limit_reached = false;
        context.aiUsage.canUseAI = true;
        if (typeof context.updateAiUsageUI === 'function') context.updateAiUsageUI(context.aiUsage);
      }
      return;
    }
  };

  if (window.__albGlobalCooldownTimer) clearInterval(window.__albGlobalCooldownTimer);
  tick();
  window.__albGlobalCooldownTimer = setInterval(tick, 1000);
}

export function showCooldownToast(context, remainingOverride = null) {
  const remainingSeconds = Number(
    remainingOverride || context.aiUsage?.cooldown_remaining_seconds || AI_COOLDOWN_FALLBACK_SECONDS
  );

  const minutes = Math.floor(remainingSeconds / 60).toString().padStart(2, '0');
  const seconds = (remainingSeconds % 60).toString().padStart(2, '0');

  Toast.show(`Kuota AI Buddy sudah habis. Tunggu ${minutes}:${seconds} lagi.`, 'warning');

  // Pastikan overlay cooldown benar-benar muncul walaupun backend hanya mengirim teks fallback.
  context.aiUsage = {
    ...(context.aiUsage || {}),
    used: Number(context.aiUsage?.used || context.aiUsage?.max || 3),
    max: Number(context.aiUsage?.max || 3),
    remaining: 0,
    limit_reached: true,
    cooldown_active: true,
    cooldown_remaining_seconds: remainingSeconds,
    canUseAI: false
  };

  ensureFullScreenCooldownOverlay(context, remainingSeconds);

  if (typeof context.updateAiUsageUI === 'function') {
    context.updateAiUsageUI(context.aiUsage);
  } else if (typeof context.triggerCooldown === 'function') {
    context.triggerCooldown();
  }
}

export function isCooldownBlocking(context) {
  return Boolean(context.aiUsage?.cooldown_active) || Number(context.aiUsage?.cooldown_remaining_seconds || 0) > 0;
}

export function applyPersistedCooldownIfNeeded(context) {
  try {
    const raw = localStorage.getItem(getLocalScopeKey(context, 'cooldown'));
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const remain = Math.ceil((Number(parsed.endAt || 0) - Date.now()) / 1000);
    if (remain > 0) ensureFullScreenCooldownOverlay(context, remain);
    else localStorage.removeItem(getLocalScopeKey(context, 'cooldown'));
  } catch (_) {}
}

export function ensureLocalLockOverlay(context, persisted = {}) {
  persistLockdown(context, true, persisted);

  if (typeof context?.handleLockdown === 'function') {
    context.handleLockdown(true);
  }

  const knownName = resolveKnownStudentName(context);

  if (!$('#alb-global-lock-overlay').length) {
    $('body').append(`
      <div id="alb-global-lock-overlay" class="fixed inset-0 z-[100000] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
        <div class="w-full max-w-[500px] bg-white rounded-3xl shadow-2xl border border-white/20 p-6">
          <div class="text-center mb-5">
            <div class="w-16 h-16 mx-auto rounded-full bg-red-100 text-red-700 flex items-center justify-center text-2xl mb-4"><i class="fa-solid fa-lock"></i></div>
            <h2 class="text-[22px] font-black text-ink mb-2">Chat dikunci sementara</h2>
            <p class="text-[14px] text-body leading-6">Batas peringatan bahasa kurang pantas sudah mencapai <b>${Number(persisted.warnings || 3)}/3</b>. Minta key pembuka ke guru lewat tombol WhatsApp, lalu masukkan key di bawah.</p>
          </div>
          <button id="alb-global-unlock-wa" type="button" class="w-full bg-green-500 hover:bg-green-600 text-white rounded-xl px-4 py-3 text-[14px] font-bold transition-colors mb-4"><i class="fa-brands fa-whatsapp mr-1"></i> Minta key ke guru via WhatsApp</button>
          <div class="space-y-3">
            <input id="alb-global-unlock-name" type="text" class="w-full bg-canvas-soft border border-hairline rounded-xl px-4 py-3 text-[14px] text-ink outline-none focus:border-primary" placeholder="Nama siswa" value="${knownName.replace(/"/g, '&quot;')}">
            <input id="alb-global-unlock-key" type="text" class="w-full bg-canvas-soft border border-hairline rounded-xl px-4 py-3 text-[14px] text-ink outline-none focus:border-primary" placeholder="Key dari guru (mis. GURU-1234)">
            <button id="alb-global-unlock-submit" type="button" class="w-full bg-primary hover:bg-primary-active text-white rounded-xl px-4 py-3 text-[14px] font-bold transition-colors">Verifikasi & Buka Akses</button>
          </div>
        </div>
      </div>
    `);
  } else if (knownName) {
    // Overlay sudah ada (mis. persisted) → tetap prefill nama bila baru diketahui.
    const $n = $('#alb-global-unlock-name');
    if (!$n.val()) $n.val(knownName);
  }

  // [FIX] Minta key ke guru TIDAK butuh nama — dulu tombol ini keliru minta isi nama dulu.
  $('#alb-global-unlock-wa').off('click').on('click', () => {
    const who = ($('#alb-global-unlock-name').val() || knownName || '').trim();
    const intro = who ? `Halo Pak/Bu, saya ${who}.` : 'Halo Pak/Bu.';
    const text = encodeURIComponent(`${intro} Chat AI Buddy saya terkunci karena peringatan bahasa. Mohon key pembukanya.`);
    window.open(`https://api.whatsapp.com/send/?phone=628989807094&text=${text}`, '_blank', 'noopener,noreferrer');
  });

  $('#alb-global-unlock-submit').off('click').on('click', async () => {
    const name = $('#alb-global-unlock-name').val().trim();
    const key = $('#alb-global-unlock-key').val().trim();
    // [FIX] Cukup key yang wajib. Nama opsional (sering sudah diketahui sistem) — dulu
    // syarat nama bikin unlock ketolak padahal identitas siswa sudah ada.
    if (!key) return Toast.show('Masukkan key dari guru dulu ya.', 'error');

    $('#alb-global-unlock-submit').prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Memverifikasi...');
    try {
      if (name) {
        try {
          await ApiService.patch(`/chat/session/${context.sessionId}/profile`, { student_name: name });
          sessionStorage.setItem('alb_student_name', name);
        } catch (_) {}
      }

      const res = await ApiService.post('/chat/unlock', { sessionId: context.sessionId, key });
      if (res?.status === 'success') {
        persistLockdown(context, false);
        $('#alb-global-lock-overlay').remove();
        context.handleLockdown?.(false);
        Toast.show('Chat berhasil dibuka kembali.', 'success');
      } else {
        Toast.show(res?.message || 'Key salah atau kedaluwarsa.', 'error');
      }
    } catch (err) {
      Toast.show('Gagal menghubungi server.', 'error');
    } finally {
      $('#alb-global-unlock-submit').prop('disabled', false).html('Verifikasi & Buka Akses');
      $('#alb-global-unlock-key').val('');
    }
  });
}

export function applyPersistedLockdownIfNeeded(context) {
  const persisted = readPersistedLockdown(context);
  if (persisted) ensureLocalLockOverlay(context, persisted);
}
