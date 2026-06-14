import $ from 'jquery';
import { ProjectApi } from '../fetch/project.fetch.js';
import Toast from '../components/toast.js';
import { Modal } from '../components/modal.js';

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
  },

  cacheDOM() {
    this.$list = $('#project-list');
    this.$form = $('#form-create-project');
  },

  bindEvents() {
    $('#btn-open-create-modal').on('click', () => Modal.open('modal-create-project'));
    this.$form.on('submit', this.handleCreate.bind(this));
    this.$list.on('click', '.btn-delete-project', this.handleDelete.bind(this));
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

          <div class="flex gap-3 mt-auto">
            <a href="${widgetUrl}" class="flex-1 text-center border border-hairline-strong text-ink text-[14px] font-medium py-2.5 rounded-full hover:bg-canvas-soft transition-colors">
              <i class="fa-solid fa-sliders mr-1 text-muted"></i> Config
            </a>

            <button data-id="${escapeHtml(p.id)}" class="btn-delete-project w-[42px] h-[42px] flex items-center justify-center bg-red-50 text-semantic-error rounded-full hover:bg-semantic-error hover:text-white transition-colors">
              <i class="fa-solid fa-trash"></i>
            </button>
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
