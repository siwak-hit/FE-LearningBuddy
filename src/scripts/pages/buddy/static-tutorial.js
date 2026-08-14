// ============================================================
// static-tutorial.js — Modal tutorial VClass berbasis gambar statis (carousel langkah).
// [v0.9.7] Diekstrak dari events.js agar file inti tidak terlalu panjang.
// Hanya `openStaticTutorialModal` yang dipakai dari luar (bindChatActionButtons).
// ============================================================
import $ from 'jquery';
import Toast from '../../components/toast.js';
import { isTutorialVideoAvailable } from './tutorial-assets.js';

// ============================================================
// [v0.9.13] Modal VIDEO tutorial. Mendukung YouTube (watch/youtu.be/embed) & file video langsung.
// ============================================================
function toYoutubeEmbed(url = '') {
  const u = String(url || '').trim();
  let m;
  if ((m = u.match(/(?:youtube\.com\/watch\?[^]*\bv=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/))) {
    return `https://www.youtube.com/embed/${m[1]}`;
  }
  if (/youtube\.com\/embed\//.test(u)) return u;
  return '';
}

function ensureVideoTutorialModal() {
  if ($('#alb-video-tutorial-modal').length) return;
  $('body').append(`
    <div id="alb-video-tutorial-modal" class="hidden fixed inset-0 z-[9750] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6">
      <div class="bg-surface-card w-full max-w-[860px] rounded-2xl shadow-2xl border border-hairline flex flex-col overflow-hidden">
        <div class="px-4 py-3 border-b border-hairline bg-white flex items-center justify-between gap-3 shrink-0">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-8 h-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><i class="fa-solid fa-play"></i></span>
            <div class="text-[14px] font-black text-ink truncate" id="alb-video-tutorial-title">Video Tutorial</div>
          </div>
          <button type="button" id="alb-video-tutorial-close" class="w-9 h-9 rounded-full bg-surface-strong border border-hairline text-ink hover:bg-hairline shrink-0"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="bg-black relative" style="aspect-ratio:16/9;">
          <div id="alb-video-tutorial-body" class="absolute inset-0"></div>
        </div>
      </div>
    </div>
  `);
  const close = () => {
    $('#alb-video-tutorial-body').empty(); // stop playback
    $('#alb-video-tutorial-modal').addClass('hidden');
    if (albVideoReminderOnClose) { albVideoReminderOnClose = false; showVideoReminder(); }
  };
  $('#alb-video-tutorial-close').on('click', close);
  $('#alb-video-tutorial-modal').on('click', (e) => { if (e.target.id === 'alb-video-tutorial-modal') close(); });
}

let albVideoReminderOnClose = false;

// Setelah video ditutup (dari onboarding), ingatkan cara membukanya lagi.
function showVideoReminder() {
  $('#alb-video-reminder-modal').remove();
  $('body').append(`
    <div id="alb-video-reminder-modal" class="fixed inset-0 z-[9760] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-surface-card w-full max-w-[380px] rounded-2xl shadow-2xl border border-hairline p-6 text-center">
        <div class="w-12 h-12 mx-auto bg-primary/10 text-primary rounded-full flex items-center justify-center text-xl mb-3"><i class="fa-solid fa-circle-info"></i></div>
        <h3 class="font-serif text-lg text-ink mb-2">Mau nonton lagi nanti?</h3>
        <p class="text-[13px] text-body leading-relaxed mb-5">Video tutorial ini bisa kamu buka lagi kapan saja lewat menu <b>Tugas Wajib (To-do)</b> di sidebar ya 👍</p>
        <button type="button" class="alb-video-reminder-ok w-full bg-primary hover:bg-primary-active text-white rounded-full px-5 py-2.5 text-[14px] font-bold">Mengerti</button>
      </div>
    </div>
  `);
  const closeReminder = () => $('#alb-video-reminder-modal').remove();
  $('#alb-video-reminder-modal').on('click', '.alb-video-reminder-ok', closeReminder);
  $('#alb-video-reminder-modal').on('click', (e) => { if (e.target.id === 'alb-video-reminder-modal') closeReminder(); });
}

export function openVideoTutorialModal(payload = {}) {
  const url = String(payload.url || '').trim();
  if (!url) { Toast.show('Video tutorial belum tersedia. (URL belum diisi)', 'warning'); return; }
  ensureVideoTutorialModal();
  $('#alb-video-tutorial-title').text(payload.title || 'Video Tutorial');

  albVideoReminderOnClose = payload.reminderOnClose === true;
  const autoplay = payload.autoplay !== false; // default autoplay
  const embed = toYoutubeEmbed(url);
  const body = embed
    ? `<iframe class="w-full h-full border-0" src="${embed}?rel=0${autoplay ? '&autoplay=1' : ''}" title="Video tutorial" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"></iframe>`
    : `<video class="w-full h-full" src="${url}" controls playsinline preload="metadata" ${autoplay ? 'autoplay' : ''}></video>`;
  $('#alb-video-tutorial-body').html(body);
  $('#alb-video-tutorial-modal').removeClass('hidden');
}

let albActiveStaticTutorial = null;
let albActiveStaticTutorialIndex = 0;
let albActiveStaticTutorialMode = 'image';

function normalizeStaticAssetUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `/${raw}`;
}

function ensureStaticTutorialModal() {
  if ($('#alb-static-tutorial-modal').length) return;

  // [v0.9.82] Rombak total: 1 slide = 1 langkah (linear, tak bisa lompat), porsi
  // gambar ~60% & teks ~40%, teks diperbesar. Di mobile bukan drawer lagi tapi
  // OVERLAY penuh dengan header (judul + tombol tutup di kanan atas).
  $('body').append(`
    <style>
      #alb-static-tutorial-modal { font-family: inherit; }
      #alb-static-tutorial-modal .alb-tut-image-wrap {
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      }
      #alb-static-tutorial-image { transition: opacity 0.2s ease; }
      #alb-static-tutorial-image.loading { opacity: 0; }
      #alb-static-tutorial-modal .alb-tut-slide { animation: alb-tut-slide-in 0.22s ease-out; }
      @keyframes alb-tut-slide-in {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: none; }
      }
      .alb-tut-nav-btn { transition: opacity 0.15s, background 0.15s, transform 0.1s; }
      .alb-tut-nav-btn:not(:disabled):active { transform: scale(0.96); }
      /* [v0.9.90] Switch gambar/video: hanya tombol aktif yang berlatar putih. */
      #alb-static-tutorial-modeswitch .alb-tut-mode-btn { color: #64748b; }
      #alb-static-tutorial-modeswitch .alb-tut-mode-btn.alb-tut-mode-active {
        background: #fff; color: #0f172a; box-shadow: 0 1px 3px rgba(0,0,0,0.12);
      }
      @media (prefers-reduced-motion: reduce) {
        #alb-static-tutorial-modal .alb-tut-slide { animation: none; }
      }
    </style>

    <div id="alb-static-tutorial-modal" class="hidden fixed inset-0 z-[9700] flex items-stretch sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4">
      <!-- Tinggi kartu HARUS pasti (bukan h-auto), kalau tidak porsi flex 3:2
           gambar-vs-teks tak punya ruang untuk dibagi dan gambar jadi mendominasi. -->
      <div class="flex w-full h-full sm:h-[86dvh] sm:max-h-[760px] sm:max-w-[680px] flex-col overflow-hidden sm:rounded-2xl bg-white shadow-2xl">

        <!-- Header: judul + tombol tutup di pojok kanan atas -->
        <div class="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-white">
          <div class="flex items-center gap-3 min-w-0">
            <div class="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-[15px]">
              <i class="fa-solid fa-book-open-reader"></i>
            </div>
            <div class="min-w-0">
              <div class="text-[10px] font-black uppercase tracking-[0.12em] text-primary leading-none mb-0.5">Panduan VClass</div>
              <div id="alb-static-tutorial-title" class="text-[15px] sm:text-[17px] font-black text-slate-900 leading-tight truncate"></div>
            </div>
          </div>
          <button type="button" id="alb-static-tutorial-close" class="shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Tutup panduan">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- [v0.9.90] Switch mode panduan: gambar (carousel langkah) atau video. -->
        <div id="alb-static-tutorial-modeswitch" class="hidden shrink-0 border-b border-slate-100 bg-white px-4 py-2.5">
          <div class="flex items-center gap-1 rounded-full bg-slate-100 p-1">
            <button type="button" class="alb-tut-mode-btn flex-1 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors" data-mode="image">
              <i class="fa-solid fa-images text-[11px] mr-1.5"></i>Panduan Gambar
            </button>
            <button type="button" class="alb-tut-mode-btn flex-1 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors" data-mode="video">
              <i class="fa-solid fa-circle-play text-[11px] mr-1.5"></i>Panduan Video
            </button>
          </div>
        </div>

        <!-- Mode VIDEO: satu pemutar penuh, tanpa langkah/navigasi. -->
        <div id="alb-static-tutorial-video-mode" class="hidden flex-1 min-h-0 flex flex-col items-center justify-center bg-black p-0">
          <video id="alb-static-tutorial-video" class="max-h-full max-w-full" controls playsinline preload="auto"></video>
          <p id="alb-static-tutorial-video-error" class="hidden px-6 text-center text-[14px] text-slate-300 leading-relaxed">
            Video panduan untuk topik ini belum tersedia. Silakan pakai <b>Panduan Gambar</b> ya.
          </p>
        </div>

        <!-- Mode GAMBAR — Gambar: ~60% tinggi -->
        <div class="alb-tut-image-wrap alb-tut-image-mode relative flex-[3] min-h-0 flex items-center justify-center p-3 sm:p-4">
          <img id="alb-static-tutorial-image" src="" alt=""
            class="alb-tut-slide max-h-full w-auto max-w-full object-contain rounded-xl shadow-sm cursor-zoom-in select-none"
            loading="lazy" draggable="false" />
          <span class="absolute bottom-3 right-4 text-[10px] text-slate-400 pointer-events-none select-none hidden sm:block">
            <i class="fa-solid fa-magnifying-glass-plus mr-1"></i>klik gambar untuk perbesar
          </span>
        </div>

        <!-- Teks: ~40% tinggi, satu langkah saja -->
        <div class="alb-tut-image-mode flex-[2] min-h-0 overflow-y-auto border-t border-slate-100 bg-white px-5 py-4">
          <div class="alb-tut-slide">
            <span id="alb-static-tutorial-counter" class="inline-flex items-center gap-1.5 text-[11px] font-black text-primary bg-primary/10 px-2.5 py-1 rounded-full mb-2.5">Langkah 1/1</span>
            <h4 id="alb-static-tutorial-step-title" class="text-[17px] sm:text-[19px] font-black text-slate-900 leading-snug mb-2"></h4>
            <p id="alb-static-tutorial-step-text" class="text-[14.5px] sm:text-[15.5px] text-slate-700 leading-[1.65]"></p>
            <div id="alb-static-tutorial-step-note" class="hidden mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800 leading-relaxed"></div>
            <div id="alb-static-tutorial-note" class="mt-3 text-[11.5px] leading-5 text-slate-400"></div>
          </div>
        </div>

        <!-- Navigasi linear: Sebelumnya · indikator titik · Lanjut -->
        <div class="alb-tut-image-mode shrink-0 flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-3">
          <button type="button" id="alb-static-tutorial-prev"
            class="alb-tut-nav-btn inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">
            <i class="fa-solid fa-chevron-left text-[11px]"></i> Sebelumnya
          </button>
          <div id="alb-static-tutorial-dots" class="flex items-center gap-1.5 flex-wrap justify-center min-w-0"></div>
          <button type="button" id="alb-static-tutorial-next"
            class="alb-tut-nav-btn inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-white hover:bg-primary-active disabled:opacity-30 disabled:cursor-not-allowed">
            Lanjut <i class="fa-solid fa-chevron-right text-[11px]"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Zoom overlay -->
    <div id="alb-static-image-zoom" class="hidden fixed inset-0 z-[9800] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-10" style="cursor:zoom-out;">
      <button type="button" id="alb-static-image-zoom-close" class="absolute right-4 top-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors border border-white/20" aria-label="Tutup gambar">
        <i class="fa-solid fa-xmark"></i>
      </button>
      <img id="alb-static-image-zoom-img" src="" alt="Preview gambar tutorial" class="max-h-full max-w-full object-contain rounded-xl shadow-2xl" style="cursor:default;" />
    </div>
  `);

  $('#alb-static-tutorial-close').on('click', closeStaticTutorialModal);
  $('#alb-static-tutorial-modeswitch').on('click', '.alb-tut-mode-btn', (e) => {
    setStaticTutorialMode($(e.currentTarget).attr('data-mode'));
  });
  $('#alb-static-tutorial-video').on('error', () => {
    $('#alb-static-tutorial-video').addClass('hidden');
    $('#alb-static-tutorial-video-error').removeClass('hidden');
  });
  $('#alb-static-tutorial-prev').on('click', () => showStaticTutorialStep(albActiveStaticTutorialIndex - 1));
  $('#alb-static-tutorial-next').on('click', function () {
    if ($(this).attr('data-last') === '1') { closeStaticTutorialModal(); return; }
    showStaticTutorialStep(albActiveStaticTutorialIndex + 1);
  });
  $('#alb-static-tutorial-image').on('click', () => {
    const src = $('#alb-static-tutorial-image').attr('src') || '';
    if (!src) return;
    $('#alb-static-image-zoom-img').attr('src', src);
    $('#alb-static-image-zoom').removeClass('hidden');
  });
  $('#alb-static-image-zoom-close, #alb-static-image-zoom').on('click', (e) => {
    if (e.target.id === 'alb-static-image-zoom' || e.currentTarget.id === 'alb-static-image-zoom-close') {
      $('#alb-static-image-zoom').addClass('hidden');
      $('#alb-static-image-zoom-img').attr('src', '');
    }
  });

  $(document).off('keydown.albStaticTutorial').on('keydown.albStaticTutorial', (e) => {
    if ($('#alb-static-tutorial-modal').hasClass('hidden')) return;
    if (e.key === 'Escape') { closeStaticTutorialModal(); return; }
    // Panah kiri/kanan hanya untuk carousel gambar; di mode video biarkan browser
    // memakainya untuk maju/mundur pemutaran.
    if (albActiveStaticTutorialMode !== 'image') return;
    if (e.key === 'ArrowLeft') showStaticTutorialStep(albActiveStaticTutorialIndex - 1);
    if (e.key === 'ArrowRight') showStaticTutorialStep(albActiveStaticTutorialIndex + 1);
  });
}

// [v0.9.90] Ganti mode panduan. Sumber video baru dipasang saat mode video dipilih —
// filenya sudah dipanaskan `tutorial-assets.js` saat workspace dibuka, jadi ini cache hit.
function setStaticTutorialMode(mode = 'image') {
  const isVideo = mode === 'video';
  albActiveStaticTutorialMode = isVideo ? 'video' : 'image';

  $('#alb-static-tutorial-modal .alb-tut-image-mode').toggleClass('hidden', isVideo);
  $('#alb-static-tutorial-video-mode').toggleClass('hidden', !isVideo);
  $('#alb-static-tutorial-modeswitch .alb-tut-mode-btn').each((_, el) => {
    $(el).toggleClass('alb-tut-mode-active', $(el).attr('data-mode') === albActiveStaticTutorialMode);
  });

  const $video = $('#alb-static-tutorial-video');
  const videoUrl = String(albActiveStaticTutorial?.video || '');

  if (!isVideo) {
    $video[0]?.pause();
    return;
  }

  $video.removeClass('hidden');
  $('#alb-static-tutorial-video-error').addClass('hidden');
  if ($video.attr('src') !== videoUrl) $video.attr('src', videoUrl);
}

function closeStaticTutorialModal() {
  $('#alb-static-tutorial-modal').addClass('hidden');
  $('body').css('overflow', '');
  // Lepas sumber video supaya audionya mati & unduhan berhenti saat modal ditutup.
  const video = $('#alb-static-tutorial-video')[0];
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
}

function showStaticTutorialStep(index = 0) {
  if (!albActiveStaticTutorial || !Array.isArray(albActiveStaticTutorial.steps)) return;

  const steps = albActiveStaticTutorial.steps;
  const maxIndex = Math.max(0, steps.length - 1);
  albActiveStaticTutorialIndex = Math.max(0, Math.min(maxIndex, Number(index) || 0));

  const step = steps[albActiveStaticTutorialIndex] || {};
  const imageUrl = normalizeStaticAssetUrl(step.image || '');
  const stepTitle = step.title || `Langkah ${albActiveStaticTutorialIndex + 1}`;
  const stepText = step.text || 'Ikuti bagian yang ditunjukkan pada gambar.';
  const isLast = albActiveStaticTutorialIndex >= maxIndex;

  $('#alb-static-tutorial-counter').text(`Langkah ${albActiveStaticTutorialIndex + 1}/${steps.length}`);

  // Ganti gambar dengan fade supaya perpindahan langkah tidak "kedip".
  const $img = $('#alb-static-tutorial-image');
  $img.addClass('loading');
  const newImg = new Image();
  newImg.onload = () => {
    $img.attr('src', imageUrl).attr('alt', step.alt || stepTitle || 'Gambar panduan VClass').removeClass('loading');
  };
  newImg.onerror = () => $img.attr('src', imageUrl).removeClass('loading');
  newImg.src = imageUrl;

  // Satu slide = satu langkah. Teks langkah lain TIDAK ditampilkan.
  $('#alb-static-tutorial-step-title').text(stepTitle);
  $('#alb-static-tutorial-step-text').text(stepText);
  $('#alb-static-tutorial-step-note').toggleClass('hidden', !step.note).text(step.note || '');

  // Ulangi animasi masuk tiap pindah langkah.
  $('#alb-static-tutorial-modal .alb-tut-slide').each((_, el) => {
    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.animation = '';
  });

  $('#alb-static-tutorial-prev').prop('disabled', albActiveStaticTutorialIndex <= 0);
  // Di langkah terakhir tombolnya jadi "Selesai" (menutup modal), bukan mati — biar tak buntu.
  $('#alb-static-tutorial-next')
    .attr('data-last', isLast ? '1' : '0')
    .html(isLast
      ? 'Selesai <i class="fa-solid fa-check text-[11px]"></i>'
      : 'Lanjut <i class="fa-solid fa-chevron-right text-[11px]"></i>');

  // Titik = INDIKATOR posisi saja (bukan tombol) — carousel harus dilalui berurutan.
  $('#alb-static-tutorial-dots').html(steps.map((_, i) => `
    <span class="h-2 rounded-full transition-all duration-200 ${i === albActiveStaticTutorialIndex ? 'w-6 bg-primary' : i < albActiveStaticTutorialIndex ? 'w-2 bg-primary/40' : 'w-2 bg-slate-200'}"></span>
  `).join(''));
}

export function openStaticTutorialModal(payload = {}) {
  const tutorial = payload || {};
  const steps = Array.isArray(tutorial.steps) ? tutorial.steps : [];

  if (!steps.length) {
    Toast.show('Data tutorial belum tersedia.', 'warning');
    return;
  }

  ensureStaticTutorialModal();
  albActiveStaticTutorial = tutorial;
  albActiveStaticTutorialIndex = 0;

  // Switch gambar/video hanya muncul kalau videonya memang ada. Prefetch di
  // `tutorial-assets.js` sudah memprobe file mana yang tersedia; kalau probe-nya belum
  // selesai (`undefined`), switch tetap ditampilkan dan pane video punya pesan fallback.
  const hasVideo = Boolean(tutorial.video) && isTutorialVideoAvailable(tutorial.video) !== false;
  $('#alb-static-tutorial-modeswitch').toggleClass('hidden', !hasVideo);
  setStaticTutorialMode('image');

  $('#alb-static-tutorial-title').text(tutorial.title || 'Panduan VClass');
  $('#alb-static-tutorial-note').text(tutorial.note || 'Isi teks pada gambar hanya contoh. Ikuti instruksi guru dan data akunmu sendiri.');
  $('#alb-static-tutorial-modal').removeClass('hidden');
  $('body').css('overflow', 'hidden');
  showStaticTutorialStep(0);
}
