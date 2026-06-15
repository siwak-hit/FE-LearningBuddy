import $ from 'jquery';
import { Modal } from './components/modal.js';
import AuthPage from './pages/auth.page.js';
import DashboardPage from './pages/dashboard.page.js';
import WidgetSettingsPage from './pages/widget-settings.page.js';
import BuddyPage from './pages/buddy.page.js'; // IMPORT BARU

// Catatan PWA:
// Manifest dan service worker tidak lagi di-inject dari main.js.
// Pasang <link rel="manifest" href="/manifest.json" /> langsung di layout/head.

const ADMIN_TOKEN_KEYS = ['alb_token', 'token', 'admin_token'];

function hasAdminSession() {
  try {
    return ADMIN_TOKEN_KEYS.some((key) => Boolean(localStorage.getItem(key)));
  } catch (error) {
    return false;
  }
}

function getSafeRedirectPath(defaultPath = '/dashboard') {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect') || defaultPath;

  // Hindari open redirect ke domain luar.
  if (!redirect.startsWith('/') || redirect.startsWith('//')) return defaultPath;
  return redirect;
}

function buildLoginRedirectUrl() {
  const currentPath = `${window.location.pathname}${window.location.search}`;
  const redirect = encodeURIComponent(currentPath || '/dashboard');
  return `/auth/login?redirect=${redirect}`;
}

function isAdminProtectedPath(path) {
  return path === '/dashboard' || path === '/dashboard/' || path.startsWith('/dashboard/');
}

function isLoginPath(path) {
  return path.includes('/auth/login');
}

const AppRouter = {
  init() {
    const path = window.location.pathname;

    // Guard admin dashboard.
    // Halaman /buddy tidak ikut dikunci karena itu workspace siswa/external loader.
    if (isAdminProtectedPath(path) && !hasAdminSession()) {
      window.location.replace(buildLoginRedirectUrl());
      return;
    }

    // Kalau admin sudah login lalu buka /auth/login, langsung arahkan ke dashboard/redirect.
    if (isLoginPath(path) && hasAdminSession()) {
      window.location.replace(getSafeRedirectPath('/dashboard'));
      return;
    }

    Modal.init();
    this.initSidebar();
    this.initGlobal();

    // Routing System
    if (isLoginPath(path)) {
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

    if (!$sidebar.length || !$overlay.length) return;

    function toggleSidebar(show) {
      if (show) {
        $sidebar.removeClass('-translate-x-full');
        $overlay.removeClass('hidden');
        $overlay[0]?.offsetHeight; // Reflow
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
      if (!linkPath) return;

      $(this).removeClass('bg-hairline-soft text-ink font-medium');
      if (currentPath === linkPath || (currentPath.startsWith(linkPath) && linkPath !== '/dashboard')) {
        $(this).addClass('bg-hairline-soft text-ink font-medium');
      }
    });
  }
};

$(() => AppRouter.init());
