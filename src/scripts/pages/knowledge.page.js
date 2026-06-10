import $ from 'jquery';
import { ApiService } from '../fetch/api.js';
import { DocumentAPI } from '../fetch/document.fetch.js';
import { KnowledgeAPI } from '../fetch/knowledge.fetch.js';
import { SourceViewer } from '../components/source-viewer.js';

$(document).ready(function () {
  let activeProjectId = '';
  let activeProjectKey = '';

  // Inisiasi fitur Fullscreen Source Viewer
  SourceViewer.init();

  const store = {
    documents: { data: [], page: 1, limit: 10 },
    faqs: { data: [], page: 1, limit: 10 },
    activities: { data: [], page: 1, limit: 10 },
    templates: { data: [], page: 1, limit: 10 } // [TAMBAH INI]
  };

  // ==========================================
  // SOURCE TYPE FILTER LOGIC (Panel QA)
  // ==========================================
  let kbSelectedSourceType = 'document_chunk';
  let kbSelectedSourceEmptyMessage = 'Belum ada materi yang cocok untuk pertanyaan ini.';

  function setKbSourceType(sourceType, emptyMessage) {
    kbSelectedSourceType = sourceType || 'document_chunk';
    kbSelectedSourceEmptyMessage = emptyMessage || 'Belum ada konteks yang cocok.';

    $('#kb-source-type').val(kbSelectedSourceType);
    $('#kb-source-empty-message').val(kbSelectedSourceEmptyMessage);

    // Reset styles for pill buttons
    $('.kb-source-type-btn')
      .removeClass('bg-primary text-white border-primary')
      .addClass('bg-white text-ink border-hairline hover:bg-canvas-soft');

    // Activate the selected pill button
    $(`.kb-source-type-btn[data-source-type="${kbSelectedSourceType}"]`)
      .addClass('bg-primary text-white border-primary')
      .removeClass('bg-white text-ink border-hairline hover:bg-canvas-soft');
  }

  $(document).on('click', '.kb-source-type-btn', function () {
    setKbSourceType($(this).data('source-type'), $(this).data('empty-message'));
  });


  // ==========================================
  // DRAWER LOGIC (TAMBAH DATA UI)
  // ==========================================
  const setupInnerTabs = (prefix) => {
    $(`#btn-${prefix}-tab-excel`).on('click', function() {
      $(this).addClass('bg-white shadow-sm text-ink').removeClass('text-muted hover:text-ink');
      $(`#btn-${prefix}-tab-manual`).removeClass('bg-white shadow-sm text-ink').addClass('text-muted hover:text-ink');
      $(`#${prefix}-content-manual`).addClass('hidden');
      $(`#${prefix}-content-excel`).removeClass('hidden');
    });

    $(`#btn-${prefix}-tab-manual`).on('click', function() {
      $(this).addClass('bg-white shadow-sm text-ink').removeClass('text-muted hover:text-ink');
      $(`#btn-${prefix}-tab-excel`).removeClass('bg-white shadow-sm text-ink').addClass('text-muted hover:text-ink');
      $(`#${prefix}-content-excel`).addClass('hidden');
      $(`#${prefix}-content-manual`).removeClass('hidden');
    });
  };

  setupInnerTabs('faq');
  setupInnerTabs('act');

  const openDrawer = (formType, title) => {
    $('#drawer-title').text(title);
    $('#drawer-doc, #drawer-faq, #drawer-act, #drawer-tpl').addClass('hidden').removeClass('block flex');

    if (formType === 'doc') $('#drawer-doc').removeClass('hidden').addClass('block');
    if (formType === 'faq') $('#drawer-faq').removeClass('hidden').addClass('flex');
    if (formType === 'act') $('#drawer-act').removeClass('hidden').addClass('flex');
    if (formType === 'tpl') $('#drawer-tpl').removeClass('hidden').addClass('flex'); // TAMBAHAN

    if(formType === 'faq' || formType === 'act') $(`#btn-${formType}-tab-excel`).click();

    $('#kb-drawer').addClass('translate-y-0 md:translate-x-0').removeClass('translate-y-full md:translate-x-full');
    $('#kb-overlay').removeClass('invisible opacity-0 pointer-events-none').addClass('visible opacity-100 pointer-events-auto');
  };

  const closeDrawer = () => {
    $('#kb-drawer').removeClass('translate-y-0 md:translate-x-0').addClass('translate-y-full md:translate-x-full');
    $('#kb-overlay').removeClass('visible opacity-100 pointer-events-auto').addClass('invisible opacity-0 pointer-events-none');
  };

  $('#btn-close-drawer, #kb-overlay').on('click', closeDrawer);

  $('.btn-open-drawer').on('click', function() {
    const formType = $(this).data('form');
    let title = "Tambah Data";
    if(formType === 'doc') title = "Tambah Materi / Dokumen";
    if(formType === 'faq') title = "Tambah FAQ Baru";
    if(formType === 'act') title = "Tambah Instruksi Aktivitas";
    if(formType === 'tpl') title = "Import Konteks HTML"; // TAMBAHAN
    openDrawer(formType, title);
  });

  // ==========================================
  // DROPZONE EXCEL
  // ==========================================
  $('#dropzone-faq').on('click', () => $('#file-import-faq').click());
  $('#file-import-faq').on('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      $('#btn-import-faq').prop('disabled', false);
      $('#filename-faq').removeClass('hidden').find('.name').text(file.name);
    } else {
      $('#btn-import-faq').prop('disabled', true);
      $('#filename-faq').addClass('hidden');
    }
  });

  $('#dropzone-act').on('click', () => $('#file-import-act').click());
  $('#file-import-act').on('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      $('#btn-import-act').prop('disabled', false);
      $('#filename-act').removeClass('hidden').find('.name').text(file.name);
    } else {
      $('#btn-import-act').prop('disabled', true);
      $('#filename-act').addClass('hidden');
    }
  });

  $('.kb-tab-btn').on('click', function () {
    $('.kb-tab-btn').removeClass('border-primary text-ink').addClass('border-transparent text-muted');
    $(this).addClass('border-primary text-ink').removeClass('border-transparent text-muted');
    $('.kb-tab-pane').addClass('hidden').removeClass('flex');
    $(`#${$(this).data('target')}`).removeClass('hidden').addClass('flex');
  });

  // ==========================================
  // DROPZONE HTML
  // ==========================================
  $('#dropzone-tpl').on('click', () => $('#file-import-tpl').click());
  $('#file-import-tpl').on('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      const fileName = file.name;
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, ""); // Hapus .html
      $('#filename-tpl').removeClass('hidden').find('.name').text(fileName);

      // AUTO-FILL: Jika input nama masih kosong, isi dengan nama file
      if (!$('#tpl_name').val().trim()) {
        $('#tpl_name').val(nameWithoutExt);
      }
    } else {
      $('#filename-tpl').addClass('hidden');
    }
  });

  $('#tpl_type').on('change', function() {
    if ($(this).val() === 'custom') {
      $('#tpl_type_custom').removeClass('hidden').prop('required', true).focus();
    } else {
      $('#tpl_type_custom').addClass('hidden').prop('required', false).val('');
    }
  });

  // Update Logic Submit Form HTML
  $('#form-template-html').on('submit', async function (e) {
    e.preventDefault();

    // Ambil project id dari variabel global yang sudah ada di knowledge.page.js
    if(!activeProjectId) return Toastify({ text: "Pilih project dulu", backgroundColor: "var(--color-semantic-error)" }).showToast();

    const file = $('#file-import-tpl')[0].files[0];
    if (!file) return Toastify({ text: "Pilih file HTML", backgroundColor: "var(--color-semantic-error)" }).showToast();

    const selectedType = $('#tpl_type').val();
    const finalPageType = selectedType === 'custom' ? $('#tpl_type_custom').val().trim() : selectedType;

    if (!finalPageType) return Toastify({ text: "Tipe halaman custom tidak boleh kosong", backgroundColor: "var(--color-semantic-error)" }).showToast();

    const $btn = $('#btn-submit-tpl');
    const originalHtml = $btn.html();
    $btn.html('<i class="fa-solid fa-spinner fa-spin mr-2"></i> Mengunggah...').prop('disabled', true);

    const formData = new FormData();
    // Ini akan otomatis terisi dengan ID project yang sedang dipilih di dropdown atas
    formData.append('project_id', activeProjectId);
    formData.append('template_name', $('#tpl_name').val());
    formData.append('page_type', finalPageType);
    formData.append('file', file);

    try {
      // 1. Ambil Base URL API dari environment kamu
      const API_BASE = import.meta.env.PUBLIC_API_BASE_URL || '/api';

      // 2. Ambil token (opsional: sesuaikan jika kamu menggunakan nama key yang berbeda di localStorage)
      const token = localStorage.getItem('token') || '';

      // 3. Gunakan fetch native agar FormData dikirim sempurna tanpa diubah jadi JSON
      const rawResponse = await fetch(`${API_BASE}/knowledge/templates/import-html`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}` // Hapus baris header ini jika auth kamu menggunakan Cookie HTTP-Only
        },
        body: formData
      });

      const res = await rawResponse.json();

      if (res && res.status !== 'error') {
        Toastify({ text: "Konteks HTML berhasil diunggah!", backgroundColor: "var(--color-primary)" }).showToast();
        $('#form-template-html')[0].reset();
        $('#filename-tpl').addClass('hidden');
        $('#tpl_type_custom').addClass('hidden');
        closeDrawer();
        // BUG FIX: Reload tabel templates setelah upload berhasil agar tombol Hapus muncul
        await loadTemplates();
      } else {
        Toastify({ text: res.message || "Gagal mengunggah konteks", backgroundColor: "var(--color-semantic-error)" }).showToast();
      }
    } catch (error) {
      console.error(error);
      Toastify({ text: "Terjadi kesalahan jaringan/sistem", backgroundColor: "var(--color-semantic-error)" }).showToast();
    }

    $btn.html(originalHtml).prop('disabled', false);
  });

  // ======================================================
  // KNOWLEDGE BASE QA / VALIDATION
  // ======================================================
  let kbValidationState = { chunks: [], warnings: [], readinessItems: [] };

  function normalizeArray(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.results)) return res.results;
    if (Array.isArray(res.items)) return res.items;
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data?.results)) return res.data.results;
    if (Array.isArray(res.data?.items)) return res.data.items;
    if (Array.isArray(res.data?.data)) return res.data.data;
    return [];
  }

  function escapeHtml(value = '') { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
  function truncateText(value = '', max = 220) { const text = String(value || '').trim(); if (text.length <= max) return text; return `${text.substring(0, max)}...`; }
  function isIndexedDocument(doc) { return doc.status === 'indexed'; }
  function showToast(text, type = 'success') { Toastify({ text, backgroundColor: type === 'error' ? 'var(--color-semantic-error)' : 'var(--color-primary)' }).showToast(); }

  function openKbTestPanel(targetTab = 'kb-panel-summary') {
    $('#kb-test-overlay').removeClass('invisible opacity-0 pointer-events-none').addClass('visible opacity-100 pointer-events-auto');
    $('#kb-test-panel').removeClass('translate-y-full md:translate-x-full').addClass('translate-y-0 md:translate-x-0');
    activateKbTestTab(targetTab);
  }

  function closeKbTestPanel() {
    $('#kb-test-overlay').removeClass('visible opacity-100 pointer-events-auto').addClass('invisible opacity-0 pointer-events-none');
    $('#kb-test-panel').removeClass('translate-y-0 md:translate-x-0').addClass('translate-y-full md:translate-x-full');
  }

  function activateKbTestTab(targetId) {
    $('.kb-test-tab-btn').removeClass('bg-white shadow-sm text-ink').addClass('text-muted hover:text-ink');
    $(`.kb-test-tab-btn[data-target="${targetId}"]`).addClass('bg-white shadow-sm text-ink').removeClass('text-muted hover:text-ink');
    $('.kb-test-tab-pane').addClass('hidden');
    $(`#${targetId}`).removeClass('hidden');
  }

  $('#btn-open-kb-test-panel').on('click', () => openKbTestPanel('kb-panel-summary'));
  $('#btn-close-kb-test-panel, #kb-test-overlay').on('click', closeKbTestPanel);
  $('.kb-test-tab-btn').on('click', function () { activateKbTestTab($(this).data('target')); });

  // (Fungsi-fungsi validasi & warning biarkan utuh)
  async function loadKnowledgeValidation() {
    if (!activeProjectId) return;
    $('#kb-core-status-badge').text('Memuat...');
    $('#kb-readiness-list').html(`<div class="text-[13px] text-muted-soft"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat validasi...</div>`);
    try {
      const chunkRes = await KnowledgeAPI.getChunksByProject(activeProjectId);
      kbValidationState.chunks = normalizeArray(chunkRes);
    } catch (error) { kbValidationState.chunks = []; }
    buildReadinessState(); buildQualityWarnings(); renderCoreValidation(); renderReadinessChecklist(); renderQualityWarnings();
  }

  function buildReadinessState() {
    const documents = store.documents.data || []; const faqs = store.faqs.data || []; const activities = store.activities.data || []; const chunks = kbValidationState.chunks || [];
    const indexedDocs = documents.filter(isIndexedDocument); const unindexedDocs = documents.filter(doc => !isIndexedDocument(doc));
    kbValidationState.readinessItems = [
      { ok: documents.length > 0, label: 'Ada dokumen materi', detail: documents.length > 0 ? `${documents.length} dokumen tersedia` : 'Belum ada dokumen materi' },
      { ok: documents.length > 0 && unindexedDocs.length === 0, label: 'Semua dokumen penting sudah diindex', detail: documents.length === 0 ? 'Upload dokumen dulu' : unindexedDocs.length === 0 ? `${indexedDocs.length} dokumen sudah indexed` : `Ada ${unindexedDocs.length} dokumen belum diindex` },
      { ok: faqs.length > 0, label: 'Ada FAQ', detail: faqs.length > 0 ? `${faqs.length} FAQ tersedia` : 'FAQ masih kosong' },
      { ok: activities.length > 0, label: 'Ada instruksi aktivitas', detail: activities.length > 0 ? `${activities.length} instruksi tersedia` : 'Instruksi aktivitas masih kosong' },
      { ok: chunks.length > 0, label: 'Retrieval punya chunk/konteks', detail: chunks.length > 0 ? `${chunks.length} chunk tersedia` : 'Belum ada chunk untuk project' },
      { ok: documents.length > 0 && faqs.length > 0 && activities.length > 0 && chunks.length > 0, label: 'Siap untuk test AI', detail: documents.length > 0 && faqs.length > 0 && activities.length > 0 && chunks.length > 0 ? 'Knowledge base cukup siap untuk diuji' : 'Lengkapi data sebelum test AI serius' }
    ];
  }

  function buildQualityWarnings() {
    const documents = store.documents.data || []; const faqs = store.faqs.data || []; const activities = store.activities.data || []; const chunks = kbValidationState.chunks || [];
    const warnings = []; const unindexedDocs = documents.filter(doc => !isIndexedDocument(doc));
    if (documents.length === 0) warnings.push('Belum ada dokumen materi. Upload minimal 1 materi.');
    if (unindexedDocs.length > 0) warnings.push(`Ada ${unindexedDocs.length} dokumen belum diindex.`);
    if (chunks.length === 0) warnings.push('Tidak ada chunk untuk project. Retrieval dari materi belum bisa jalan.');
    if (documents.length > 0 && chunks.length > 0 && chunks.length < documents.length) warnings.push('Jumlah chunk terlihat terlalu sedikit dibanding jumlah dokumen. Cek hasil parsing/index.');
    if (faqs.length === 0) warnings.push('FAQ masih kosong. Tambahkan FAQ agar pertanyaan umum bisa dijawab hemat token.');
    faqs.forEach((faq, index) => {
      const question = String(faq.question || '').trim(); const answer = String(faq.answer || '').trim();
      if (question.length > 0 && question.length < 8) warnings.push(`FAQ baris ${index + 1}: pertanyaan terlalu pendek.`);
      if (answer.length < 15) warnings.push(`FAQ baris ${index + 1}: jawaban kosong atau terlalu pendek.`);
    });
    if (activities.length === 0) warnings.push('Instruksi aktivitas masih kosong. Tambahkan instruksi untuk tugas/quiz/VClass.');
    activities.forEach((act, index) => {
      const instruction = String(act.instruction || '').trim();
      if (instruction.length < 20) warnings.push(`Instruksi aktivitas baris ${index + 1}: instruction kosong atau terlalu pendek.`);
    });
    kbValidationState.warnings = warnings;
  }

  function renderCoreValidation() {
    const documents = store.documents.data || []; const faqs = store.faqs.data || []; const activities = store.activities.data || []; const chunks = kbValidationState.chunks || []; const warnings = kbValidationState.warnings || []; const readinessItems = kbValidationState.readinessItems || [];
    const indexedDocs = documents.filter(isIndexedDocument); const okCount = readinessItems.filter(item => item.ok).length; const total = readinessItems.length || 6;
    $('#kb-core-documents-count').text(documents.length); $('#kb-core-indexed-count').text(indexedDocs.length); $('#kb-core-faq-count').text(faqs.length); $('#kb-core-activity-count').text(activities.length); $('#kb-core-chunk-count').text(chunks.length);
    if (okCount === total) { $('#kb-core-status-badge').removeClass().addClass('text-[12px] px-2.5 py-1 rounded-full bg-[#16a34a]/10 border border-[#16a34a]/20 text-[#16a34a]').text(`Siap ${okCount}/${total}`); } else { $('#kb-core-status-badge').removeClass().addClass('text-[12px] px-2.5 py-1 rounded-full bg-[#f59e0b]/10 border border-[#f59e0b]/20 text-[#b45309]').text(`Perlu dicek ${okCount}/${total}`); }
    if (!warnings.length) { $('#kb-core-warning-preview').html(`<div class="bg-[#16a34a]/10 border border-[#16a34a]/20 rounded-[14px] p-4 text-[13px] text-[#16a34a] flex items-start gap-3"><i class="fa-solid fa-circle-check mt-0.5"></i><div><div class="font-medium">Data knowledge base terlihat cukup rapi.</div><div class="text-[12px] opacity-80 mt-0.5">Silakan lanjut test retrieval atau test AI lewat panel.</div></div></div>`); return; }
    const preview = warnings.slice(0, 2).map(item => `<li class="flex items-start gap-2"><i class="fa-solid fa-triangle-exclamation text-[#f59e0b] mt-0.5"></i><span>${escapeHtml(item)}</span></li>`).join('');
    const moreText = warnings.length > 2 ? `<button type="button" class="btn-open-warning-panel text-primary hover:underline font-medium ml-1">+${warnings.length - 2} warning lain</button>` : '';
    $('#kb-core-warning-preview').html(`<div class="bg-[#f59e0b]/10 border border-[#f59e0b]/20 rounded-[14px] p-4 text-[13px] text-body"><div class="font-medium text-ink mb-2"><i class="fa-solid fa-triangle-exclamation text-[#f59e0b] mr-1.5"></i>Ada ${warnings.length} warning kualitas data</div><ul class="space-y-1">${preview}</ul><div class="text-[12px] text-muted-soft mt-2">Buka panel testing untuk detail. ${moreText}</div></div>`);
  }

  function renderReadinessChecklist() {
    const readinessItems = kbValidationState.readinessItems || []; const okCount = readinessItems.filter(item => item.ok).length;
    $('#kb-readiness-score').text(`${okCount}/${readinessItems.length || 6}`);
    if (!readinessItems.length) { $('#kb-readiness-list').html(`<div class="text-[13px] text-muted-soft">Belum ada data readiness.</div>`); return; }
    const html = readinessItems.map(item => {
      const icon = item.ok ? `<i class="fa-solid fa-check text-[#16a34a]"></i>` : `<i class="fa-solid fa-triangle-exclamation text-[#f59e0b]"></i>`;
      const bgClass = item.ok ? 'bg-[#16a34a]/10 border-[#16a34a]/20' : 'bg-[#f59e0b]/10 border-[#f59e0b]/20';
      return `<div class="flex items-start gap-3 border ${bgClass} rounded-[12px] p-3"><div class="w-5 shrink-0 mt-0.5">${icon}</div><div><div class="font-medium text-ink text-[14px]">${escapeHtml(item.label)}</div><div class="text-[12px] text-muted-soft mt-0.5">${escapeHtml(item.detail)}</div></div></div>`;
    }).join('');
    $('#kb-readiness-list').html(html);
  }

  function renderQualityWarnings() {
    const warnings = kbValidationState.warnings || [];
    $('#kb-warning-count').text(`${warnings.length} warning`);
    if (!warnings.length) { $('#kb-quality-warning-list').html(`<div class="bg-[#16a34a]/10 border border-[#16a34a]/20 rounded-[12px] p-3 text-[#16a34a] text-[13px]"><i class="fa-solid fa-check mr-2"></i>Data knowledge base terlihat cukup rapi.</div>`); return; }
    const html = warnings.map(warning => `<div class="bg-[#f59e0b]/10 border border-[#f59e0b]/20 rounded-[12px] p-3 text-body text-[13px]"><i class="fa-solid fa-triangle-exclamation text-[#f59e0b] mr-2"></i>${escapeHtml(warning)}</div>`).join('');
    $('#kb-quality-warning-list').html(html);
  }


  // ==========================================
  // RETRIEVAL & AI TESTING LOGIC
  // ==========================================
  function getKbTestQuestion() { const retrievalQuestion = String($('#kb-test-question').val() || '').trim(); const aiQuestion = String($('#kb-ai-test-question').val() || '').trim(); const activeTabId = $('.kb-test-tab-pane:not(.hidden)').attr('id'); return activeTabId === 'kb-panel-ai' ? (aiQuestion || retrievalQuestion) : (retrievalQuestion || aiQuestion); }
  function setKbQuestionToAllInputs(question) { $('#kb-test-question').val(question); $('#kb-ai-test-question').val(question); }
  function setButtonLoading($btn, isLoading, loadingText) { if (isLoading) { $btn.data('original-html', $btn.html()); $btn.html(`<i class="fa-solid fa-spinner fa-spin mr-2"></i>${loadingText}`); $btn.prop('disabled', true); } else { $btn.html($btn.data('original-html')); $btn.prop('disabled', false); } }
  function buildKbPageContext() { return { title: 'Knowledge Base Test', heading: 'Dashboard Knowledge', textPreview: 'Admin sedang menguji knowledge base project.' }; }

  // MENGUBAH RENDER RETRIEVAL MENJADI ACCORDION
  function renderRetrievalResults(results) {
    $('#kb-retrieval-count').text(`${results.length} context`);

    if (!results.length) {
      $('#kb-retrieval-result').html(`
        <div class="bg-[#f59e0b]/10 border border-[#f59e0b]/20 rounded-[12px] p-4 text-body text-[13px]">
          <i class="fa-solid fa-triangle-exclamation text-[#f59e0b] mr-2"></i>
          ${escapeHtml(kbSelectedSourceEmptyMessage || 'Belum ada konteks yang cocok.')}
        </div>
      `);
      return;
    }

    const html = results.map((item, index) => {
      const isOpen = index === 0; // Hanya item pertama yang kebuka secara default
      const metadata = item.metadata || {};
      const canOpenPdf = item.source_type === 'document_chunk' ||
                         item.sourceType === 'document_chunk' ||
                         item.source_type === 'document' ||
      (metadata && metadata.file_url);
      const safePayload = encodeURIComponent(JSON.stringify(item));

      return `
        <div class="kb-result-accordion bg-white border border-hairline rounded-[14px] overflow-hidden mb-3">
          <button
            type="button"
            class="kb-result-toggle w-full p-4 flex items-start justify-between gap-4 text-left hover:bg-canvas-soft transition-colors"
          >
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2 mb-2">
                <span class="text-[11px] px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                  #${index + 1} ${escapeHtml(item.source_type || '-')}
                </span>
                <span class="text-[11px] px-2 py-1 rounded-full bg-canvas-soft border border-hairline text-muted">
                  score: ${escapeHtml(item.score ?? '-')}
                </span>
                ${metadata.page_number ? `
                  <span class="text-[11px] px-2 py-1 rounded-full bg-canvas-soft border border-hairline text-muted">
                    halaman ${escapeHtml(metadata.page_number)}
                  </span>
                ` : ''}
              </div>

              <div class="font-medium text-ink text-[14px] truncate">
                ${escapeHtml(item.title || '-')}
              </div>

              <div class="text-[12px] text-muted-soft mt-0.5">
                Topic: ${escapeHtml(item.topic || '-')}
              </div>
            </div>

            <i class="fa-solid fa-chevron-down text-muted-soft mt-1 transition-transform ${isOpen ? 'rotate-180' : ''}"></i>
          </button>

          <div class="kb-result-content ${isOpen ? '' : 'hidden'} border-t border-hairline p-4">
            <div class="text-[13px] text-body whitespace-pre-line leading-relaxed">
              ${escapeHtml(truncateText(item.content || '', 520))}
            </div>

            <div class="flex flex-wrap gap-2 mt-4">
              ${canOpenPdf ? `
                <button
                  type="button"
                  class="btn-open-source-viewer bg-primary text-white px-3 py-2 rounded-full text-[12px] font-medium hover:bg-primary-active transition-colors shadow-sm"
                  data-source="${safePayload}"
                >
                  <i class="fa-solid fa-file-pdf mr-1.5"></i> Lihat sumber referensi
                </button>
              ` : ''}

              <details class="w-full mt-2">
                <summary class="cursor-pointer text-[12px] text-muted-soft hover:text-ink">
                  Lihat metadata
                </summary>
                <pre class="mt-2 text-[11px] bg-canvas-soft border border-hairline rounded-[10px] p-3 overflow-auto">${escapeHtml(JSON.stringify(metadata, null, 2))}</pre>
              </details>
            </div>
          </div>
        </div>
      `;
    }).join('');

    $('#kb-retrieval-result').html(html);
  }

  // ACCORDION TOGGLE EVENT
  $(document).on('click', '.kb-result-toggle', function () {
    const $card = $(this).closest('.kb-result-accordion');
    const $content = $card.find('.kb-result-content');
    const $icon = $(this).find('.fa-chevron-down');

    // Tutup accordion lain yang sedang terbuka
    $('.kb-result-content').not($content).addClass('hidden');
    $('.kb-result-toggle .fa-chevron-down').not($icon).removeClass('rotate-180');

    // Buka/Tutup accordion yang diklik
    $content.toggleClass('hidden');
    $icon.toggleClass('rotate-180');
  });


  async function runRetrievalTest() {
    const query = getKbTestQuestion();
    if (!activeProjectId) return showToast('Pilih project dulu', 'error');
    if (!query) return showToast('Isi pertanyaan test dulu', 'error');

    setKbQuestionToAllInputs(query);
    activateKbTestTab('kb-panel-retrieval');

    const $btn = $('#btn-test-retrieval');
    setButtonLoading($btn, true, 'Menguji...');
    $('#kb-retrieval-result').html(`<div class="text-[13px] text-muted-soft"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Mengambil konteks retrieval...</div>`);

    try {
      const res = await KnowledgeAPI.testRetrieval({
        projectId: activeProjectId,
        query,
        sourceType: kbSelectedSourceType,
        pageContext: {
          ...buildKbPageContext(),
          expectedSourceType: kbSelectedSourceType
        },
        limit: 5
      });

      // INJEKSI QUERY KE DALAM PAYLOAD (BUG 2 FIX)
      const resultsWithQuery = normalizeArray(res).map(item => ({
        ...item,
        query: query // Disisipkan agar terbaca di source-viewer.js
      }));

      renderRetrievalResults(resultsWithQuery);
    } catch (error) {
      $('#kb-retrieval-result').html(`<div class="bg-red-500/10 border border-red-500/20 rounded-[12px] p-3 text-body text-[13px]">Gagal menjalankan retrieval test.</div>`);
    }
    setButtonLoading($btn, false);
  }

  function extractSessionId(res) { return res?.data?.id || res?.data?.sessionId || res?.data?.session_id || res?.sessionId || res?.session_id || res?.id || null; }

  async function getOrCreateKbTestSession() {
    const storageKey = `kb_test_session_${activeProjectId}`; const existingSessionId = sessionStorage.getItem(storageKey);
    if (existingSessionId) return existingSessionId;
    const res = await KnowledgeAPI.createChatSession({
      projectId: activeProjectId,
      projectKey: activeProjectKey || activeProjectId,
      studentAlias: 'Admin Knowledge Test',
      sourceUrl: window.location.href,
      pageContext: buildKbPageContext()
    });
    const sessionId = extractSessionId(res);
    if (!sessionId) throw new Error('Session test gagal dibuat.');
    sessionStorage.setItem(storageKey, sessionId); return sessionId;
  }

  function normalizeAiUsage(aiUsage) {
    if (!aiUsage) return { text: 'AI usage: -', canUseAI: true };
    const used = aiUsage.used ?? aiUsage.count ?? aiUsage.current ?? aiUsage.ai_used ?? 0; const limit = aiUsage.limit ?? aiUsage.max ?? 3;
    const canUseAI = aiUsage.canUseAI ?? aiUsage.can_use_ai ?? used < limit; const cooldownUntil = aiUsage.cooldownUntil ?? aiUsage.cooldown_until ?? null;
    let text = `AI usage: ${used}/${limit}`;
    if (!canUseAI) text += cooldownUntil ? ' - cooldown aktif' : ' - limit aktif';
    return { text, canUseAI, cooldownUntil };
  }

  function getBotMessageText(res) { return res?.data?.botMessage?.message || res?.data?.bot_message?.message || res?.data?.message || res?.botMessage?.message || res?.bot_message?.message || res?.message || 'Tidak ada pesan balasan.'; }
  function getResponseSource(res) { return res?.data?.response_source || res?.data?.responseSource || res?.response_source || res?.responseSource || 'unknown'; }
  function getIntent(res) { return res?.data?.intent || res?.intent || '-'; }
  function getAiUsage(res) { return res?.data?.ai_usage || res?.data?.aiUsage || res?.ai_usage || res?.aiUsage || null; }
  function getRetrievalFromAiResponse(res) { return res?.data?.retrievalResults || res?.data?.retrieval_results || res?.data?.context_used?.retrievalResults || res?.data?.context_used?.retrieval_results || res?.retrievalResults || res?.retrieval_results || []; }

  function renderAiResult(res) {
    const message = getBotMessageText(res); const responseSource = getResponseSource(res); const intent = getIntent(res); const aiUsage = normalizeAiUsage(getAiUsage(res)); const retrievalResults = normalizeArray(getRetrievalFromAiResponse(res));
    const sourceLabel = responseSource === 'ai' ? 'Jawaban AI' : responseSource === 'system' ? 'Jawaban Sistem' : responseSource;
    const sourceClass = responseSource === 'ai' ? 'bg-primary/10 text-primary' : 'bg-[#f59e0b]/10 text-[#b45309]';
    $('#kb-ai-usage').text(aiUsage.text);
    const sourcesHtml = retrievalResults.length > 0 ? `<div class="mt-4"><div class="text-[12px] font-semibold text-muted-soft uppercase mb-2">Top Sources</div><div class="space-y-2">${retrievalResults.slice(0, 3).map((item, index) => `<div class="bg-canvas-soft border border-hairline rounded-[10px] p-3"><div class="text-[12px] text-primary font-medium">#${index + 1} ${escapeHtml(item.source_type || '-')} · score ${escapeHtml(item.score ?? '-')}</div><div class="text-[13px] text-ink font-medium mt-1">${escapeHtml(item.title || '-')}</div><div class="text-[12px] text-muted-soft mt-1">${escapeHtml(truncateText(item.content || '', 130))}</div></div>`).join('')}</div></div>` : `<div class="mt-4 text-[12px] text-muted-soft">Tidak ada top sources pada response.</div>`;
    $('#kb-ai-result').html(`<div class="bg-white border border-hairline rounded-[14px] p-4"><div class="flex flex-wrap items-center gap-2 mb-3"><span class="text-[11px] px-2 py-1 rounded-full ${sourceClass} font-medium">${escapeHtml(sourceLabel)}</span><span class="text-[11px] px-2 py-1 rounded-full bg-canvas-soft border border-hairline text-muted">intent: ${escapeHtml(intent)}</span></div><div class="text-[14px] text-body whitespace-pre-line leading-relaxed">${escapeHtml(message)}</div>${sourcesHtml}</div>`);
  }

  async function runAiAnswerTest() {
    const query = getKbTestQuestion();
    if (!activeProjectId) return showToast('Pilih project dulu', 'error');
    if (!query) return showToast('Isi pertanyaan test dulu', 'error');

    setKbQuestionToAllInputs(query);
    activateKbTestTab('kb-panel-ai');

    const $btn = $('#btn-test-ai-answer');
    setButtonLoading($btn, true, 'Menguji AI...');
    $('#kb-ai-result').html(`<div class="text-[13px] text-muted-soft"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Mengirim pertanyaan ke chat flow...</div>`);

    try {
      const sessionId = await getOrCreateKbTestSession();
      const res = await KnowledgeAPI.sendChatMessage({
        sessionId,
        projectId: activeProjectId,
        projectKey: activeProjectKey || activeProjectId,
        message: query,
        expectedSourceType: kbSelectedSourceType, // FILTER TERUSKAN KE CHAT CONTROLLER
        pageContext: {
          ...buildKbPageContext(),
          expectedSourceType: kbSelectedSourceType
        }
      });
      renderAiResult(res);
    } catch (error) { $('#kb-ai-result').html(`<div class="bg-red-500/10 border border-red-500/20 rounded-[12px] p-3 text-body text-[13px]">Gagal menjalankan test AI.</div>`); }
    setButtonLoading($btn, false);
  }

  $('#btn-refresh-kb-validation').on('click', loadKnowledgeValidation);
  $('#btn-test-retrieval').on('click', runRetrievalTest);
  $('#btn-test-ai-answer').on('click', runAiAnswerTest);

  // Handler untuk Tombol Test Cepat (Menset Input & Pilih Tab)
  $(document).on('click', '.kb-test-case-btn', function () {
    const question = $(this).data('question');
    const sourceType = $(this).data('source-type');

    if (sourceType) {
      const emptyMessageMap = {
        document_chunk: 'Belum ada materi yang cocok untuk pertanyaan ini.',
        faq: 'Belum ada FAQ yang cocok untuk pertanyaan ini.',
        activity: 'Belum ada instruksi aktivitas yang cocok untuk pertanyaan ini.',
        all: 'Belum ada konteks yang cocok untuk pertanyaan ini.'
      };
      setKbSourceType(sourceType, emptyMessageMap[sourceType]);
    }

    setKbQuestionToAllInputs(question);

  });

  $(document).on('click', '.btn-open-warning-panel', () => openKbTestPanel('kb-panel-warning'));

  // ==========================================
  // PROJECT LOADERS & DATA RENDERER
  // ==========================================
  async function loadProjects() {
    try {
      const res = await ApiService.get('/projects');
      if (res && res.data && res.data.length > 0) {
        let options = '';
        res.data.forEach(p => {
          const projectKey = p.project_key || p.projectKey || p.key || p.slug || p.id;
          options += `<option value="${p.id}" data-project-key="${projectKey}">${p.name}</option>`;
        });

        $('#project-selector').html(options);
        activeProjectId = res.data[0].id;
        activeProjectKey = res.data[0].project_key || res.data[0].projectKey || res.data[0].key || res.data[0].slug || res.data[0].id;

        $('#knowledge-workspace').removeClass('hidden'); $('#empty-state-project').addClass('hidden');
        loadAllData();
      } else {
        $('#project-selector').html('<option>Tidak ada project</option>');
        $('#empty-state-project').removeClass('hidden'); $('#knowledge-workspace').addClass('hidden');
      }
    } catch (e) { Toastify({ text: "Gagal memuat project", backgroundColor: "var(--color-semantic-error)" }).showToast(); }
  }

  $('#project-selector').on('change', function() {
    activeProjectId = $(this).val();
    activeProjectKey = $(this).find(':selected').data('project-key') || activeProjectId;
    loadAllData();
  });

  async function loadAllData() {
    if (!activeProjectId) return;
    await Promise.all([ loadDocuments(), loadFaqs(), loadActivities(), loadTemplates() ]);
    loadKnowledgeValidation();
  }

  $('.btn-refresh').on('click', async function() {
    const type = $(this).data('type');
    if (type === 'documents') await loadDocuments();
    if (type === 'faqs') await loadFaqs();
    if (type === 'activities') await loadActivities();
    if (type === 'templates') await loadTemplates(); // [TAMBAH INI]
    loadKnowledgeValidation();
  });

  async function loadTemplates() {
    $('#list-templates').html('<tr><td colspan="3" class="text-center py-6"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Memuat template...</td></tr>');
    try {
       const res = await ApiService.get(`/knowledge/templates/project/${activeProjectId}`);
       if (res && res.data) {
         store.templates.data = res.data;
         store.templates.page = 1;
         renderTable('templates');
       }
    } catch(e) {
       $('#list-templates').html('<tr><td colspan="3" class="text-center py-6 text-red-500">Gagal memuat template.</td></tr>');
    }
  }

// ==========================================
  // PAGINATION RENDERER
  // ==========================================
  function renderTable(type) {
    const { data, page, limit } = store[type];
    const totalPages = Math.ceil(data.length / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedData = data.slice(startIndex, startIndex + limit);

    $(`#info-page-${type}`).text(`Halaman ${page} dari ${totalPages}`);
    $(`.btn-prev[data-type="${type}"]`).prop('disabled', page === 1);
    $(`.btn-next[data-type="${type}"]`).prop('disabled', page === totalPages);

    const tbody = $(`#list-${type}`);

    if (data.length === 0) {
      // documents: 3 kolom, templates: 3 kolom, faqs/activities: 2 kolom
      const colSpan = (type === 'documents' || type === 'templates') ? 3 : 2;
      tbody.html(`<tr><td colspan="${colSpan}" class="text-center py-8 text-muted-soft">Belum ada data tersedia.</td></tr>`);
      return;
    }

    let rows = '';
    paginatedData.forEach(d => {
      if (type === 'documents') {
        // Logika Status
        const isIndexed = d.status === 'indexed';
        const badgeClass = isIndexed
          ? 'bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/20'
          : 'bg-canvas-soft text-muted border border-hairline';
        const badgeIcon = isIndexed ? 'fa-check-double' : 'fa-clock';
        const statusText = isIndexed ? 'Diindex' : 'Belum';

        // Logika Tombol Aksi (Mobile: Bulat Icon Only | Desktop: Icon + Text)
        const btnIndexHtml = isIndexed
          ? ''
          : `<button class="btn-index-doc flex items-center justify-center w-8 h-8 md:w-auto md:h-auto md:px-4 md:py-1.5 bg-primary text-white border border-primary rounded-full text-[12px] font-medium hover:bg-primary-active transition-colors shadow-sm" data-id="${d.id}" title="Index AI">
               <i class="fa-solid fa-bolt"></i>
               <span class="hidden md:inline ml-1.5">Index AI</span>
             </button>`;

        const btnDeleteHtml = `
          <button class="btn-del-doc flex items-center justify-center w-8 h-8 md:w-auto md:h-auto md:px-4 md:py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-full text-[12px] font-medium hover:bg-red-100 transition-colors shadow-sm" data-id="${d.id}" title="Hapus Materi">
            <i class="fa-solid fa-trash"></i>
            <span class="hidden md:inline ml-1.5">Hapus</span>
          </button>
        `;

        const actionBtn = `<div class="flex items-center justify-end gap-2">${btnIndexHtml}${btnDeleteHtml}</div>`;
        const topicText = d.topic ? `${d.topic} (${d.file_type})` : `Materi (${d.file_type})`;

        rows += `
          <tr class="border-b border-hairline hover:bg-canvas-soft transition-colors">
            <td class="py-4 px-4 md:px-6 align-middle">
              <div class="font-medium text-ink">${escapeHtml(d.title)}</div>
              <div class="text-[12px] text-muted-soft mt-1 truncate max-w-[180px] md:max-w-[350px]" title="${escapeHtml(topicText)}">
                ${escapeHtml(topicText)}
              </div>
            </td>
            <td class="py-4 px-4 md:px-6 align-middle text-center">
              <div class="inline-flex flex-col items-center justify-center w-20 py-2 rounded-xl ${badgeClass}">
                <i class="fa-solid ${badgeIcon} text-[16px] mb-1"></i>
                <span class="text-[10px] font-bold uppercase tracking-wider leading-none">${statusText}</span>
              </div>
            </td>
            <td class="py-4 px-4 md:px-6 align-middle text-right">
              ${actionBtn}
            </td>
          </tr>`;
      }
      else if (type === 'faqs') {
        rows += `
          <tr class="border-b border-hairline hover:bg-canvas-soft">
            <td class="py-4 px-4 md:px-6 align-middle">
              <div class="text-[12px] text-muted mb-1 truncate max-w-[200px] md:max-w-[400px]">[${escapeHtml(d.category || 'Umum')}]</div>
              <div class="font-medium text-ink mb-1 truncate max-w-[250px] md:max-w-[500px]">Q: ${escapeHtml(d.question)}</div>
              <div class="text-[13px] text-body truncate max-w-[250px] md:max-w-[500px]">A: ${escapeHtml(d.answer)}</div>
            </td>
            <td class="py-4 px-4 md:px-6 align-middle text-right">
              <button class="btn-del-faq flex items-center justify-center w-8 h-8 md:w-auto md:h-auto md:px-4 md:py-1.5 ml-auto bg-red-50 text-red-600 border border-red-100 rounded-full text-[12px] font-medium hover:bg-red-100 transition-colors shadow-sm" data-id="${d.id}" title="Hapus FAQ">
                <i class="fa-solid fa-trash"></i>
                <span class="hidden md:inline ml-1.5">Hapus</span>
              </button>
            </td>
          </tr>`;
      }
      else if (type === 'activities') {
        rows += `
          <tr class="border-b border-hairline hover:bg-canvas-soft">
            <td class="py-4 px-4 md:px-6 align-middle">
              <div class="text-[12px] uppercase font-bold text-muted mb-1 truncate max-w-[200px] md:max-w-[400px]">${escapeHtml(d.activity_type)} - ${escapeHtml(d.topic || 'Umum')}</div>
              <div class="font-medium text-ink mb-1 truncate max-w-[250px] md:max-w-[500px]">${escapeHtml(d.title)}</div>
              <div class="text-[13px] text-body truncate max-w-[250px] md:max-w-[500px]">${escapeHtml(d.instruction)}</div>
            </td>
            <td class="py-4 px-4 md:px-6 align-middle text-right">
              <button class="btn-del-act flex items-center justify-center w-8 h-8 md:w-auto md:h-auto md:px-4 md:py-1.5 ml-auto bg-red-50 text-red-600 border border-red-100 rounded-full text-[12px] font-medium hover:bg-red-100 transition-colors shadow-sm" data-id="${d.id}" title="Hapus Instruksi">
                <i class="fa-solid fa-trash"></i>
                <span class="hidden md:inline ml-1.5">Hapus</span>
              </button>
            </td>
          </tr>`;
      }else if (type === 'templates') {
        let elemCount = 0;
        try {
          const elements = typeof d.elements_json === 'string' ? JSON.parse(d.elements_json) : d.elements_json;
          elemCount = Array.isArray(elements) ? elements.length : 0;
        } catch(e) {}

        rows += `
          <tr class="border-b border-hairline hover:bg-canvas-soft">
            <td class="py-4 px-4 md:px-6 align-middle">
              <div class="text-[12px] uppercase font-bold text-primary mb-1 truncate max-w-[200px] md:max-w-[400px]">${escapeHtml(d.page_type)}</div>
              <div class="font-medium text-ink mb-1 truncate max-w-[250px] md:max-w-[500px]">${escapeHtml(d.template_name)}</div>
            </td>
            <td class="py-4 px-4 md:px-6 align-middle text-center">
              <span class="text-[13px] font-medium text-ink bg-canvas-soft px-3 py-1 rounded-full border border-hairline whitespace-nowrap">
                ${elemCount} Elemen
              </span>
            </td>
            <td class="py-4 px-4 md:px-6 align-middle text-right">
              <button class="btn-del-tpl flex items-center justify-center w-8 h-8 md:w-auto md:h-auto md:px-4 md:py-1.5 ml-auto bg-red-50 text-red-600 border border-red-100 rounded-full text-[12px] font-medium hover:bg-red-100 transition-colors shadow-sm" data-id="${d.id}" title="Hapus Template">
                <i class="fa-solid fa-trash"></i>
                <span class="hidden md:inline ml-1.5">Hapus</span>
              </button>
            </td>
          </tr>`;
      }
    });
    tbody.html(rows);
  }

  $('.btn-prev').on('click', function() { const type = $(this).data('type'); if (store[type].page > 1) { store[type].page--; renderTable(type); } });
  $('.btn-next').on('click', function() { const type = $(this).data('type'); const totalPages = Math.ceil(store[type].data.length / store[type].limit); if (store[type].page < totalPages) { store[type].page++; renderTable(type); } });

  async function loadDocuments() { $('#list-documents').html('<tr><td colspan="3" class="text-center py-6"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Memuat materi...</td></tr>'); const res = await DocumentAPI.getDocumentsByProject(activeProjectId); if (res && res.data) { store.documents.data = res.data; store.documents.page = 1; renderTable('documents'); } }
  async function loadFaqs() { $('#list-faqs').html('<tr><td colspan="2" class="text-center py-6"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Memuat FAQ...</td></tr>'); const res = await KnowledgeAPI.getFaqsByProject(activeProjectId); if (res && res.data) { store.faqs.data = res.data; store.faqs.page = 1; renderTable('faqs'); } }
  async function loadActivities() { $('#list-activities').html('<tr><td colspan="2" class="text-center py-6"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Memuat Instruksi...</td></tr>'); const res = await KnowledgeAPI.getActivitiesByProject(activeProjectId); if (res && res.data) { store.activities.data = res.data; store.activities.page = 1; renderTable('activities'); } }

  function generateExcelTemplate(headers, filename) { const ws = XLSX.utils.aoa_to_sheet([headers]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Template"); XLSX.writeFile(wb, filename); }
  $('#btn-dl-template-faq').on('click', () => generateExcelTemplate(['category', 'question', 'answer'], 'Template_FAQ.xlsx'));
  $('#btn-dl-template-act').on('click', () => generateExcelTemplate(['activity_type', 'title', 'topic', 'instruction', 'rules', 'deadline', 'completion_criteria', 'confusing_points'], 'Template_Instruksi.xlsx'));

  // ==========================================
  // FORM SUBMISSIONS & ACTIONS
  // ==========================================
  $('#form-upload-document').on('submit', async function (e) {
    e.preventDefault();
    if(!activeProjectId) return;
    const file = $('#doc_file')[0].files[0];
    if (!file) return;

    const btn = $('#btn-upload-doc'); const ogHtml = btn.html();
    btn.html('<i class="fa-solid fa-spinner fa-spin mr-2"></i> Mengunggah...').prop('disabled', true);

    const formData = new FormData();
    formData.append('project_id', activeProjectId); formData.append('title', $('#doc_title').val()); formData.append('topic', $('#doc_topic').val()); formData.append('file', file);

    const res = await DocumentAPI.uploadDocument(formData);
    if (res && res.status !== 'error') { Toastify({ text: "Materi berhasil diunggah!", backgroundColor: "var(--color-primary)" }).showToast(); $('#form-upload-document')[0].reset(); await loadDocuments(); loadKnowledgeValidation(); await loadTemplates(); closeDrawer(); } else { Toastify({ text: "Gagal mengunggah", backgroundColor: "var(--color-semantic-error)" }).showToast(); }
    btn.html(ogHtml).prop('disabled', false);
  });

  $(document).on('click', '.btn-index-doc', async function() { const id = $(this).data('id'); $(this).html('<i class="fa-solid fa-spinner fa-spin"></i>').prop('disabled', true); const res = await DocumentAPI.indexDocument(id); if(res && res.status !== 'error') { Toastify({ text: "Dokumen berhasil diindex untuk AI", backgroundColor: "var(--color-primary)" }).showToast(); } else { Toastify({ text: "Gagal memproses index", backgroundColor: "var(--color-semantic-error)" }).showToast(); } await loadDocuments(); loadKnowledgeValidation(); });
  $(document).on('click', '.btn-del-tpl', async function() {
    if(!confirm("Yakin ingin menghapus template HTML ini?")) return;
    $(this).html('<i class="fa-solid fa-spinner fa-spin"></i>').prop('disabled', true);
    try {
      const res = await ApiService.delete(`/knowledge/templates/${$(this).data('id')}`);
      if(res && res.status !== 'error') {
        Toastify({ text: "Template dihapus", backgroundColor: "var(--color-primary)" }).showToast();
        await loadTemplates();
      }
    } catch(e) {
      Toastify({ text: "Gagal menghapus", backgroundColor: "var(--color-semantic-error)" }).showToast();
      $(this).html('<i class="fa-solid fa-trash"></i> Hapus').prop('disabled', false);
    }
  });

  $('#form-faq-manual').on('submit', async function (e) {
    e.preventDefault();
    const payload = { project_id: activeProjectId, category: $('#faq_category').val(), question: $('#faq_question').val(), answer: $('#faq_answer').val() };
    const res = await KnowledgeAPI.createFaq(payload);
    if(res && res.status !== 'error') { Toastify({ text: "FAQ ditambahkan", backgroundColor: "var(--color-primary)" }).showToast(); $('#form-faq-manual')[0].reset(); await loadFaqs(); loadKnowledgeValidation(); closeDrawer(); }
  });

  $(document).on('click', '.btn-del-faq', async function() { if(!confirm("Hapus FAQ ini?")) return; await KnowledgeAPI.deleteFaq($(this).data('id')); await loadFaqs(); loadKnowledgeValidation(); });

  $('#btn-import-faq').on('click', async function() {
    const file = $('#file-import-faq')[0].files[0]; if(!file) return;
    $(this).html('<i class="fa-solid fa-spinner fa-spin mr-2"></i> Mengunggah...').prop('disabled', true);
    const formData = new FormData(); formData.append('project_id', activeProjectId); formData.append('file', file);
    const res = await KnowledgeAPI.importFaqExcel(formData);
    if (res && res.status !== 'error') {
      Toastify({ text: `Import FAQ Sukses`, backgroundColor: "var(--color-primary)" }).showToast();
      $('#file-import-faq').val(''); $('#btn-import-faq').prop('disabled', true); $('#filename-faq').addClass('hidden'); await loadFaqs(); loadKnowledgeValidation(); closeDrawer();
    }
    $(this).html('Proses Import').prop('disabled', false);
  });

  $('#form-activity-manual').on('submit', async function (e) {
    e.preventDefault();
    let rulesObj = null;
    try { const rv = $('#act_rules').val(); if(rv) rulesObj = JSON.parse(rv); } catch(err) { Toastify({ text: "Format Rules JSON tidak valid", backgroundColor: "var(--color-semantic-error)" }).showToast(); return; }
    const payload = { project_id: activeProjectId, activity_type: $('#act_type').val(), title: $('#act_title').val(), topic: $('#act_topic').val(), instruction: $('#act_instruction').val(), deadline: $('#act_deadline').val() || null, completion_criteria: $('#act_criteria').val() || null, confusing_points: $('#act_confusing').val() || null, rules: rulesObj };
    const res = await KnowledgeAPI.createActivity(payload);
    if(res && res.status !== 'error') { Toastify({ text: "Instruksi ditambahkan", backgroundColor: "var(--color-primary)" }).showToast(); $('#form-activity-manual')[0].reset(); loadActivities(); loadKnowledgeValidation(); closeDrawer(); }
  });

  $(document).on('click', '.btn-del-act', async function() { if(!confirm("Hapus Instruksi Aktivitas ini?")) return; await KnowledgeAPI.deleteActivity($(this).data('id')); loadActivities(); loadKnowledgeValidation(); });

  $('#btn-import-act').on('click', async function() {
    const file = $('#file-import-act')[0].files[0]; if(!file) return;
    $(this).html('<i class="fa-solid fa-spinner fa-spin mr-2"></i> Mengunggah...').prop('disabled', true);
    const formData = new FormData(); formData.append('project_id', activeProjectId); formData.append('file', file);
    const res = await KnowledgeAPI.importActivityExcel(formData);
    if (res && res.status !== 'error') {
      Toastify({ text: `Import Instruksi Sukses`, backgroundColor: "var(--color-primary)" }).showToast();
      $('#file-import-act').val(''); $('#btn-import-act').prop('disabled', true); $('#filename-act').addClass('hidden'); loadActivities(); loadKnowledgeValidation(); closeDrawer();
    }
    $(this).html('Proses Import').prop('disabled', false);
  });

  loadProjects();
});
