// ============================================================
// onboarding.js — Carousel tur onboarding AIworkspace (highlight elemen + kartu langkah).
// [v0.9.7] Diekstrak dari dom-ui.js. Dipanggil via this.showOnboardingCarousel() (init.js).
// ============================================================
import $ from 'jquery';
import { openVideoTutorialModal } from './static-tutorial.js';
import { AI_TUTORIAL_VIDEO_URL } from './student-notes.js';

export function showOnboardingCarousel() {
  // 1. Siapkan Style CSS Global untuk efek Highlight/Glow
  if (!$('#tour-style').length) {
    $('head').append(`
      <style id="tour-style">
        #tour-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(2px);
          z-index: 9000;
          transition: opacity 0.3s ease;
        }

        .tour-highlight {
          position: relative !important;
          z-index: 9001 !important;
          box-shadow: 0 0 0 4px #3b82f6, 0 10px 25px rgba(0,0,0,0.35) !important;
          pointer-events: none !important;
          transition: all 0.3s ease;
        }

        #context-sidebar.tour-highlight {
          background-color: #fafaf9 !important;
          border-radius: 0 16px 16px 0 !important;
        }

        #chat-form.tour-highlight {
          background-color: #ffffff !important;
          border-radius: 24px !important;
        }

        #btn-session-info.tour-highlight {
          background-color: #ffffff !important;
          border-radius: 9999px !important;
        }

        .tour-spotlight-clone {
          position: fixed !important;
          z-index: 9003 !important;
          pointer-events: none !important;
          box-shadow: 0 0 0 4px #3b82f6, 0 10px 25px rgba(0,0,0,0.35) !important;
          border-radius: 9999px !important;
          background: #ffffff !important;
        }

        .tour-label {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          margin: 0 2px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.4;
          white-space: nowrap;
          vertical-align: middle;
        }

        .tour-label-primary {
          color: #1d4ed8;
          background: #dbeafe;
          border: 1px solid #93c5fd;
        }

        .tour-label-warning {
          color: #92400e;
          background: #fef3c7;
          border: 1px solid #fbbf24;
        }

        .tour-label-danger {
          color: #b91c1c;
          background: #fee2e2;
          border: 1px solid #fca5a5;
        }

        .tour-label-success {
          color: #047857;
          background: #d1fae5;
          border: 1px solid #6ee7b7;
        }

        .tour-card {
          position: fixed !important;
        }
      </style>
    `);
  }

  // 2. Buat Overlay jika belum ada
  if (!$('#tour-overlay').length) {
    $('body').append('<div id="tour-overlay" class="hidden"></div>');
  }

  const $overlay = $('#tour-overlay');
  const $modalWrapper = $('#onboarding-modal');
  const $slidesContainer = $('#onboarding-slides');

  $modalWrapper
    .removeClass('hidden bg-canvas/95 backdrop-blur-md')
    .css('z-index', '9002')
    .addClass('pointer-events-none');

  $overlay.removeClass('hidden');

  // [v0.9.85] Carousel diselaraskan dengan UI baru: mode jawaban 2 pilihan (Sistem & AI),
  // tombol gear Konfigurasi (kuota sesi AI + hapus percakapan + atur tampilan), lockdown
  // bahasa berbasis timer (tanpa key). Slide fitur yang kini disembunyikan default
  // (bar kuota, chip sesi, tombol salin) tidak lagi disorot supaya tak menunjuk elemen kosong.
  const steps = [
    {
      title: "Video Cara Pakai AI Buddy",
      icon: "fa-circle-play",
      desc: `
        Sebelum mulai, tonton video singkat cara memakai AI Buddy yuk.
        <br><br>
        <button id="alb-tour-watch-video" type="button" class="inline-flex items-center gap-2 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 rounded-full px-4 py-2.5 text-[13px] font-bold transition-colors">
          <i class="fa-solid fa-circle-play"></i> Tonton Video Tutorial
        </button>
      `,
      target: null,
      placement: "center"
    },
    {
      title: "Selamat Datang di AI Buddy!",
      icon: "fa-robot",
      desc: `
        Asisten belajarmu siap membantu saat belajar di VClass.
        <br><br>
        <span class="tour-label tour-label-primary">
          <i class="fa-solid fa-circle-info"></i> Tujuan
        </span>
        AI ini membantumu memahami materi dan cara pakai VClass, bukan sekadar memberi jawaban instan.
      `,
      target: null,
      placement: "center"
    },
    {
      title: "Panduan Cepat di Sidebar",
      icon: "fa-list",
      desc: `
        Panel di sebelah kiri berisi <b>Panduan Cepat</b> — kumpulan tutorial VClass (cara buat forum, kumpulkan tugas, kerjakan kuis, dan lainnya).
        <br><br>
        Tinggal klik salah satu, kamu <b>tidak perlu mengetik</b>. AI langsung menjelaskan dengan panduan bergambar.
      `,
      target: "#context-sidebar",
      placement: "center",
      mobilePlacement: "mobile-sidebar",
      onEnter: () => {
        if (window.innerWidth < 768) {
          $('#btn-open-context').click();
        }
      }
    },
    {
      title: "Mode Jawaban",
      icon: "fa-sliders",
      desc: `
        Di samping kolom chat ada pilihan cara AI menjawab:<br><br>
        <span class="tour-label tour-label-success">Jawaban Sistem</span> untuk teknis VClass (tugas, kuis, forum) dan <b>tidak memakai kuota AI</b>.<br><br>
        <span class="tour-label tour-label-primary">Jawaban AI</span> untuk penjelasan materi — ini <b>memakai kuota AI</b>.
      `,
      target: "#response-mode-dropdown",
      placement: "center",
      onEnter: () => {
        if (window.innerWidth < 768) {
          $('#btn-close-context').click();
        }
      }
    },
    {
      title: "Tanya Materi Tertentu dengan \"@\"",
      icon: "fa-at",
      desc: `
        Ketik tanda <span class="tour-label tour-label-primary">@</span> di kolom chat untuk memilih <b>materi tertentu</b> dari kelasmu.
        <br><br>
        Setelah memilih materi, muncul <b>daftar pilihan</b>:
        <br>
        <span class="tour-label tour-label-success"><i class="fa-solid fa-wand-magic-sparkles"></i> Rangkum materi ini</span>
        <span class="tour-label tour-label-success"><i class="fa-solid fa-list-ul"></i> Poin penting</span>
        <br><br>
        Kalau kamu belum memasukkan email Moodle, akan muncul tombol untuk mengisinya dulu ya. 😊
      `,
      target: "#chat-form",
      placement: "center"
    },
    {
      title: "Tombol Pengaturan (⚙️)",
      icon: "fa-gear",
      desc: `
        Di pojok kanan atas ada tombol <span class="tour-label tour-label-primary"><i class="fa-solid fa-gear"></i> Konfigurasi</span>. Di dalamnya kamu bisa:
        <br><br>
        • Melihat <b>Kuota Sesi AI</b> (progress bar 0/3),<br>
        • <b>Hapus percakapan</b> (bersihkan chat / mulai sesi baru),<br>
        • Mengatur menu apa saja yang tampil.
      `,
      target: "#btn-workspace-config",
      placement: "center",
      cloneTarget: true
    },
    {
      title: "Batas Topik Pertanyaan",
      icon: "fa-filter-circle-xmark",
      desc: `
        AI Buddy <b class="text-ink">hanya menjawab</b> seputar materi guru (misal: Media Sosial, Dampaknya) dan VClass.
        <br><br>
        <span class="tour-label tour-label-danger"><i class="fa-solid fa-xmark"></i> Dilarang</span>
        Bertanya topik di luar materi seperti hitungan matematika bebas, game, resep, pencipta lampu, dll.
      `,
      target: null,
      placement: "center"
    },
    {
      title: "Kuota Jawaban AI",
      icon: "fa-bolt",
      desc: `
        Kamu bisa minta <span class="tour-label tour-label-primary"><i class="fa-solid fa-bolt"></i> Jawaban AI 3×</span> beruntun. Hitungannya <b>reset otomatis</b> kalau kamu berhenti bertanya AI selama <b>1 menit</b>.
        <br><br>
        Kalau melebihi, AI <span class="tour-label tour-label-warning"><i class="fa-solid fa-hourglass-half"></i> cooldown</span> sebentar (ada hitungan mundur). Progress-nya bisa kamu lihat di tombol <b>⚙️ Konfigurasi</b>.
        <br><br>
        <span class="tour-label tour-label-success">Tips</span> Gunakan <b>Jawaban Sistem</b> yang tidak memakai kuota AI.
      `,
      target: null,
      placement: "center"
    },
    {
      title: "Sesimu Tersimpan Otomatis",
      icon: "fa-clock-rotate-left",
      desc: `
        Kalau kamu menutup aplikasi lalu membukanya lagi di hari yang sama, <b>percakapanmu tidak hilang</b>.
        <br><br>
        Akan muncul garis <span class="tour-label tour-label-primary"><i class="fa-solid fa-clock-rotate-left"></i> Sesi dibuka kembali</span>, dan kamu <b>langsung bisa mengetik lagi</b> tanpa mengulang dari awal.
      `,
      target: null,
      placement: "center"
    },
    {
      title: "Bahasa Sopan & Bantuan Guru",
      icon: "fa-shield-halved",
      desc: `
        Gunakan bahasa yang sopan ya. Kata kasar akan <b>otomatis disensor</b>. Jika sekolahmu mengaktifkannya, terlalu sering berkata kasar bisa membuat chat <span class="tour-label tour-label-warning"><i class="fa-solid fa-lock"></i> terkunci sementara</span> — cukup <b>tunggu hitungan mundurnya</b>, tanpa perlu key.
        <br><br>
        Kalau butuh bantuan lanjutan, ada tombol untuk menghubungi
        <span class="tour-label tour-label-success"><i class="fa-brands fa-whatsapp"></i> WhatsApp Guru</span>.
      `,
      target: null,
      placement: "center"
    }
  ];

  let currentStep = 0;

  const clearHighlight = () => {
    $('.tour-highlight').removeClass('tour-highlight');
    $('.tour-spotlight-clone').remove();
  };

  const createSpotlightClone = (targetSelector) => {
    const $target = $(targetSelector);
    if (!$target.length) return;

    const rect = $target[0].getBoundingClientRect();
    const $clone = $target.clone(false, false);

    $clone
      .removeAttr('id')
      .addClass('tour-spotlight-clone')
      .css({
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: 0,
        transform: 'none'
      });

    $('body').append($clone);
  };

  const positionCard = ($card, step) => {
    const isMobile = window.innerWidth < 768;

    // Desktop: modal selalu di tengah, tidak pindah-pindah
    if (!isMobile) {
      $card.css({
        top: '50%',
        left: '50%',
        right: 'auto',
        bottom: 'auto',
        transform: 'translate(-50%, -50%)'
      });
      return;
    }

    // Mobile khusus tahap sidebar: diturunkan lagi sekitar 30px
    if (step.mobilePlacement === 'mobile-sidebar') {
      $card.css({
        top: 'calc(58% + 30px)',
        left: '50%',
        right: 'auto',
        bottom: 'auto',
        transform: 'translate(-50%, -50%)'
      });
      return;
    }

    // Mobile default tetap tengah
    $card.css({
      top: '50%',
      left: '50%',
      right: 'auto',
      bottom: 'auto',
      transform: 'translate(-50%, -50%)'
    });
  };

  const renderStep = () => {
    clearHighlight();

    const step = steps[currentStep];
    const isLast = currentStep === steps.length - 1;

    if (step.onEnter) step.onEnter();

    $slidesContainer.html(`
      <div class="tour-card bg-surface-card border border-hairline p-6 md:p-8 rounded-2xl shadow-2xl max-w-[400px] w-[90vw] transition-all duration-300 ease-in-out pointer-events-auto">
        <div class="absolute top-4 right-5 text-[12px] font-bold text-muted-soft bg-canvas border border-hairline rounded-full px-3 py-1">
          ${currentStep + 1} / ${steps.length}
        </div>

        <div class="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center text-2xl mb-5">
          <i class="fa-solid ${step.icon}"></i>
        </div>

        <h2 class="text-xl font-serif text-ink mb-3 font-semibold">
          ${step.title}
        </h2>

        <div class="text-body text-[14px] mb-8 leading-relaxed">
          ${step.desc}
        </div>

        <div class="flex gap-3">
          ${currentStep > 0 ? `
            <button id="btn-prev-step" class="flex-1 border border-hairline-strong text-ink rounded-xl py-2.5 text-[14px] font-medium hover:bg-surface-strong transition">
              Kembali
            </button>
          ` : ''}

          <button id="btn-next-step" class="flex-1 bg-primary text-white rounded-xl py-2.5 text-[14px] font-semibold hover:bg-primary-active transition shadow-sm">
            ${isLast ? 'Mulai Belajar <i class="fa-solid fa-check ml-1"></i>' : 'Lanjut <i class="fa-solid fa-arrow-right ml-1"></i>'}
          </button>
        </div>
      </div>
    `);

    if (step.target && $(step.target).length) {
      if (step.cloneTarget) {
        createSpotlightClone(step.target);
      } else {
        $(step.target).addClass('tour-highlight');
      }
    }

    const $card = $slidesContainer.find('.tour-card');
    positionCard($card, step);

    $('#btn-next-step').off('click').on('click', () => {
      if (isLast) {
        finishTour();
      } else {
        currentStep++;
        renderStep();
      }
    });

    $('#btn-prev-step').off('click').on('click', () => {
      currentStep--;
      renderStep();
    });

    // Slide video: tonton → tutup → ingatkan buka lagi lewat menu Tugas Wajib.
    $('#alb-tour-watch-video').off('click').on('click', () =>
      openVideoTutorialModal({ url: AI_TUTORIAL_VIDEO_URL, title: 'Cara Pakai AI Buddy', autoplay: true, reminderOnClose: true }));
  };

  const finishTour = () => {
    // [v0.9.1] Versi flag dinaikkan agar carousel yang sudah di-update muncul lagi sekali.
    localStorage.setItem('alb_external_onboarding_seen', 'v0.9.85');
    clearHighlight();

    $overlay.addClass('hidden');

    $modalWrapper
      .addClass('hidden bg-canvas/95 backdrop-blur-md')
      .removeClass('pointer-events-none')
      .css('z-index', '');
  };

  renderStep();
}
