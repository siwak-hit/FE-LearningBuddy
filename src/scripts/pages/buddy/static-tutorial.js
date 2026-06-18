// ============================================================
// static-tutorial.js — Modal tutorial VClass berbasis gambar statis (carousel langkah).
// [v0.9.7] Diekstrak dari events.js agar file inti tidak terlalu panjang.
// Hanya `openStaticTutorialModal` yang dipakai dari luar (bindChatActionButtons).
// ============================================================
import $ from 'jquery';
import Toast from '../../components/toast.js';

let albActiveStaticTutorial = null;
let albActiveStaticTutorialIndex = 0;

function safeTutorialText(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeStaticAssetUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `/${raw}`;
}

function ensureStaticTutorialModal() {
  if ($('#alb-static-tutorial-modal').length) return;

  $('body').append(`
    <style>
      #alb-static-tutorial-modal {
        font-family: inherit;
      }
      #alb-static-tutorial-modal .alb-tut-image-wrap {
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      }
      #alb-static-tutorial-image {
        transition: opacity 0.2s ease;
      }
      #alb-static-tutorial-image.loading {
        opacity: 0;
      }
      .alb-tut-step-list-item {
        transition: background 0.15s, border-color 0.15s;
        cursor: pointer;
      }
      .alb-tut-step-list-item.active {
        background: #eff6ff;
        border-color: #93c5fd;
      }
      .alb-tut-step-list-item:not(.active):hover {
        background: #f8fafc;
      }
      .alb-tut-nav-btn {
        transition: opacity 0.15s, background 0.15s, transform 0.1s;
      }
      .alb-tut-nav-btn:not(:disabled):active {
        transform: scale(0.93);
      }
      @media (max-width: 640px) {
        #alb-static-tutorial-modal .alb-tut-sidebar {
          display: none !important;
        }
        #alb-static-tutorial-modal .alb-tut-mobile-info {
          display: block !important;
        }
      }
    </style>

    <div id="alb-static-tutorial-modal" class="hidden fixed inset-0 z-[9700] flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4">
      <div class="flex w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl" style="max-height: 96dvh; height: 96dvh;">

        <!-- Header -->
        <div class="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-white">
          <div class="flex items-center gap-3 min-w-0">
            <div class="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-[14px]">
              <i class="fa-solid fa-book-open-reader"></i>
            </div>
            <div class="min-w-0">
              <div class="text-[10px] font-black uppercase tracking-[0.12em] text-primary leading-none mb-0.5">Tutorial VClass</div>
              <div id="alb-static-tutorial-title" class="text-[15px] sm:text-[16px] font-black text-slate-900 leading-tight truncate"></div>
            </div>
          </div>
          <button type="button" id="alb-static-tutorial-close" class="shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Tutup tutorial">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Body -->
        <div class="flex flex-1 min-h-0">

          <!-- Left: Image area -->
          <div class="flex flex-col flex-1 min-w-0 min-h-0 bg-slate-50">

            <!-- Image viewer -->
            <div class="alb-tut-image-wrap relative flex-1 flex items-center justify-center min-h-0 p-3 sm:p-5">
              <!-- Nav: Prev -->
              <button type="button" id="alb-static-tutorial-prev" aria-label="Langkah sebelumnya"
                class="alb-tut-nav-btn absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-white shadow-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-25 disabled:cursor-not-allowed">
                <i class="fa-solid fa-chevron-left text-[13px]"></i>
              </button>

              <!-- Image -->
              <img id="alb-static-tutorial-image" src="" alt=""
                class="max-h-full w-auto max-w-full object-contain rounded-xl shadow-sm cursor-zoom-in select-none"
                style="max-height: calc(96dvh - 200px);"
                loading="lazy" draggable="false" />

              <!-- Nav: Next -->
              <button type="button" id="alb-static-tutorial-next" aria-label="Langkah berikutnya"
                class="alb-tut-nav-btn absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-white shadow-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-25 disabled:cursor-not-allowed">
                <i class="fa-solid fa-chevron-right text-[13px]"></i>
              </button>
            </div>

            <!-- Mobile info (hidden on desktop via CSS) -->
            <div class="alb-tut-mobile-info hidden border-t border-slate-100 bg-white px-4 py-3">
              <div class="flex items-center justify-between gap-3 mb-2">
                <span id="alb-static-tutorial-counter-mobile" class="inline-flex items-center gap-1.5 text-[11px] font-black text-primary bg-primary/8 px-2.5 py-1 rounded-full">Langkah 1/1</span>
                <div id="alb-static-tutorial-dots" class="flex items-center gap-1.5 flex-wrap justify-end"></div>
              </div>
              <div id="alb-static-tutorial-step-title-mobile" class="text-[14px] font-black text-slate-900 leading-snug mb-1"></div>
              <div id="alb-static-tutorial-step-text-mobile" class="text-[12px] text-slate-600 leading-relaxed"></div>
              <div id="alb-static-tutorial-step-note-mobile" class="hidden mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-relaxed"></div>
            </div>

            <!-- Bottom dots (desktop, hidden on mobile) -->
            <div class="alb-tut-sidebar hidden sm:flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-2.5">
              <span id="alb-static-tutorial-counter" class="text-[11px] font-black text-primary whitespace-nowrap">Langkah 1/1</span>
              <div id="alb-static-tutorial-dots-desktop" class="flex items-center gap-1.5 flex-wrap justify-end"></div>
              <span class="text-[10px] text-slate-400 whitespace-nowrap hidden md:block"><i class="fa-solid fa-keyboard mr-1"></i>← →</span>
            </div>
          </div>

          <!-- Right: Step sidebar (desktop only) -->
          <aside class="alb-tut-sidebar hidden sm:flex flex-col w-[260px] md:w-[300px] shrink-0 border-l border-slate-100 bg-white overflow-y-auto">
            <div class="px-4 pt-4 pb-2">
              <p id="alb-static-tutorial-intro" class="text-[12px] text-slate-500 leading-relaxed"></p>
            </div>
            <div id="alb-static-tutorial-step-list" class="flex flex-col gap-1 px-3 py-2 flex-1"></div>
            <div id="alb-static-tutorial-note" class="shrink-0 mx-3 mb-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-500"></div>
          </aside>
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
  $('#alb-static-tutorial-prev').on('click', () => showStaticTutorialStep(albActiveStaticTutorialIndex - 1));
  $('#alb-static-tutorial-next').on('click', () => showStaticTutorialStep(albActiveStaticTutorialIndex + 1));
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
    if (e.key === 'Escape') closeStaticTutorialModal();
    if (e.key === 'ArrowLeft') showStaticTutorialStep(albActiveStaticTutorialIndex - 1);
    if (e.key === 'ArrowRight') showStaticTutorialStep(albActiveStaticTutorialIndex + 1);
  });
}

function closeStaticTutorialModal() {
  $('#alb-static-tutorial-modal').addClass('hidden');
  $('body').css('overflow', '');
}

function showStaticTutorialStep(index = 0) {
  if (!albActiveStaticTutorial || !Array.isArray(albActiveStaticTutorial.steps)) return;

  const steps = albActiveStaticTutorial.steps;
  const maxIndex = Math.max(0, steps.length - 1);
  albActiveStaticTutorialIndex = Math.max(0, Math.min(maxIndex, Number(index) || 0));

  const step = steps[albActiveStaticTutorialIndex] || {};
  const imageUrl = normalizeStaticAssetUrl(step.image || '');
  const counterText = `Langkah ${albActiveStaticTutorialIndex + 1}/${steps.length}`;
  const stepTitle = step.title || `Langkah ${albActiveStaticTutorialIndex + 1}`;
  const stepText = step.text || 'Ikuti bagian yang ditunjukkan pada gambar.';

  // Counter
  $('#alb-static-tutorial-counter').text(counterText);
  $('#alb-static-tutorial-counter-mobile').text(counterText);

  // Image with fade transition
  const $img = $('#alb-static-tutorial-image');
  $img.addClass('loading');
  const newImg = new Image();
  newImg.onload = () => {
    $img.attr('src', imageUrl).attr('alt', step.alt || stepTitle || 'Gambar tutorial VClass').removeClass('loading');
  };
  newImg.onerror = () => $img.attr('src', imageUrl).removeClass('loading');
  newImg.src = imageUrl;

  // Mobile info
  $('#alb-static-tutorial-step-title-mobile').text(stepTitle);
  $('#alb-static-tutorial-step-text-mobile').text(stepText);
  if (step.note) {
    $('#alb-static-tutorial-step-note-mobile').removeClass('hidden').text(step.note);
  } else {
    $('#alb-static-tutorial-step-note-mobile').addClass('hidden').text('');
  }

  // Nav buttons
  $('#alb-static-tutorial-prev').prop('disabled', albActiveStaticTutorialIndex <= 0);
  $('#alb-static-tutorial-next').prop('disabled', albActiveStaticTutorialIndex >= maxIndex);

  // Dots (desktop bottom bar)
  const dotsHtml = steps.map((_, i) => `
    <button type="button"
      class="alb-static-tutorial-dot h-2 rounded-full transition-all duration-200 ${i === albActiveStaticTutorialIndex ? 'w-6 bg-primary' : 'w-2 bg-slate-300 hover:bg-slate-400'}"
      data-step="${i}" aria-label="Langkah ${i + 1}"></button>
  `).join('');
  $('#alb-static-tutorial-dots-desktop').html(dotsHtml);

  // Dots (mobile)
  const dotsHtmlMobile = steps.map((_, i) => `
    <button type="button"
      class="alb-static-tutorial-dot h-1.5 rounded-full transition-all duration-200 ${i === albActiveStaticTutorialIndex ? 'w-5 bg-primary' : 'w-1.5 bg-slate-300'}"
      data-step="${i}" aria-label="Langkah ${i + 1}"></button>
  `).join('');
  $('#alb-static-tutorial-dots').html(dotsHtmlMobile);

  $('.alb-static-tutorial-dot').off('click').on('click', (e) => {
    showStaticTutorialStep(Number($(e.currentTarget).attr('data-step')) || 0);
  });

  // Sidebar step list
  const listHtml = steps.map((s, i) => {
    const isActive = i === albActiveStaticTutorialIndex;
    const isDone = i < albActiveStaticTutorialIndex;
    return `
      <button type="button" class="alb-tut-step-list-item w-full text-left rounded-xl border px-3 py-2.5 ${isActive ? 'active border-blue-200 bg-blue-50' : 'border-transparent'}" data-step="${i}">
        <div class="flex items-start gap-2.5">
          <div class="shrink-0 w-5 h-5 rounded-full mt-0.5 flex items-center justify-center text-[10px] font-black
            ${isActive ? 'bg-primary text-white' : isDone ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}">
            ${isDone ? '<i class="fa-solid fa-check" style="font-size:9px;"></i>' : i + 1}
          </div>
          <div class="min-w-0">
            <div class="text-[12px] font-bold leading-snug ${isActive ? 'text-slate-900' : isDone ? 'text-slate-500' : 'text-slate-700'}">${safeTutorialText(s.title || `Langkah ${i + 1}`)}</div>
            ${isActive && s.text ? `<div class="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">${safeTutorialText(s.text)}</div>` : ''}
          </div>
        </div>
      </button>`;
  }).join('');
  const $list = $('#alb-static-tutorial-step-list');
  $list.html(listHtml);
  $list.find('.alb-tut-step-list-item').off('click').on('click', (e) => {
    showStaticTutorialStep(Number($(e.currentTarget).attr('data-step')) || 0);
  });

  // Scroll active step into view in sidebar
  const $activeItem = $list.find('.alb-tut-step-list-item.active');
  if ($activeItem.length) {
    const listEl = $list[0];
    const itemEl = $activeItem[0];
    const itemTop = itemEl.offsetTop - listEl.offsetTop;
    listEl.scrollTo({ top: itemTop - 40, behavior: 'smooth' });
  }
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

  $('#alb-static-tutorial-title').text(tutorial.title || 'Tutorial VClass');
  $('#alb-static-tutorial-intro').text(tutorial.intro || '');
  $('#alb-static-tutorial-note').text(tutorial.note || 'Isi teks pada gambar hanya contoh. Ikuti instruksi guru dan data akunmu sendiri.');
  $('#alb-static-tutorial-modal').removeClass('hidden');
  $('body').css('overflow', 'hidden');
  showStaticTutorialStep(0);
}
