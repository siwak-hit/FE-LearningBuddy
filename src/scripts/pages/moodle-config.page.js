import $ from 'jquery';
import { MoodleApi } from '../fetch/moodle.fetch.js';
import { ProjectApi } from '../fetch/project.fetch.js';
import { ApiService } from '../fetch/api.js';

function toast(text, type = 'success', duration = 3000) {
  const bg = type === 'error' ? '#dc2626' : type === 'warning' ? '#d97706' : '#16a34a';
  Toastify({ text, duration, style: { background: bg } }).showToast();
}

function normalizeClassCode(value = '') {
  const raw = String(value || '').toUpperCase().trim();
  const match = raw.match(/\b((?:7|8|9|10|11|12)\s*[A-Z])\b/i);
  return match ? match[1].replace(/\s+/g, '') : raw.replace(/\s+/g, '');
}

function sortClassCodes(a, b) {
  const ga = parseInt(String(a).match(/^\d+/)?.[0] || '0', 10);
  const gb = parseInt(String(b).match(/^\d+/)?.[0] || '0', 10);
  if (ga !== gb) return ga - gb;
  return String(a).localeCompare(String(b), 'id-ID', { numeric: true });
}

$(async function() {
  const $loadingState = $('#loading-state');
  const $emptyState = $('#empty-state');
  const $formContainer = $('#config-form-container');
  const $projectSelector = $('#project-selector');

  const $endpointInput = $('#moodle_rest_endpoint');
  const $tokenInput = $('#moodle_token');
  const $tokenHint = $('#moodle_token_hint');
  const $tokenMasked = $('#moodle_token_masked');
  const $courseContainer = $('#course-map-container');
  const $courseSummary = $('#course-map-summary');
  const $testBtn = $('#btn-test-moodle');
  const $syncCourseBtn = $('#btn-sync-course-map');
  const $form = $('#moodle-config-form');
  const $statusBadge = $('#moodle-test-status');

  let courseMapState = {};
  let courseRoutesState = [];

  function renderCourseMap(courseMap = {}, courseRoutes = []) {
    courseMapState = {};
    Object.entries(courseMap || {}).forEach(([cls, id]) => {
      const normalized = normalizeClassCode(cls);
      if (normalized && id) courseMapState[normalized] = Number(id);
    });

    courseRoutesState = Array.isArray(courseRoutes) ? courseRoutes : [];
    const classCodes = Object.keys(courseMapState).sort(sortClassCodes);
    $courseContainer.empty();

    if (!classCodes.length) {
      $courseContainer.append(`
        <div class="col-span-full border border-dashed border-hairline-strong rounded-2xl p-5 text-center text-[14px] text-muted-soft bg-canvas-soft">
          Belum ada pemetaan kelas. Klik <b>Sync Course</b> untuk mengambil daftar course dari Moodle.
        </div>
      `);
      $courseSummary.addClass('hidden');
      return;
    }

    classCodes.forEach((cls) => {
      const route = courseRoutesState.find((item) => String(item.class_code) === cls) || {};
      const title = route.course_title ? String(route.course_title) : '';
      $courseContainer.append(`
        <div class="bg-surface-card border border-hairline-soft rounded-[10px] px-3 py-2 focus-within:border-hairline-strong transition-colors">
          <div class="flex items-center gap-3">
            <label class="font-bold text-ink w-10 shrink-0 text-[15px]">${cls}</label>
            <div class="w-px h-6 bg-hairline"></div>
            <input type="number" data-course-class="${cls}" id="course_${cls}" class="w-full bg-transparent border-0 text-[14px] text-body focus:outline-none focus:ring-0 p-1" value="${courseMapState[cls]}" placeholder="Course ID">
          </div>
          ${title ? `<div class="text-[11px] text-muted-soft mt-1 truncate" title="${title.replace(/"/g, '&quot;')}">${title}</div>` : ''}
        </div>
      `);
    });

    $courseSummary
      .removeClass('hidden')
      .text(`${classCodes.length} kelas terpetakan: ${classCodes.join(', ')}`);
  }

  const enableSyncTab = () => {
    $('#tab-btn-sync').prop('disabled', false).attr('title', 'Buka menu sinkronisasi');
  };

  const disableSyncTab = () => {
    $('#tab-btn-sync').prop('disabled', true).attr('title', 'Lakukan uji koneksi atau simpan konfigurasi terlebih dahulu');
    $('.tab-btn-moodle[data-target="tab-config"]').click();
  };

  $('.tab-btn-moodle').on('click', function() {
    if ($(this).prop('disabled')) return;
    $('.tab-btn-moodle').removeClass('border-primary text-ink').addClass('border-transparent text-muted-soft');
    $(this).removeClass('border-transparent text-muted-soft').addClass('border-primary text-ink');
    $('.tab-pane-moodle').addClass('hidden');
    $(`#${$(this).data('target')}`).removeClass('hidden');
  });

  const showBadge = (isSuccess, text) => {
    $statusBadge.removeClass('hidden bg-[#ecfccb] text-[#4d7c0f] border-[#bef264] bg-[#fee2e2] text-[#b91c1c] border-[#fca5a5]');
    $statusBadge.text(text);
    if (isSuccess) {
      $statusBadge.addClass('bg-[#ecfccb] text-[#4d7c0f] border-[#bef264]');
      enableSyncTab();
    } else {
      $statusBadge.addClass('bg-[#fee2e2] text-[#b91c1c] border-[#fca5a5]');
      disableSyncTab();
    }
  };

  const getCourseMap = () => {
    const map = {};
    $courseContainer.find('input[data-course-class]').each(function() {
      const cls = normalizeClassCode($(this).data('course-class'));
      const val = $(this).val();
      if (cls && val) map[cls] = parseInt(val, 10);
    });
    return map;
  };

  async function loadConfigForProject(projectId) {
    if (!projectId) return;
    $loadingState.removeClass('hidden');
    $formContainer.addClass('hidden');
    $endpointInput.val('');
    $tokenInput.val('');
    $tokenHint.addClass('hidden');
    $statusBadge.addClass('hidden');
    disableSyncTab();
    renderCourseMap({}, []);

    try {
      const res = await MoodleApi.getConfig(projectId);
      if (res.status === 'success' && res.data) {
        $endpointInput.val(res.data.rest_endpoint || '');
        if (res.data.hasToken) {
          $tokenHint.removeClass('hidden');
          $tokenMasked.text(res.data.token || 'tersimpan');
        }
        renderCourseMap(res.data.course_map || {}, res.data.course_routes || []);
        if (res.data.last_test_status) {
          showBadge(res.data.last_test_status === 'success', res.data.last_test_status === 'success' ? 'Terhubung' : 'Koneksi Bermasalah');
        }
      }
    } catch (error) {
      console.error('Gagal memuat Moodle Config', error);
    } finally {
      $loadingState.addClass('hidden');
      $formContainer.removeClass('hidden');
    }
  }

  let projects = [];
  try {
    const projRes = await ProjectApi.getAll();
    if (projRes.status === 'success') projects = projRes.data;
  } catch (e) {}

  if (projects.length === 0) {
    $loadingState.addClass('hidden');
    $emptyState.removeClass('hidden');
    $projectSelector.closest('div').hide();
    return;
  }

  $projectSelector.empty();
  projects.forEach(p => $projectSelector.append(`<option value="${p.id}">${p.name}</option>`));

  const urlParams = new URLSearchParams(window.location.search);
  const savedProjectId = urlParams.get('project_id') || localStorage.getItem('active_project_id');
  if (savedProjectId && projects.some(p => p.id === savedProjectId)) {
    $projectSelector.val(savedProjectId);
  } else {
    $projectSelector.val(projects[0].id);
    localStorage.setItem('active_project_id', projects[0].id);
  }

  loadConfigForProject($projectSelector.val());

  $projectSelector.on('change', function() {
    const newProjectId = $(this).val();
    localStorage.setItem('active_project_id', newProjectId);
    window.history.replaceState({}, document.title, window.location.pathname);
    loadConfigForProject(newProjectId);
  });

  $testBtn.on('click', async () => {
    const payload = { projectId: $projectSelector.val(), restEndpoint: $endpointInput.val(), token: $tokenInput.val() };
    if (!payload.restEndpoint) return toast('Endpoint Moodle harus diisi', 'error');

    const originalText = $testBtn.html();
    $testBtn.html('<i class="fa-solid fa-spinner fa-spin mr-2"></i> Menguji...').prop('disabled', true);

    try {
      const res = await MoodleApi.testConnection(payload);
      if (res.status === 'success') {
        showBadge(true, 'Terhubung');
        toast(`✅ Berhasil terhubung ke ${res.data.sitename}`);
      } else {
        showBadge(false, 'Gagal');
        toast(`❌ Gagal: ${res.message}`, 'error', 5000);
      }
    } catch (error) {
      showBadge(false, 'Gagal');
      toast('Terjadi kesalahan jaringan', 'error');
    } finally {
      $testBtn.html(originalText).prop('disabled', false);
    }
  });

  $syncCourseBtn.on('click', async () => {
    const payload = {
      projectId: $projectSelector.val(),
      restEndpoint: $endpointInput.val(),
      token: $tokenInput.val(),
      saveToConfig: true
    };
    if (!payload.restEndpoint) return toast('Endpoint Moodle harus diisi sebelum sync course', 'error');

    const originalText = $syncCourseBtn.html();
    $syncCourseBtn.html('<i class="fa-solid fa-spinner fa-spin mr-1"></i> Sync...').prop('disabled', true);

    try {
      const res = await MoodleApi.syncCourseMap(payload);
      if (res.status === 'success') {
        renderCourseMap(res.data.course_map || {}, res.data.course_routes || []);
        showBadge(true, 'Terhubung');
        if (res.data.course_map?.['9A']) {
          toast('✅ Course tersinkron, 9A sudah masuk mapping.');
        } else {
          toast(`✅ ${res.data.classes_found?.length || 0} kelas tersinkron dari Moodle.`);
        }
        $tokenInput.val('');
        await loadConfigForProject($projectSelector.val());
      } else {
        toast(res.message || 'Sync course gagal', 'error', 5000);
      }
    } catch (error) {
      toast('Sync course gagal: ' + (error.message || 'unknown error'), 'error', 5000);
    } finally {
      $syncCourseBtn.html(originalText).prop('disabled', false);
    }
  });

  $form.on('submit', async (e) => {
    e.preventDefault();
    const $btn = $('#btn-save-moodle');
    const originalText = $btn.html();
    $btn.html('<i class="fa-solid fa-spinner fa-spin mr-2"></i> Mengetes & menyimpan...').prop('disabled', true);

    const payload = {
      projectId: $projectSelector.val(),
      restEndpoint: $endpointInput.val(),
      token: $tokenInput.val(),
      courseMap: getCourseMap(),
      autoSyncCourses: true
    };

    try {
      const res = await MoodleApi.saveConfig(payload);
      if (res.status === 'success') {
        toast('✅ Konfigurasi berhasil dites dan disimpan');
        $tokenInput.val('');
        $tokenHint.removeClass('hidden');
        $tokenMasked.text(res.data.token || 'tersimpan');
        renderCourseMap(res.data.course_map || {}, res.data.course_routes || []);
        showBadge(true, 'Terhubung');
      } else {
        showBadge(false, 'Gagal');
        toast(res.message || 'Konfigurasi gagal disimpan', 'error', 5000);
      }
    } catch (error) {
      showBadge(false, 'Gagal');
      toast('Terjadi kesalahan sistem: ' + (error.message || 'unknown error'), 'error', 5000);
    } finally {
      $btn.html(originalText).prop('disabled', false);
    }
  });

  // ==========================================
  // --- UI LOGIC: RAG CHUNKING MODAL & WIZARD ---
  // ==========================================

  MoodleApi.getProjectChunks = (projectId) => ApiService.fetch(`/moodle/chunks?projectId=${projectId}`);
  MoodleApi.previewMaterials = (projectId) => ApiService.fetch(`/moodle/preview-materials?projectId=${projectId}`);
  MoodleApi.syncAllCourses = (payload) => ApiService.post('/moodle/sync/all', payload);
  MoodleApi.syncCourse = (payload) => ApiService.post('/moodle/sync/course', payload);

  const $modalChunks = $('#modal-view-chunks');
  const $modalWizard = $('#modal-sync-wizard');
  const $drawer = $('#preview-drawer');
  let loadedMaterials = [];

  const openModal = ($modal) => {
    $modal.removeClass('hidden');
    setTimeout(() => $modal.children().removeClass('scale-95 opacity-0').addClass('scale-100 opacity-100'), 10);
  };
  const closeModal = ($modal) => {
    $modal.children().removeClass('scale-100 opacity-100').addClass('scale-95 opacity-0');
    setTimeout(() => $modal.addClass('hidden'), 300);
  };
  $('.btn-close-modal').on('click', function() { closeModal($(this).closest('.fixed')); });

  // 1. TOMBOL LIHAT CHUNK (MODAL 1)
  $('#btn-open-chunk-modal').on('click', async () => {
    openModal($modalChunks);
    $('#chunks-loading').removeClass('hidden');
    $('#chunks-table, #chunks-empty').addClass('hidden');

    try {
      const res = await MoodleApi.getProjectChunks($projectSelector.val());
      if (res.status === 'success') {
        const chunks = res.data;
        if(chunks.length === 0){
           $('#chunks-empty').removeClass('hidden');
        } else {
           const tbody = $('#chunks-table-body').empty();
           chunks.forEach(chunk => {
             const isMoodle = chunk.metadata && chunk.metadata.source_origin === 'moodle';
             const badge = isMoodle
               ? `<span class="bg-[#e0f2fe] text-[#1e40af] px-2 py-1 rounded text-[11px] font-bold">MOODLE</span>`
               : `<span class="bg-surface-strong text-ink px-2 py-1 rounded text-[11px] font-bold">MANUAL</span>`;

             // PERBAIKAN: Gunakan CSS line-clamp-2 agar teks kepanjangan menjadi "..." di baris kedua
             tbody.append(`
               <tr class="hover:bg-canvas-soft transition-colors">
                 <td class="py-4 px-4 align-top">${badge}</td>
                 <td class="py-4 px-4 align-top font-medium text-ink">${chunk.topic || 'Tanpa Topik'}</td>
                 <td class="py-4 px-4 align-top">
                    <div class="line-clamp-2 text-body" title="${chunk.chunk_text}">${chunk.chunk_text}</div>
                 </td>
               </tr>
             `);
           });
           $('#chunks-table').removeClass('hidden');
        }
      }
    } catch (e) {
      Toastify({ text: "Gagal memuat database chunk", style: { background: "#dc2626" } }).showToast();
    } finally {
      $('#chunks-loading').addClass('hidden');
    }
  });

  // 2. TOMBOL KONEKSIKAN MATERI (WIZARD STEP 1)
  $('#btn-open-sync-wizard').on('click', async () => {
    openModal($modalWizard);

    $('#wizard-subtitle').text('Step 1: Review Materi & Aktivitas Moodle');
    $('#wizard-step-1').removeClass('hidden');
    $('#wizard-footer').addClass('hidden');
    $('#materials-empty').addClass('hidden'); // Sembunyikan empty state awal
    $('#wizard-step-2').addClass('hidden');
    $('#chunking-progress').removeClass('hidden');
    $('#chunking-success').addClass('hidden');
    $drawer.addClass('translate-x-full');

    $('#materials-loading').removeClass('hidden');
    $('#materials-grid').addClass('hidden').empty();

    try {
      const res = await MoodleApi.previewMaterials($projectSelector.val());
      if (res.status === 'success') {
        loadedMaterials = res.data;
        const grid = $('#materials-grid');

        $('#materials-loading').addClass('hidden');

        // PERBAIKAN: Tangani respons API data kosong [ ]
        if (loadedMaterials.length === 0) {
          $('#materials-empty').removeClass('hidden');
          $('#wizard-footer').addClass('hidden'); // Kunci proses chunking
        } else {
          loadedMaterials.forEach((mat, idx) => {
            grid.append(`
              <div class="material-card bg-surface-card border border-hairline hover:border-primary p-4 rounded-[12px] cursor-pointer shadow-sm transition-all" data-index="${idx}">
                <div class="text-[11px] font-bold text-muted mb-1 uppercase tracking-wide">Kelas ${mat.classCode} • ${mat.modname}</div>
                <h4 class="text-[15px] font-medium text-ink leading-tight mb-2">${mat.moduleName}</h4>
                <p class="text-[13px] text-body line-clamp-2">${mat.previewText}</p>
              </div>
            `);
          });
          grid.removeClass('hidden');
          $('#wizard-footer').removeClass('hidden');
        }
      }
    } catch (e) {
      Toastify({ text: "Gagal memuat preview materi", style: { background: "#dc2626" } }).showToast();
      closeModal($modalWizard);
    }
  });

  // Klik Kartu untuk Buka Drawer
  $(document).on('click', '.material-card', function() {
    const idx = $(this).data('index');
    const mat = loadedMaterials[idx];
    $('#preview-drawer-content').text(mat.fullText);
    $drawer.removeClass('translate-x-full');
  });

  // Tutup Drawer
  $('#btn-close-drawer').on('click', () => {
    $drawer.addClass('translate-x-full');
  });

  // 3. MULAI CHUNKING (WIZARD STEP 2)
  $('#btn-start-chunking').on('click', async () => {
    $('#wizard-step-1, #wizard-footer').addClass('hidden');
    $drawer.addClass('translate-x-full');
    $('#wizard-subtitle').text('Step 2: Sync Course, Aktivitas & Chunking');
    $('#wizard-step-2').removeClass('hidden');

    const resetChunks = $('#reset-moodle-chunks').is(':checked');
    const classCode = $('#sync-class-selector').val();
    const activeProjectId = $projectSelector.val();

    try {
      let res;
      if (classCode === 'ALL') {
        res = await MoodleApi.syncAllCourses({ projectId: activeProjectId, resetMoodleChunks: resetChunks });
      } else {
        const courseId = $(`#course_${classCode}`).val();
        res = await MoodleApi.syncCourse({ projectId: activeProjectId, classCode, courseId, resetMoodleChunks: resetChunks });
      }

      if (res.status === 'success') {
        $('#chunking-progress').addClass('hidden');
        $('#chunking-success').removeClass('hidden');

        const s = res.data;
        $('#sync-summary-list').html(`
          <li class="flex justify-between border-b border-hairline-soft pb-2"><span>Course/Kelas Diproses</span> <b>${s.coursesProcessed || (s.courseRouteUpdated ? 1 : 0)}</b></li>
          <li class="flex justify-between border-b border-hairline-soft pb-2 text-primary"><span>Aktivitas Masuk lms_activity_routes</span> <b>${s.activitiesSynced || s.routesUpdated || 0}</b></li>
          <li class="flex justify-between border-b border-hairline-soft pb-2"><span>Materi HTML Diolah</span> <b>${s.materialsSynced || 0}</b></li>
          <li class="flex justify-between border-b border-hairline-soft pb-2 text-primary"><span>Potongan Teks (Chunk) Masuk DB</span> <b>${s.chunksCreated || 0}</b></li>
          <li class="flex justify-between border-b border-hairline-soft pb-2"><span>Module Moodle Dibaca</span> <b>${s.modulesFound || 0}</b></li>
          <li class="flex justify-between text-muted-soft"><span>Teks Terlalu Pendek (Diabaikan)</span> <b>${s.skippedTooShort || 0}</b></li>
        `);
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      Toastify({ text: "Proses chunking gagal: " + e.message, duration: 5000, style: { background: "#dc2626" } }).showToast();
      closeModal($modalWizard);
    }
  });

});
