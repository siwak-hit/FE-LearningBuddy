import $ from 'jquery';
import { Modal } from './components/modal.js';
import AuthPage from './pages/auth.page.js';
import DashboardPage from './pages/dashboard.page.js';
import WidgetSettingsPage from './pages/widget-settings.page.js';
import BuddyPage from './pages/buddy.page.js'; // IMPORT BARU

const PWA_CONFIG = {
  manifestPath: '/manifest.webmanifest',
  serviceWorkerPath: '/sw.js',
  serviceWorkerScope: '/',
  themeColor: '#2563eb'
};

const PWAService = {
  deferredInstallPrompt: null,
  registration: null,

  init() {
    this.injectManifest();
    this.injectThemeColor();
    this.bindInstallPrompt();
    this.registerServiceWorker();
  },

  injectManifest() {
    // Manifest tetap ditaruh di /public/manifest.webmanifest,
    // tapi link-nya dipasang lewat entry point main.js agar tidak perlu edit layout/head satu-satu.
    const existing = document.querySelector('link[rel="manifest"]');
    if (existing) {
      existing.setAttribute('href', PWA_CONFIG.manifestPath);
      return;
    }

    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = PWA_CONFIG.manifestPath;
    document.head.appendChild(manifestLink);
  },

  injectThemeColor() {
    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      document.head.appendChild(themeMeta);
    }
    themeMeta.content = PWA_CONFIG.themeColor;
  },

  bindInstallPrompt() {
    // Browser akan men-trigger event ini kalau app memenuhi syarat install PWA.
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredInstallPrompt = event;

      // Bisa dipakai tombol custom nanti:
      // window.dispatchEvent(new CustomEvent('alb:pwa-install-ready'));
      window.dispatchEvent(new CustomEvent('alb:pwa-install-ready'));
    });

    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      localStorage.setItem('alb_pwa_installed', '1');
      window.dispatchEvent(new CustomEvent('alb:pwa-installed'));
    });

    // Helper global kalau nanti mau bikin tombol "Install App" manual.
    window.ALB_PWA = {
      install: async () => this.promptInstall(),
      isStandalone: () => this.isStandalone(),
      getRegistration: () => this.registration
    };
  },

  async promptInstall() {
    if (!this.deferredInstallPrompt) {
      return { ok: false, reason: 'install_prompt_not_ready' };
    }

    this.deferredInstallPrompt.prompt();
    const choiceResult = await this.deferredInstallPrompt.userChoice;
    this.deferredInstallPrompt = null;

    return {
      ok: choiceResult?.outcome === 'accepted',
      outcome: choiceResult?.outcome || 'unknown'
    };
  },

  canRegisterServiceWorker() {
    if (!('serviceWorker' in navigator)) return false;

    // Service worker butuh HTTPS, kecuali localhost memang diizinkan browser.
    const host = window.location.hostname;
    const isLocalhost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
    const isHttps = window.location.protocol === 'https:';

    return isHttps || isLocalhost;
  },

  registerServiceWorker() {
    if (!this.canRegisterServiceWorker()) {
      console.info('[AI Buddy PWA] Service Worker tidak diregister karena bukan HTTPS/localhost.');
      return;
    }

    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register(PWA_CONFIG.serviceWorkerPath, {
          scope: PWA_CONFIG.serviceWorkerScope
        });

        this.registration = registration;
        console.info('[AI Buddy PWA] Service Worker aktif:', registration.scope);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('alb:pwa-update-ready', { detail: { registration } }));
            }
          });
        });
      } catch (error) {
        console.warn('[AI Buddy PWA] Gagal register Service Worker:', error);
      }
    });
  },

  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
};

const AppRouter = {
  init() {
    // PWA diinisialisasi dari entry point utama.
    // Jadi manifest + sw.js berlaku di semua halaman yang memakai main.js ini.
    PWAService.init();

    Modal.init();
    this.initSidebar();
    this.initGlobal();

    const path = window.location.pathname;

    // Routing System
    if (path.includes('/auth/login')) {
      AuthPage.init();
    }
    else if (path.includes('/dashboard/widget')) {
      WidgetSettingsPage.init();
    }
    else if (path === '/dashboard' || path === '/dashboard/') {
      DashboardPage.init();
    }
    else if (path.startsWith('/buddy')) {
      BuddyPage.init(); // ROUTING UNTUK EXTERNAL WORKSPACE
    }
  },

  initSidebar() {
    const $sidebar = $('#main-sidebar');
    const $overlay = $('#sidebar-overlay');

    function toggleSidebar(show) {
      if (!$sidebar.length || !$overlay.length) return;

      if (show) {
        $sidebar.removeClass('-translate-x-full');
        $overlay.removeClass('hidden');
        $overlay[0].offsetHeight; // Reflow
        $overlay.removeClass('opacity-0');
      } else {
        $sidebar.addClass('-translate-x-full');
        $overlay.addClass('opacity-0');
        setTimeout(() => $overlay.addClass('hidden'), 300);
      }
    }

    $('#btn-open-sidebar').on('click', () => toggleSidebar(true));
    $('#btn-close-sidebar, #sidebar-overlay').on('click', () => toggleSidebar(false));
  },

  initGlobal() {
    const currentPath = window.location.pathname;
    $('aside nav a').each(function() {
      const linkPath = $(this).attr('href');
      $(this).removeClass('bg-hairline-soft text-ink font-medium');
      if (currentPath === linkPath || (currentPath.startsWith(linkPath) && linkPath !== '/dashboard')) {
        $(this).addClass('bg-hairline-soft text-ink font-medium');
      }
    });
  }
};

$(() => AppRouter.init());
