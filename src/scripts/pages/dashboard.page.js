import $ from 'jquery';
import { ProjectApi } from '../fetch/project.fetch.js';
import { LogAPI } from '../fetch/log.fetch.js';
import { ApiService } from '../fetch/api.js';
import Toast from '../components/toast.js';
import { Modal } from '../components/modal.js';

// Kartu statistik ringkas untuk menu dashboard.
function statCard(label, value, icon, color) {
  return `
    <div class="bg-surface-card border border-hairline rounded-[14px] p-4 shadow-sm">
      <div class="flex items-center gap-2 text-[12px] font-semibold text-muted uppercase tracking-wide mb-1">
        <i class="fa-solid ${icon} ${color}"></i> ${escapeHtml(label)}
      </div>
      <div class="text-[28px] font-black text-ink leading-none">${escapeHtml(value)}</div>
    </div>`;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getProjectKey(project = {}) {
  if (project.project_key) return project.project_key;

  // Supabase join kadang mengembalikan widget_configs sebagai array/object.
  const widgetConfig = Array.isArray(project.widget_configs)
    ? project.widget_configs[0]
    : project.widget_configs;

  return widgetConfig?.project_key || '';
}

function buildWidgetConfigUrl(project = {}) {
  const params = new URLSearchParams();

  if (project.id) params.set('projectId', project.id);

  const projectKey = getProjectKey(project);
  if (projectKey) params.set('projectKey', projectKey);

  return `/dashboard/widget?${params.toString()}`;
}

const DashboardPage = {
  init() {
    this.cacheDOM();
    this.bindEvents();
    this.loadProjects();
    this.loaded = {};
  },

  cacheDOM() {
    this.$list = $('#project-list');
    this.$form = $('#form-create-project');
  },

  bindEvents() {
    $('#btn-open-create-modal').on('click', () => Modal.open('modal-create-project'));
    this.$form.on('submit', this.handleCreate.bind(this));
    this.$list.on('click', '.btn-delete-project', this.handleDelete.bind(this));
    // Menu titik-3 per project: toggle + salin link uji SUS.
    this.$list.on('click', '.btn-project-menu', function (e) {
      e.stopPropagation();
      const $menu = $(this).siblings('.project-menu');
      $('.project-menu').not($menu).addClass('hidden');
      $menu.toggleClass('hidden');
    });
    this.$list.on('click', '.btn-copy-sus-link', this.handleCopySusLink.bind(this));
    $(document).on('click', () => $('.project-menu').addClass('hidden'));
    $('#dash-tabs .dash-tab-btn').on('click', (e) => this.switchTab($(e.currentTarget)));
  },

  handleCopySusLink(e) {
    e.stopPropagation();
    const key = String($(e.currentTarget).data('key') || '');
    $('.project-menu').addClass('hidden');
    if (!key) {
      Toast.show('Project key belum tersedia. Buka Config dulu untuk membuat widget.', 'warn');
      return;
    }
    const link = `${window.location.origin}/buddy?projectKey=${encodeURIComponent(key)}&new_chat=true`;
    const done = () => Toast.show('Link Uji SUS disalin! Sebarkan ke siswa.', 'success');
    const fallback = () => {
      const $tmp = $('<input>').val(link).appendTo('body').select();
      try { document.execCommand('copy'); done(); } catch (_) { Toast.show(link, 'warn'); }
      $tmp.remove();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(done).catch(fallback);
    else fallback();
  },

  switchTab($btn) {
    const target = $btn.data('target');
    $('#dash-tabs .dash-tab-btn').removeClass('is-active');
    $btn.addClass('is-active');
    $('.dash-pane').addClass('hidden');
    $(`#${target}`).removeClass('hidden');

    if (target === 'dash-pane-analytics' && !this.loaded.analytics) {
      this.loaded.analytics = true;
      this.loadAnalyticsSummary();
    }
    if (target === 'dash-pane-logs' && !this.loaded.logs) {
      this.loaded.logs = true;
      this.loadLogsSummary();
    }
  },

  async loadAnalyticsSummary() {
    const $c = $('#dash-analytics-cards');
    try {
      const res = await ApiService.get('/analytics/learning?projectId=all');
      const d = res?.data;
      if (!d || !d.totals || d.totals.sessions === 0) {
        $c.html('<div class="col-span-full text-center py-8 text-muted-soft text-[14px]">Belum ada data interaksi untuk dianalisis.</div>');
        return;
      }
      $c.html(
        statCard('Total Sesi', d.totals.sessions, 'fa-comments', 'text-primary') +
        statCard('Siswa Aktif', d.totals.students, 'fa-users', 'text-sky-500') +
        statCard('Sesi Terdeteksi Kesulitan', d.totals.escalated_sessions, 'fa-triangle-exclamation', 'text-amber-500') +
        statCard('Rekomendasi Diterima', (d.recommendation?.acceptance_pct || 0) + '%', 'fa-handshake-angle', 'text-emerald-500')
      );
    } catch (_) {
      $c.html('<div class="col-span-full text-center py-8 text-rose-500 text-[14px]">Gagal memuat analitik. Coba lagi.</div>');
      this.loaded.analytics = false;
    }
  },

  async loadLogsSummary() {
    const $c = $('#dash-logs-cards');
    try {
      const res = await LogAPI.getSummary({});
      const d = res?.data;
      if (!d) {
        $c.html('<div class="col-span-full text-center py-8 text-muted-soft text-[14px]">Belum ada percakapan tercatat.</div>');
        return;
      }
      $c.html(
        statCard('Total Sesi', d.totalSessions || 0, 'fa-comments', 'text-primary') +
        statCard('Indikasi SARA', d.hateSpeech || 0, 'fa-triangle-exclamation', 'text-semantic-error') +
        statCard('Kata Kasar', d.profanity || 0, 'fa-comment-slash', 'text-red-600') +
        statCard('Sinyal Stres', d.mentalHealth || 0, 'fa-brain', 'text-orange-600')
      );
    } catch (_) {
      $c.html('<div class="col-span-full text-center py-8 text-rose-500 text-[14px]">Gagal memuat ringkasan. Coba lagi.</div>');
      this.loaded.logs = false;
    }
  },

  async loadProjects() {
    const res = await ProjectApi.getAll();
    this.$list.empty();

    if (res.status !== 'success' || !res.data || res.data.length === 0) {
      this.$list.html(`<div class="col-span-full text-center py-10 text-muted-soft border border-dashed border-hairline-strong rounded-[16px]">Belum ada project. Silakan buat baru.</div>`);
      return;
    }

    res.data.forEach((p) => {
      const projectKey = getProjectKey(p);
      const displayKey = projectKey || `ID: ${String(p.id || '').substring(0, 8)}...`;
      const widgetUrl = buildWidgetConfigUrl(p);

      const card = `
        <div class="bg-surface-card p-6 rounded-[20px] border border-hairline shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
          <h3 class="font-serif text-[22px] mb-2 text-ink leading-tight">${escapeHtml(p.name)}</h3>

          <div class="mb-6 w-full">
            <div class="inline-flex max-w-full items-center text-[13px] font-mono text-muted bg-canvas-soft px-3 py-1.5 rounded-full border border-hairline-strong">
              <span class="shrink-0 mr-1">Key:</span>
              <span class="truncate min-w-0">${escapeHtml(displayKey)}</span>
            </div>
          </div>

          <div class="flex gap-3 mt-auto items-center">
            <a href="${widgetUrl}" class="flex-1 text-center border border-hairline-strong text-ink text-[14px] font-medium py-2.5 rounded-full hover:bg-canvas-soft transition-colors">
              <i class="fa-solid fa-sliders mr-1 text-muted"></i> Config
            </a>

            <div class="relative shrink-0">
              <button type="button" class="btn-project-menu w-[42px] h-[42px] flex items-center justify-center bg-canvas-soft border border-hairline-strong text-ink rounded-full hover:bg-surface-strong transition-colors" title="Opsi project">
                <i class="fa-solid fa-ellipsis-vertical"></i>
              </button>
              <div class="project-menu hidden absolute right-0 bottom-[52px] z-30 w-[240px] bg-surface-card border border-hairline rounded-xl shadow-xl p-2">
                <button type="button" class="btn-copy-sus-link w-full text-left px-3 py-2 rounded-lg text-[13px] text-ink hover:bg-surface-strong flex items-center gap-2 transition-colors" data-key="${escapeHtml(projectKey)}">
                  <i class="fa-solid fa-link text-[12px] text-primary shrink-0"></i> Salin Link Uji SUS
                </button>
                <button type="button" data-id="${escapeHtml(p.id)}" class="btn-delete-project w-full text-left px-3 py-2 rounded-lg text-[13px] text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors">
                  <i class="fa-solid fa-trash text-[12px] shrink-0"></i> Hapus Project
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      this.$list.append(card);
    });
  },

  async handleCreate(e) {
    e.preventDefault();
    const $btn = this.$form.find('button');
    $btn.text('Membuat...').prop('disabled', true);

    const res = await ProjectApi.create({
      name: $('#project_name').val(),
      course_name: '-',
      school_name: '-'
    });

    if (res.status === 'success') {
      Toast.show('Project berhasil dibuat!', 'success');
      this.$form[0].reset();
      Modal.close('modal-create-project');
      this.loadProjects();
    } else {
      Toast.show(res.message, 'danger');
    }

    $btn.text('Buat Project').prop('disabled', false);
  },

  handleDelete(e) {
    const id = $(e.currentTarget).data('id');

    Modal.confirm({
      title: 'Hapus Project?',
      message: 'Semua data chat, konfigurasi widget, dan Knowledge Base untuk mata pelajaran ini akan dihapus permanen. Lanjutkan?',
      confirmText: 'Ya, Hapus',
      cancelText: 'Kembali',
      onConfirm: async () => {
        const res = await ProjectApi.delete(id);
        if (res.status === 'success') {
          Toast.show('Project berhasil dihapus', 'success');
          this.loadProjects();
        } else {
          Toast.show('Gagal menghapus project', 'danger');
        }
      }
    });
  }
};

export default DashboardPage;
