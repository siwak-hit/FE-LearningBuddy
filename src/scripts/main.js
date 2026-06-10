import $ from 'jquery';
import { Modal } from './components/modal.js';
import AuthPage from './pages/auth.page.js';
import DashboardPage from './pages/dashboard.page.js';
import WidgetSettingsPage from './pages/widget-settings.page.js';
import BuddyPage from './pages/buddy.page.js'; // IMPORT BARU

const AppRouter = {
  init() {
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
