// src/scripts/pages/logs.page.js
import $ from 'jquery';
import { ApiService } from '../fetch/api.js';
import { LogAPI } from '../fetch/log.fetch.js';

$(document).ready(function () {
  let state = {
    page: 1,
    limit: 10,
    projectId: '',
    q: '',
    date: '',
    moderationType: '',
    activeSessionId: null
  };

  const formatModLabel = (type) => {
    switch (type) {
      case 'mental_health': return { text: 'Sinyal Stres/Burnout', class: 'bg-orange-100 text-orange-700 border-orange-200' };
      case 'hate_speech': return { text: 'SARA / Hate Speech', class: 'bg-red-100 text-red-700 border-red-200' };
      case 'profanity': return { text: 'Kata Kasar', class: 'bg-red-100 text-red-700 border-red-200' };
      default: return { text: type, class: 'bg-gray-100 text-gray-700 border-gray-200' };
    }
  };

  const debounce = (func, wait) => {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  };

  // --- Fungsi Navigasi Slider & Drawer Universal ---
  const openDrawer = () => {
    $('#chat-workspace').addClass('translate-y-0 md:translate-x-0').removeClass('translate-y-full md:translate-x-full');
    $('#chat-overlay').removeClass('invisible opacity-0 pointer-events-none').addClass('visible opacity-100 pointer-events-auto');
  };

  const closeDrawer = () => {
    $('#chat-workspace').removeClass('translate-y-0 md:translate-x-0').addClass('translate-y-full md:translate-x-full');
    $('#chat-overlay').removeClass('visible opacity-100 pointer-events-auto').addClass('invisible opacity-0 pointer-events-none');
  };

  async function loadProjects() {
    const res = await ApiService.get('/projects');
    if (res && res.data) {
      // Ubah value dari "" menjadi "all"
      let opts = '<option value="all">Semua Project</option>';
      res.data.forEach(p => opts += `<option value="${p.id}">${p.name}</option>`);
      $('#filter-project').html(opts);
    }
  }

  // (Fungsi loadSummary tetap sama seperti revisi sebelumnya)
  async function loadSummary() {
    $('#log-summary-container').html('<div class="col-span-full text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i></div>');
    const res = await LogAPI.getSummary({ projectId: state.projectId });

    if (res && res.data) {
      const d = res.data;
      $('#log-summary-container').html(`
        <div class="bg-surface-card border border-hairline rounded-[16px] p-5 shadow-sm flex flex-col justify-center items-start">
          <p class="text-[12px] font-semibold text-muted tracking-wider uppercase mb-1">Total Sesi Murid</p>
          <h2 class="text-3xl font-serif text-ink font-medium">${d.totalSessions}</h2>
        </div>
        <div class="bg-surface-card border border-hairline rounded-[16px] p-5 shadow-sm flex flex-col justify-center items-start">
          <p class="text-[12px] font-semibold text-muted tracking-wider uppercase mb-1">Indikasi SARA</p>
          <h2 class="text-3xl font-serif text-semantic-error font-medium">${d.hateSpeech}</h2>
        </div>
        <details class="group relative bg-surface-card border border-hairline rounded-[16px] p-5 shadow-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <summary class="flex justify-between items-center h-full outline-none">
            <div class="flex flex-col justify-center items-start">
              <p class="text-[12px] font-semibold text-muted tracking-wider uppercase mb-1">Alert Lainnya</p>
              <p class="text-[14px] font-medium text-primary">Lihat Detail <i class="fa-solid fa-chevron-down ml-1 text-[12px] transition-transform group-open:rotate-180"></i></p>
            </div>
            <div class="h-10 w-10 rounded-full bg-canvas-soft flex items-center justify-center text-muted">
              <i class="fa-solid fa-shield-halved"></i>
            </div>
          </summary>
          <div class="absolute right-0 top-[110%] w-[250px] bg-surface-card border border-hairline shadow-lg rounded-[12px] p-4 z-20 space-y-3">
            <div class="flex justify-between items-center border-b border-hairline pb-2">
              <span class="text-[13px] text-muted"><i class="fa-solid fa-brain w-5 text-orange-500"></i> Sinyal Stres</span>
              <span class="font-medium text-ink">${d.mentalHealth}</span>
            </div>
            <div class="flex justify-between items-center border-b border-hairline pb-2">
              <span class="text-[13px] text-muted"><i class="fa-solid fa-comment-slash w-5 text-red-500"></i> Kata Kasar (Profanity)</span>
              <span class="font-medium text-ink">${d.profanity}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-[13px] text-muted"><i class="fa-solid fa-clipboard-question w-5 text-blue-500"></i> Minta Jwb Tgs</span>
              <span class="font-medium text-ink">${d.quizAnswerRequest}</span>
            </div>
          </div>
        </details>
      `);
    }
  }

  async function loadSessions() {
    $('#session-list').html('<div class="col-span-full text-center py-10 text-muted"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></div>');

    let queryParams = { page: state.page, limit: state.limit };

    // Validasi parameter agar API tidak menerima undefined, null, atau all
    if (state.projectId && state.projectId !== 'all' && state.projectId !== 'null' && state.projectId !== 'undefined') {
      queryParams.projectId = state.projectId;
    }
    if (state.q) {
      queryParams.q = state.q;
    }
    if (state.date) {
      queryParams.date = state.date; // intent diganti date
    }
    if (state.moderationType && state.moderationType !== 'all') {
      queryParams.moderationType = state.moderationType;
    }

    const res = await LogAPI.getSessions(queryParams);

    if (res && res.data) {
      const { items, pagination } = res.data;
      $('#total-session-count').text(`(${pagination.total})`);
      $('#page-info').text(`${pagination.page} / ${pagination.totalPages || 1}`);
      $('#btn-prev-page').prop('disabled', pagination.page <= 1);
      $('#btn-next-page').prop('disabled', pagination.page >= pagination.totalPages);

      if (items.length === 0) {
        $('#session-list').html('<div class="col-span-full text-center py-8 text-[13px] text-muted-soft">Tidak ada sesi yang ditemukan.</div>');
        return;
      }

      let html = '';
      items.forEach(item => {

        // 1. Tentukan warna border/background default
        let cardStyleClasses = 'border-hairline bg-white hover:border-hairline-strong';

        // 2. Timpa warna jika sesi memiliki alert
        if (item.alert_count > 0) {
           if (item.alert_types.includes('hate_speech') || item.alert_types.includes('profanity')) {
              // Merah mencolok untuk SARA atau Kata Kasar
              cardStyleClasses = 'border-red-500 bg-red-50/20 border-[1.5px]';
           } else if (item.alert_types.includes('mental_health')) {
              // Kuning/Orange peringatan untuk indikasi Stres/Burnout
              cardStyleClasses = 'border-yellow-400 bg-yellow-50/30 border-[1.5px]';
           }
        }

        // 3. Tumpuk styling class di atas dengan state active (jika sedang diklik admin)
        const isActive = item.id === state.activeSessionId ? `ring-2 ring-primary ring-offset-1 ${cardStyleClasses}` : cardStyleClasses;

        let badges = '';
        if(item.alert_count > 0) {
           item.alert_types.forEach(t => {
             const mInfo = formatModLabel(t);
             badges += `<span class="inline-block px-2 py-0.5 rounded-[4px] text-[10px] border ${mInfo.class} mr-1 mb-1 font-medium">${mInfo.text}</span>`;
           });
        }
        if(item.dominant_intent) {
           badges += `<span class="inline-block px-2 py-0.5 rounded-[4px] text-[10px] border bg-gray-100 text-gray-600 border-gray-200 mr-1 mb-1 font-medium">${item.dominant_intent}</span>`;
        }

        const dateStr = new Date(item.last_active_at).toLocaleString('id-ID', {day: '2-digit', month: 'short', hour:'2-digit', minute:'2-digit'});

        // 4. Terapkan variabel isActive dan hapus class 'bg-white' statis
        html += `
          <div class="session-card p-4 rounded-[14px] cursor-pointer transition-all hover:shadow-sm flex flex-col border ${isActive}" data-id="${item.id}">
            <div class="flex justify-between items-start mb-2">
              <div class="font-serif text-[16px] text-ink font-semibold flex items-center gap-1.5">
                <i class="fa-solid fa-user-circle text-muted text-sm"></i> ${item.session_label}
              </div>
              <div class="text-[11px] text-muted-soft bg-canvas-soft px-2 py-0.5 rounded border border-hairline">${dateStr}</div>
            </div>
            <div class="text-[12px] text-muted-soft mb-3 flex items-center gap-1">
              <i class="fa-solid fa-graduation-cap text-[12px]"></i> ${item.project_name}
            </div>
            <div class="text-[13px] text-body line-clamp-2 mb-3 italic bg-canvas-soft p-2.5 rounded-lg border border-hairline flex-1">
              "${item.last_message}"
            </div>
            <div class="flex flex-wrap mt-auto">${badges}</div>
          </div>
        `;
      });
      $('#session-list').html(html);
    }
  }

  async function loadDetail(sessionId) {
    $('#detail-content').removeClass('hidden');
    $('#chat-timeline').html('<div class="text-center py-20 text-muted"><i class="fa-solid fa-spinner fa-spin text-3xl"></i></div>');

    const res = await LogAPI.getSessionDetail(sessionId);
    if(res && res.data) {
      const { session, messages } = res.data;

      $('#det-student-name').text(session.session_label);
      $('#det-project-class').text(session.project_name);

      let chatHtml = '';

      // TAHAP 1: OVERLAY LOCKDOWN & GENERATE KEY
      const isLocked = session.page_context?.safety_state?.locked;
      if (isLocked) {
        chatHtml += `
          <div class="relative w-full bg-red-50/90 backdrop-blur-md border border-red-200 rounded-xl p-6 mb-6 flex flex-col items-center justify-center shadow-sm overflow-hidden z-10">
            <div class="flex flex-col items-center w-full max-w-sm text-center">
              <div class="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3">
                 <i class="fa-solid fa-lock text-xl"></i>
              </div>
              <h3 class="text-red-700 font-bold mb-1 text-lg">Sesi Diblokir (SARA)</h3>
              <p class="text-[13px] text-red-600 mb-5">Siswa harus memasukkan nama & key buka kunci pada widget untuk melanjutkan chat.</p>

              <div class="w-full relative" id="lock-ui-wrapper-${session.id}">
                <button id="btn-generate-key-detail" data-session="${session.id}" class="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 px-4 rounded-[8px] transition-colors shadow-sm">
                  <i class="fa-solid fa-key mr-1"></i> Generate Unlock Key
                </button>

                <div id="key-result-container-${session.id}" class="hidden flex items-center bg-white border border-red-200 rounded-[8px] p-1.5 shadow-sm mt-3">
                  <input type="text" id="input-key-${session.id}" class="flex-1 bg-transparent border-none focus:ring-0 text-center font-mono font-bold text-red-700 text-[16px] outline-none" readonly value="">
                  <button id="btn-copy-key-${session.id}" class="w-10 h-10 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-[6px] transition-colors cursor-pointer" title="Copy Key">
                    <i class="fa-regular fa-copy text-lg"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      messages.forEach(msg => {
        const isUser = msg.role === 'user';
        const align = isUser ? 'items-end' : 'items-start';
        const bg = isUser ? 'bg-primary text-white rounded-br-none' : 'bg-surface-card border border-hairline text-ink rounded-bl-none';

        let metaHtml = '';
        if (msg.moderation) {
           const modInfo = formatModLabel(msg.moderation.type);
           metaHtml += `<div class="mt-1"><span class="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] border ${modInfo.class} font-medium"><i class="fa-solid fa-triangle-exclamation mr-1"></i> ${modInfo.text}</span></div>`;
        }
        if (msg.intent && isUser) {
           metaHtml += `<div class="mt-1"><span class="text-[10px] text-muted-soft uppercase tracking-wider">${msg.intent}</span></div>`;
        }

        let contextHtml = '';
        if (!isUser && msg.context_used && msg.context_used.results_count > 0) {
          contextHtml = `
            <details class="mt-2 text-[12px] bg-canvas-soft border border-hairline rounded-[6px] p-2 text-body">
              <summary class="cursor-pointer font-medium outline-none">Context Used (${msg.context_used.results_count} sources)</summary>
              <ul class="list-disc pl-4 mt-1 opacity-80">
                ${msg.context_used.top_sources.map(s => `<li>${s.title || 'Doc'}</li>`).join('')}
              </ul>
            </details>
          `;
        }

        chatHtml += `
          <div class="flex flex-col ${align} w-full mb-4">
            <div class="text-[11px] text-muted-soft mb-1">${isUser ? 'Siswa' : 'AI Buddy'} • ${new Date(msg.created_at).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}</div>
            <div class="max-w-[85%] md:max-w-[75%] p-3 rounded-[14px] text-[14px] ${bg}">
              <div class="whitespace-pre-wrap">${msg.message}</div>
              ${contextHtml}
            </div>
            ${metaHtml}
          </div>
        `;
      });

      $('#chat-timeline').html(chatHtml);

      // Event Listener Generate Key di Detail
      $(`#btn-generate-key-detail`).on('click', async function() {
         const sid = $(this).data('session');
         const btn = $(this);
         btn.html('<i class="fa-solid fa-spinner fa-spin"></i>').prop('disabled', true);

         try {
            const res = await ApiService.post(`/logs/sessions/${sid}/unlock-key`, {});
            if (res && res.status === 'success') {
                const key = res.data.unlock_key;
                btn.addClass('hidden'); // Sembunyikan tombol generate
                $(`#key-result-container-${sid}`).removeClass('hidden').addClass('flex'); // Munculkan input key
                $(`#input-key-${sid}`).val(key);
            } else {
                btn.html('<i class="fa-solid fa-key mr-1"></i> Gagal, Coba Lagi').prop('disabled', false);
            }
         } catch (e) {
            btn.html('<i class="fa-solid fa-key mr-1"></i> Error API').prop('disabled', false);
         }
      });

      // Event Listener Copy to Clipboard
      $(`[id^=btn-copy-key-]`).on('click', function() {
         const sid = session.id;
         const inputEl = document.getElementById(`input-key-${sid}`);
         const copyBtn = $(this);

         inputEl.select();
         inputEl.setSelectionRange(0, 99999);
         navigator.clipboard.writeText(inputEl.value);

         // Ubah Icon Jadi Checked
         copyBtn.html('<i class="fa-solid fa-check text-green-500 text-lg"></i>');

         // Kembalikan ke icon copy setelah 2 detik
         setTimeout(() => {
            copyBtn.html('<i class="fa-regular fa-copy text-lg"></i>');
         }, 2000);
      });
    }
  }

  // --- Bind Event Drawer Navigation ---
  $('#btn-close-chat').on('click', closeDrawer);
  $('#chat-overlay').on('click', closeDrawer);

  const handleFilterChange = () => {
    state.page = 1;
    loadSummary();
    loadSessions();
  };

  $('#filter-search').on('input', debounce(function() {
    state.q = $(this).val();
    handleFilterChange();
  }, 500));

  $('#filter-project').on('change', function() { state.projectId = $(this).val(); handleFilterChange(); });
  $('#filter-date').on('change', function() { state.date = $(this).val(); handleFilterChange(); });
  $('#filter-mod').on('change', function() { state.moderationType = $(this).val(); handleFilterChange(); });

  $('#btn-prev-page').on('click', () => { if(state.page > 1) { state.page--; loadSessions(); } });
  $('#btn-next-page').on('click', () => { state.page++; loadSessions(); });

  $(document).on('click', '.session-card', function() {
    $('.session-card').removeClass('border-primary bg-canvas-soft ring-1 ring-primary').addClass('border-hairline hover:border-hairline-strong');
    $(this).addClass('border-primary bg-canvas-soft ring-1 ring-primary').removeClass('border-hairline hover:border-hairline-strong');

    state.activeSessionId = $(this).data('id');
    loadDetail(state.activeSessionId);

    // Picu animasi meluncur drawer/slider universal
    openDrawer();
  });

  loadProjects();
  loadSummary();
  loadSessions();
});
