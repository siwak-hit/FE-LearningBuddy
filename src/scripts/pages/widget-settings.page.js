import $ from 'jquery';
import { WidgetApi } from '../fetch/widget.fetch.js';
import { ProjectApi } from '../fetch/project.fetch.js';
import Toast from '../components/toast.js';
import { Modal } from '../components/modal.js';

const WidgetSettingsPage = {
  init() {
    this.cacheDOM();
    this.bindEvents();
    this.initTabs();
    this.loadData();
  },

  cacheDOM() {
    this.$form = $('#widget-config-form');
    this.$btnSubmit = this.$form.find('button[type="submit"]');
    this.$btnCopyEmbed = $('#btn-copy-embed');
    this.$btnCopyExtScript = $('#btn-copy-ext-script');
    this.$btnCopyLink = $('#btn-copy-link');

    this.$loadingState = $('#loading-state');
    this.$emptyState = $('#empty-state');
    this.$formContainer = $('#config-form-container');
    this.$projectName = $('#project-name-display');
  },

  bindEvents() {
    this.$form.on('submit', this.handleSubmit.bind(this));
    this.$btnCopyEmbed.on('click', () => this.copyToClipboard('embed-code', this.$btnCopyEmbed, 'Salin Script'));
    this.$btnCopyLink.on('click', () => this.copyToClipboard('ext-link', this.$btnCopyLink, 'Salin Link'));

    // TAMBAHKAN INI: Event listener untuk tombol copy external script
    if (this.$btnCopyExtScript.length) {
      this.$btnCopyExtScript.on('click', () => this.copyToClipboard('ext-script', this.$btnCopyExtScript, 'Salin Script Launcher'));
    }

    // Buka Modal Integrasi
    $('#btn-reveal-integration').on('click', () => Modal.open('modal-integration'));

    // Sesuaikan Tab yang tersedia saat Access Mode berubah
    $('#access_mode').on('change', (e) => this.updateAvailableTabs($(e.target).val()));
  },

  initTabs() {
    // Logika pergantian Tab Modal
    $('.tab-btn').on('click', function() {
      $('.tab-btn').removeClass('border-primary text-ink').addClass('border-transparent text-muted');
      $(this).removeClass('border-transparent text-muted').addClass('border-primary text-ink');

      $('.tab-pane').addClass('hidden');
      $('#' + $(this).data('target')).removeClass('hidden');
    });
  },

  async loadData() {
    try {
      const pRes = await ProjectApi.getAll();

      if (pRes.status === 'success' && pRes.data && pRes.data.length > 0) {
        const project = pRes.data[0];
        this.$projectName.text(project.name);

        if (!project.project_key) {
          this.$loadingState.addClass('hidden');
          this.$emptyState.html('<i class="fa-solid fa-triangle-exclamation text-semantic-error mr-2"></i> Project tidak memiliki <b>project_key</b>. Hapus project ini dan buat baru.').removeClass('hidden');
          return;
        }

        const cRes = await WidgetApi.getConfig(project.project_key);

        if (cRes.status === 'success' && cRes.data) {
          this.populateForm(project.project_key, cRes.data);
          this.$loadingState.addClass('hidden');
          this.$formContainer.removeClass('hidden');
          // Tampilkan tombol reveal
          $('#btn-reveal-integration').closest('.bg-surface-card').removeClass('hidden');
          return;
        }
      }

      this.$loadingState.addClass('hidden');
      this.$emptyState.removeClass('hidden');
      $('#btn-reveal-integration').closest('.bg-surface-card').addClass('hidden');

    } catch (e) {
      console.error(e);
      Toast.show('Gagal memuat data dari server', 'danger');
    }
  },

  populateForm(projectKey, config) {
    this.$form.data('config-id', config.id);

    const theme = typeof config.theme === 'string' ? JSON.parse(config.theme) : (config.theme || {});
    const allowedOrigins = Array.isArray(config.allowed_origin) ? config.allowed_origin.join('\n') : '';

    $('#title').val(theme.title || '');
    $('#subtitle').val(theme.subtitle || '');
    $('#primaryColor').val(theme.primaryColor || '#292524');
    $('#access_mode').val(config.access_mode || 'both');
    $('#mode').val(config.mode || 'floating');
    $('#allowed_origin').val(allowedOrigins);

    // Set checked state untuk Toggle Switch
    $('#is_active').prop('checked', config.is_active);
    $('#read_dom_context').prop('checked', config.read_dom_context);

    if (config.active_from) $('#active_from').val(new Date(config.active_from).toISOString().slice(0, 16));
    if (config.active_until) $('#active_until').val(new Date(config.active_until).toISOString().slice(0, 16));

    const API_BASE = import.meta.env.PUBLIC_API_BASE_URL.replace('/api', '');
    const APP_URL = import.meta.env.PUBLIC_APP_URL;

    // 1. Script Embed Internal
    const embedCode = `<script\n  src="${API_BASE}/api/widget/loader.js"\n  data-project-key="${projectKey}"\n  data-api-base="${API_BASE}">\n</script>`;

    // 2. Script Launcher External (BARU)
    const extScriptCode = `<script\n  src="${API_BASE}/api/widget/external-loader.js"\n  data-project-key="${projectKey}"\n  data-api-base="${API_BASE}"\n  data-app-url="${APP_URL}">\n</script>`;

    // 3. Link Direct
    const externalLink = `${APP_URL}/buddy?projectKey=${projectKey}`;

    $('#embed-code').val(embedCode);
    $('#ext-link').val(externalLink);
    $('#preview-link').attr('href', externalLink);

    // TAMBAHKAN INI: Set value textareanya
    if ($('#ext-script').length) {
      $('#ext-script').val(extScriptCode);
    }

    this.updateAvailableTabs(config.access_mode || 'both');
  },

  updateAvailableTabs(mode) {
    const $btnEmbed = $('[data-target="tab-embed"]');
    const $btnExternal = $('[data-target="tab-external"]');

    if (mode === 'embed') {
      $btnEmbed.removeClass('hidden').click();
      $btnExternal.addClass('hidden');
    } else if (mode === 'external') {
      $btnExternal.removeClass('hidden').click();
      $btnEmbed.addClass('hidden');
    } else {
      $btnEmbed.removeClass('hidden');
      $btnExternal.removeClass('hidden');
      $btnEmbed.click(); // Default ke embed
    }
  },

  getPayload() {
    const rawOrigins = $('#allowed_origin').val() || '';
    const origins = rawOrigins.split('\n').map(s => s.trim().replace(/\/$/, '')).filter(s => s);

    return {
      mode: $('#mode').val(),
      access_mode: $('#access_mode').val(),
      theme: {
        title: $('#title').val(),
        subtitle: $('#subtitle').val(),
        primaryColor: $('#primaryColor').val()
      },
      allowed_origin: origins,
      is_active: $('#is_active').is(':checked'),
      read_dom_context: $('#read_dom_context').is(':checked'),
      active_from: $('#active_from').val() || null,
      active_until: $('#active_until').val() || null
    };
  },

  async handleSubmit(e) {
    e.preventDefault();
    const configId = this.$form.data('config-id');
    const payload = this.getPayload();

    this.$btnSubmit.html('<i class="fa-solid fa-spinner fa-spin mr-2"></i> Menyimpan...').prop('disabled', true);

    const res = await WidgetApi.updateConfig(configId, payload);
    if (res.status === 'success') {
      Toast.show('Konfigurasi berhasil disimpan!', 'success');

      const projectKey = $('#embed-code').val().match(/data-project-key="([^"]+)"/)?.[1];

      if (projectKey && res.data) {
        this.populateForm(projectKey, res.data);
      }

      this.updateAvailableTabs(payload.access_mode);

      this.$btnSubmit
        .html('<i class="fa-solid fa-save mr-2"></i> Simpan Konfigurasi')
        .prop('disabled', false);
    } else {
      Toast.show(res.message || 'Terjadi kesalahan', 'danger');
      this.$btnSubmit.html('<i class="fa-solid fa-save mr-2"></i> Simpan Konfigurasi').prop('disabled', false);
    }
  },

  async copyToClipboard(inputId, $btn, originalText) {
    const textToCopy = $(`#${inputId}`).val();
    try {
      await navigator.clipboard.writeText(textToCopy);
      $btn.html('<i class="fa-solid fa-check mr-2"></i> Berhasil Disalin');
      Toast.show('Berhasil disalin ke clipboard!', 'success');
      setTimeout(() => $btn.html(`<i class="fa-solid fa-copy mr-2"></i> ${originalText}`), 2000);
    } catch (err) {
      Toast.show('Gagal menyalin otomatis', 'danger');
    }
  }
};

export default WidgetSettingsPage;
