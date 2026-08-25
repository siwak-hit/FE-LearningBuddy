// ============================================================
// safety-overlays.js — Overlay cooldown kuota AI & lockdown bahasa (profanity),
// plus persistensi state-nya di localStorage. [v0.9.7] Diekstrak dari events.js.
// Semua fungsi menerima `context` (BuddyPage) dan memanggil method context bila ada.
// ============================================================
import $ from 'jquery';
import Toast from '../../components/toast.js';
import { readWorkspaceConfig } from './workspace-config.js';

const AI_COOLDOWN_FALLBACK_SECONDS = 180;

function getLocalScopeKey(context, suffix) {
  const host = window.location.host || 'localhost';
  const projectKey = context?.projectKey || context?.project_key || 'default-project';
  return `alb:${host}:${projectKey}:${suffix}`;
}

// [v0.9.94] Switch siswa "Nonaktifkan cooldown" (modal gear Konfigurasi, default ON).
// ponytail: satu predikat dipakai semua jalur cooldown (toast, overlay, persist) — tak ada
// pemanggil yang perlu tahu detail penyimpanannya.
export function isCooldownDisabled(context) {
  return readWorkspaceConfig(context).disable_cooldown === true;
}

// Switch siswa "Nonaktifkan deteksi kata kasar" (default ON).
export function isProfanityDisabled(context) {
  return readWorkspaceConfig(context).disable_profanity === true;
}

// Switch siswa "Kunci chat saat bahasa kasar terdeteksi" (default OFF).
export function isProfanityLockEnabled(context) {
  const cfg = readWorkspaceConfig(context);
  return cfg.lock_profanity === true && cfg.disable_profanity !== true;
}

// Bersihkan sisa cooldown/lockdown saat guru baru saja mematikan fiturnya
// (overlay dari localStorage bisa keburu tampil sebelum flag selesai dimuat).
export function clearSafetyArtifacts(context) {
  if (isCooldownDisabled(context)) {
    if (window.__albGlobalCooldownTimer) clearInterval(window.__albGlobalCooldownTimer);
    window.__albGlobalCooldownTimer = null;
    localStorage.removeItem(getLocalScopeKey(context, 'cooldown'));
    localStorage.removeItem(`alb_ai_cooldown_until_${context?.sessionId || 'default'}`);
    $('#alb-global-cooldown-overlay').remove();
    $('#cooldown-overlay').addClass('hidden');
    context.aiUsage = { used: 0, max: 3, remaining: 3, limit_reached: false, cooldown_active: false, cooldown_remaining_seconds: 0, canUseAI: true };
    context.updateAiUsageUI?.(context.aiUsage);
  }

  if (isProfanityDisabled(context) || !isProfanityLockEnabled(context)) {
    if (window.__albLockTimer) clearInterval(window.__albLockTimer);
    window.__albLockTimer = null;
    persistLockdown(context, false);
    $('#alb-global-lock-overlay').remove();
    context.handleLockdown?.(false);
  }
}

// [v0.9.85] Lockdown bahasa kini BERBASIS TIMER (tanpa key guru) & disimpan di localStorage.
// State: { lockEndAt, minutes, warnings }. Lock aktif selama Date.now() < lockEndAt.
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
    minutes: Number(extra.minutes || 1),
    lockEndAt: Number(extra.lockEndAt || (Date.now() + Number(extra.minutes || 1) * 60000)),
    savedAt: Date.now()
  }));
}

export function readPersistedLockdown(context) {
  try {
    const raw = localStorage.getItem(getLocalScopeKey(context, 'lockdown'));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.locked) return null;
    // Timer sudah lewat → bukan lagi terkunci; bersihkan.
    if (Number(parsed.lockEndAt || 0) <= Date.now()) {
      localStorage.removeItem(getLocalScopeKey(context, 'lockdown'));
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

// Hitung durasi lock (menit) dari jumlah pelanggaran: pelanggaran ke-3 → 1 menit,
// ke-4 → 2 menit, dst. (setiap pelanggaran di atas 2 menambah 1 menit).
export function lockMinutesForWarnings(warnings = 3) {
  return Math.max(1, Number(warnings || 0) - 2);
}

// Dipanggil dari events.js saat respons moderasi (profanity/hate) DAN guru mengaktifkan
// switch penguncian. Menaikkan lock sesuai jumlah warnings (server-authoritative).
export function triggerProfanityLockdown(context, warnings = 3) {
  const minutes = lockMinutesForWarnings(warnings);
  const lockEndAt = Date.now() + minutes * 60000;
  ensureLocalLockOverlay(context, { warnings, minutes, lockEndAt });
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
  if (isCooldownDisabled(context)) return;

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
  if (isCooldownDisabled(context)) return false;
  return Boolean(context.aiUsage?.cooldown_active) || Number(context.aiUsage?.cooldown_remaining_seconds || 0) > 0;
}

export function applyPersistedCooldownIfNeeded(context) {
  if (isCooldownDisabled(context)) return;

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

  const stored = readPersistedLockdown(context) || {};
  const lockEndAt = Number(persisted.lockEndAt || stored.lockEndAt || (Date.now() + 60000));
  const warnings = Number(persisted.warnings || stored.warnings || 3);

  if (!$('#alb-global-lock-overlay').length) {
    $('body').append(`
      <div id="alb-global-lock-overlay" class="fixed inset-0 z-[100000] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
        <div class="w-full max-w-[460px] bg-white rounded-3xl shadow-2xl border border-white/20 p-6 text-center">
          <div class="w-16 h-16 mx-auto rounded-full bg-red-100 text-red-700 flex items-center justify-center text-2xl mb-4"><i class="fa-solid fa-lock"></i></div>
          <h2 class="text-[22px] font-black text-ink mb-2">Chat dikunci sementara</h2>
          <p class="text-[14px] text-body leading-6 mb-4">Terdeteksi bahasa kurang pantas sebanyak <b class="text-ink">${warnings}×</b>. Yuk gunakan bahasa yang lebih sopan. Chat akan terbuka otomatis setelah waktu di bawah habis.</p>
          <div class="bg-canvas-soft border border-hairline rounded-2xl p-4">
            <div class="text-[12px] text-muted-soft mb-1">Terbuka otomatis dalam</div>
            <div id="alb-global-lock-time" class="text-[34px] font-black text-red-600 tracking-tight">01:00</div>
          </div>
        </div>
      </div>
    `);
  }

  const tick = () => {
    const remain = Math.max(0, Math.ceil((lockEndAt - Date.now()) / 1000));
    const mm = Math.floor(remain / 60).toString().padStart(2, '0');
    const ss = (remain % 60).toString().padStart(2, '0');
    $('#alb-global-lock-time').text(`${mm}:${ss}`);

    if (remain <= 0) {
      clearInterval(window.__albLockTimer);
      window.__albLockTimer = null;
      persistLockdown(context, false);
      $('#alb-global-lock-overlay').remove();
      context.handleLockdown?.(false);
      Toast.show('Chat sudah terbuka lagi. Yuk lanjut belajar dengan sopan. 😊', 'success');
    }
  };

  if (window.__albLockTimer) clearInterval(window.__albLockTimer);
  tick();
  window.__albLockTimer = setInterval(tick, 1000);
}

export function applyPersistedLockdownIfNeeded(context) {
  if (!isProfanityLockEnabled(context)) return;

  const persisted = readPersistedLockdown(context);
  if (persisted) ensureLocalLockOverlay(context, persisted);
}
