// ============================================================
// workspace-config.js — Modal "Konfigurasi" (tombol gear di pojok kanan atas).
//
// Semua switch cuma menambah/menghapus BODY-CLASS; penyembunyiannya murni CSS
// (lihat blok `is:global` di BuddyAiWorkspace.astro). Jadi tak ada satu pun
// modul lain yang perlu tahu soal konfigurasi ini.
//
// State disimpan di localStorage per host+project.
// ============================================================
import $ from 'jquery';
import { clearChatOnly, deleteSessionHard } from './student-session.js';

// `invert: true` → body-class dipasang saat switch MATI (dipakai untuk "popup").
const CFG_GROUPS = [
  {
    title: 'Sidebar',
    items: [
      { key: 'tabs', cls: 'alb-cfg-tabs', def: false, label: 'Tampilkan tab "Elemen Halaman"', hint: 'Sidebar kembali punya 2 tab seperti versi lama.' }
    ]
  },
  {
    title: 'Menu Tambahan',
    items: [
      { key: 'adv', cls: 'alb-cfg-adv', def: false, label: 'Tampilkan menu lanjutan', hint: 'Label kuota AI, tombol Sesi 0/3, serta tombol Salin & Kirim ulang di bubble chat.' }
    ]
  },
  {
    title: 'Notifikasi',
    items: [
      { key: 'popup', cls: 'alb-cfg-popup-off', def: true, invert: true, label: 'Tampilkan pop up pengingat', hint: 'Notifikasi kecil di pojok kanan bawah.' }
    ]
  },
  {
    title: 'Area Chat',
    items: [
      { key: 'hide_suggest', cls: 'alb-cfg-suggest-off', def: false, label: 'Sembunyikan chip saran', hint: 'Tombol saran pertanyaan tepat di atas kolom input.' }
    ]
  },
  {
    title: 'Konten Panduan Cepat',
    items: [
      { key: 'guide', cls: 'alb-cfg-guide', def: true, label: 'Panduan Penggunaan' },
      { key: 'class_data', cls: 'alb-cfg-class-data', def: false, label: 'Data Kelas & Tugas' },
      { key: 'notes', cls: 'alb-cfg-notes', def: false, label: 'Catatan & Tugas' },
      { key: 'complaint', cls: 'alb-cfg-complaint', def: false, label: 'Komplain' }
    ]
  }
];

const CFG_ITEMS = CFG_GROUPS.flatMap((g) => g.items);

function cfgEsc(s = '') {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cfgStorageKey(context) {
  const host = window.location.host || 'localhost';
  return `alb:${host}:${context?.projectKey || 'default-project'}:ui-config`;
}

function readConfig(context) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(cfgStorageKey(context)) || '{}') || {}; } catch (_) { saved = {}; }
  const cfg = {};
  CFG_ITEMS.forEach((it) => {
    cfg[it.key] = typeof saved[it.key] === 'boolean' ? saved[it.key] : it.def;
  });
  return cfg;
}

function writeConfig(context, cfg) {
  try { localStorage.setItem(cfgStorageKey(context), JSON.stringify(cfg)); } catch (_) {}
}

function applyConfig(cfg) {
  CFG_ITEMS.forEach((it) => {
    const on = cfg[it.key] === true;
    document.body.classList.toggle(it.cls, it.invert ? !on : on);
  });
}

function paintSwitches(cfg) {
  CFG_ITEMS.forEach((it) => {
    const on = cfg[it.key] === true;
    const $row = $(`[data-cfg-key="${it.key}"]`);
    $row.find('.alb-cfg-track').toggleClass('bg-primary', on).toggleClass('bg-hairline-strong', !on);
    $row.find('.alb-cfg-knob').toggleClass('translate-x-4', on);
  });
}

function switchRowHtml(item) {
  const hint = item.hint
    ? `<span class="block text-[11px] text-muted-soft leading-snug mt-0.5">${cfgEsc(item.hint)}</span>`
    : '';
  return `
    <button type="button" data-cfg-key="${item.key}" class="alb-cfg-switch w-full flex items-start justify-between gap-3 px-2.5 py-2 rounded-lg hover:bg-surface-strong transition-colors text-left">
      <span class="min-w-0 flex-1">
        <span class="block text-[13px] text-ink font-medium leading-snug">${cfgEsc(item.label)}</span>
        ${hint}
      </span>
      <span class="alb-cfg-track relative w-9 h-5 rounded-full bg-hairline-strong transition-colors shrink-0 mt-0.5">
        <span class="alb-cfg-knob absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"></span>
      </span>
    </button>`;
}

// ============================================================
// [v0.9.85] Section "Sesi AI" di dalam modal gear — progress bar 0/3 + status cooldown.
// Sumber angka = context.aiUsage (dari server, disinkronkan updateAiUsageUI di dom-ui.js).
// ============================================================
// [v0.9.94] Guru mematikan cooldown → tak ada kuota untuk ditampilkan, section ini dibuang.
function isAiSessionHidden(context) {
  return context?.featureFlags?.disable_cooldown === true;
}

function aiSessionSnapshot(context) {
  const u = context?.aiUsage || {};
  const max = Number(u.max || 3);
  const cooldown = Boolean(u.cooldown_active) || Number(u.cooldown_remaining_seconds || 0) > 0;
  // Saat cooldown, bar ditampilkan PENUH & merah (max/max).
  const used = cooldown ? max : Math.min(max, Number(u.used || 0));
  return { used, max, cooldown, remain: Number(u.cooldown_remaining_seconds || 0) };
}

function aiSessionSectionHtml() {
  return `
    <div class="rounded-xl border border-hairline bg-white p-3" id="alb-cfg-ai-session">
      <div class="px-0.5 pb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-soft">Sesi AI</div>
      <div class="flex items-center justify-between gap-2 mb-1.5">
        <span class="text-[13px] font-medium text-ink">Kuota jawaban AI</span>
        <span id="alb-cfg-ai-count" class="text-[12px] font-black text-ink">0/3</span>
      </div>
      <div class="h-2.5 w-full rounded-full bg-hairline overflow-hidden">
        <div id="alb-cfg-ai-fill" class="h-full rounded-full bg-primary transition-all duration-300" style="width:0%"></div>
      </div>
      <div id="alb-cfg-ai-note" class="text-[11px] leading-snug text-muted-soft mt-2">
        Kamu bisa minta jawaban AI <b>3×</b> beruntun. Hitungan ini <b>reset otomatis</b> kalau kamu berhenti bertanya AI selama <b>1 menit</b>.
      </div>
    </div>`;
}

// Perbarui tampilan bar + titik merah gear. Aman dipanggil walau modal belum dibuka.
export function updateAiSessionIndicator(context) {
  const ctx = context || {};

  if (isAiSessionHidden(ctx)) {
    $('#alb-cfg-gear-dot').addClass('hidden');
    $('#alb-cfg-ai-session').remove();
    return;
  }

  const snap = aiSessionSnapshot(ctx);
  const pct = snap.max > 0 ? Math.round((snap.used / snap.max) * 100) : 0;

  // Titik merah di gear (hanya saat cooldown).
  $('#alb-cfg-gear-dot').toggleClass('hidden', !snap.cooldown);

  // Isi bar bila section-nya sedang ada di DOM (modal terbuka).
  const $fill = $('#alb-cfg-ai-fill');
  if ($fill.length) {
    $fill.css('width', `${pct}%`)
      .removeClass('bg-primary bg-red-500')
      .addClass(snap.cooldown ? 'bg-red-500' : 'bg-primary');
    $('#alb-cfg-ai-count')
      .text(`${snap.used}/${snap.max}`)
      .toggleClass('text-red-600', snap.cooldown)
      .toggleClass('text-ink', !snap.cooldown);

    if (snap.cooldown) {
      const mm = Math.floor(snap.remain / 60).toString().padStart(2, '0');
      const ss = (snap.remain % 60).toString().padStart(2, '0');
      $('#alb-cfg-ai-note')
        .removeClass('text-muted-soft').addClass('text-red-600')
        .html(`<i class="fa-solid fa-hourglass-half mr-1"></i> Kuota AI habis. Tunggu <b>${mm}:${ss}</b> — chat AI dibuka lagi otomatis.`);
    } else {
      $('#alb-cfg-ai-note')
        .removeClass('text-red-600').addClass('text-muted-soft')
        .html('Kamu bisa minta jawaban AI <b>3×</b> beruntun. Hitungan ini <b>reset otomatis</b> kalau kamu berhenti bertanya AI selama <b>1 menit</b>.');
    }
  }
}

function buildModal(context) {
  if ($('#alb-cfg-overlay').length) return;

  const groupsHtml = CFG_GROUPS.map((g) => `
    <div class="rounded-xl border border-hairline bg-white p-2">
      <div class="px-2.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-soft">${cfgEsc(g.title)}</div>
      ${g.items.map(switchRowHtml).join('')}
    </div>`).join('');

  $('body').append(`
    <div id="alb-cfg-overlay" class="hidden fixed inset-0 z-[9700] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-surface-card w-full max-w-[440px] rounded-2xl shadow-2xl border border-hairline flex flex-col max-h-[88vh] overflow-hidden">
        <div class="px-5 py-4 border-b border-hairline bg-white flex items-center justify-between gap-3 shrink-0">
          <div class="min-w-0">
            <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted flex items-center gap-2"><i class="fa-solid fa-gear text-primary"></i> Konfigurasi</div>
            <div class="text-[12px] text-muted-soft mt-0.5 leading-snug">Atur menu mana yang mau ditampilkan.</div>
          </div>
          <button type="button" id="alb-cfg-close" class="w-8 h-8 rounded-full text-muted hover:text-ink hover:bg-black/5 flex items-center justify-center shrink-0"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="p-4 space-y-3 overflow-y-auto bg-canvas-soft">
          ${isAiSessionHidden(context) ? '' : aiSessionSectionHtml()}
          ${groupsHtml}

          <details id="alb-cfg-delete" class="rounded-xl border border-hairline bg-white overflow-hidden">
            <summary class="cursor-pointer list-none px-3.5 py-3 flex items-center justify-between gap-2 text-[13px] font-semibold text-ink hover:bg-surface-strong transition-colors">
              <span class="flex items-center gap-2"><i class="fa-solid fa-trash-can text-[12px] text-muted"></i> Hapus Percakapan</span>
              <i class="fa-solid fa-chevron-down text-[10px] text-muted-soft transition-transform"></i>
            </summary>
            <div class="px-3 pb-3 pt-1 space-y-2 border-t border-hairline">
              <button type="button" id="alb-cfg-clear-chat" class="w-full text-left rounded-xl border border-hairline hover:border-primary/40 hover:bg-primary/5 px-3.5 py-3 transition-colors flex items-start gap-3">
                <span class="w-9 h-9 shrink-0 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mt-0.5"><i class="fa-solid fa-broom"></i></span>
                <span class="min-w-0">
                  <span class="block text-[13px] font-bold text-ink">Hapus Chat saja</span>
                  <span class="block text-[11.5px] text-muted-soft leading-snug mt-0.5">Pesan di layar dibersihkan sekarang. Kalau web di-<b>reload, chatmu muncul lagi</b> (riwayat tetap tersimpan).</span>
                </span>
              </button>
              <button type="button" id="alb-cfg-delete-session" class="w-full text-left rounded-xl border border-red-200 hover:border-red-400 hover:bg-red-50 px-3.5 py-3 transition-colors flex items-start gap-3">
                <span class="w-9 h-9 shrink-0 rounded-lg bg-red-50 text-red-600 flex items-center justify-center mt-0.5"><i class="fa-solid fa-trash-can"></i></span>
                <span class="min-w-0">
                  <span class="block text-[13px] font-bold text-red-700">Hapus Sesi</span>
                  <span class="block text-[11.5px] text-muted-soft leading-snug mt-0.5">Chat & riwayat dihapus permanen. Saat web di-reload <b>riwayat sudah tidak ada</b> — sama seperti memulai sesi baru.</span>
                </span>
              </button>
            </div>
          </details>
        </div>
      </div>
    </div>
  `);

  const close = () => $('#alb-cfg-overlay').addClass('hidden');
  $('#alb-cfg-close').on('click', close);
  $('#alb-cfg-overlay').on('click', (e) => { if (e.target.id === 'alb-cfg-overlay') close(); });

  $('#alb-cfg-overlay').on('click', '.alb-cfg-switch', function () {
    const key = $(this).attr('data-cfg-key');
    const cfg = readConfig(context);
    cfg[key] = !cfg[key];
    writeConfig(context, cfg);
    applyConfig(cfg);
    paintSwitches(cfg);
  });

  $('#alb-cfg-clear-chat').on('click', () => {
    clearChatOnly(context);
    close();
  });

  $('#alb-cfg-delete-session').on('click', async function () {
    const $btn = $(this);
    if ($btn.prop('disabled')) return;
    $btn.prop('disabled', true).addClass('opacity-60 cursor-not-allowed');
    try {
      await deleteSessionHard(context);
    } catch (err) {
      console.error('[Config] gagal hapus sesi:', err);
      $btn.prop('disabled', false).removeClass('opacity-60 cursor-not-allowed');
    }
  });
}

export function initWorkspaceConfig(context) {
  const ctx = context || this;
  applyConfig(readConfig(ctx));

  const $btn = $('#btn-workspace-config');
  if (!$btn.length) return;

  $btn.off('click.albCfg').on('click.albCfg', () => {
    buildModal(ctx);
    const cfg = readConfig(ctx);
    paintSwitches(cfg);
    updateAiSessionIndicator(ctx);
    $('#alb-cfg-overlay').removeClass('hidden');
  });

  // Sinkron awal (mis. reload saat cooldown → titik merah langsung tampil).
  updateAiSessionIndicator(ctx);
}
