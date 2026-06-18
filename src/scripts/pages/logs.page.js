// src/scripts/pages/logs.page.js
import $ from 'jquery';
import { ApiService } from '../fetch/api.js';
import { LogAPI } from '../fetch/log.fetch.js';
import { formatResponseText, escapeHtml } from './buddy/utils.js';

// formatResponseText memakai `this.escapeHtml` → panggil dengan konteks ringan.
const renderRich = (text = '') => formatResponseText.call({ escapeHtml }, String(text || ''));

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

  // Label sumber jawaban bot: AI / Sistem / Basis Pengetahuan (cache).
  const botSourceBadge = (ctx) => {
    const src = ctx?.response_source;
    const model = ctx?.used_model;
    if (model === 'cache') return { text: 'Basis Pengetahuan', cls: 'bg-violet-50 text-violet-700 border-violet-200', icon: 'fa-database' };
    if (src === 'ai') return { text: 'Jawaban AI', cls: 'bg-primary/10 text-primary border-primary/20', icon: 'fa-robot' };
    return { text: 'Jawaban Sistem', cls: 'bg-canvas-soft text-muted border-hairline', icon: 'fa-gears' };
  };

  // --- Helper waktu (Asia/Jakarta) untuk divider hari & jam ---
  const dayKey = (s) => new Date(s).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
  const dayLabel = (s) => new Date(s).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeLabel = (s) => new Date(s).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });

  const debounce = (func, wait) => {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  };

  // --- Navigasi Slider / Drawer ---
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
      let opts = '<option value="all">Semua Project</option>';
      res.data.forEach(p => opts += `<option value="${p.id}">${escapeHtml(p.name)}</option>`);
      $('#filter-project').html(opts);
    }
  }

  // Kartu statistik — editorial: angka serif besar + micro-label.
  function statCard(label, value, { accent = 'text-ink', icon = 'fa-comments', note = '' } = {}) {
    return `
      <div class="bg-surface-card border border-hairline rounded-[16px] p-5 shadow-sm flex flex-col">
        <div class="flex items-center justify-between mb-3">
          <p class="text-[11px] font-semibold text-muted-soft tracking-[0.12em] uppercase">${label}</p>
          <span class="w-8 h-8 rounded-full bg-canvas-soft border border-hairline flex items-center justify-center text-muted shrink-0"><i class="fa-solid ${icon} text-[12px]"></i></span>
        </div>
        <h2 class="text-3xl font-serif ${accent} leading-none">${value}</h2>
        ${note ? `<p class="text-[11px] text-muted-soft mt-2">${note}</p>` : ''}
      </div>`;
  }

  async function loadSummary() {
    $('#log-summary-container').html('<div class="col-span-full text-center py-6 text-muted"><i class="fa-solid fa-spinner fa-spin"></i></div>');
    const res = await LogAPI.getSummary({ projectId: state.projectId });
    if (res && res.data) {
      const d = res.data;
      $('#log-summary-container').html(
        statCard('Total Sesi', d.totalSessions, { icon: 'fa-comments', note: `${d.totalMessages || 0} pesan tercatat` }) +
        statCard('Indikasi SARA', d.hateSpeech, { accent: 'text-semantic-error', icon: 'fa-triangle-exclamation', note: 'Perlu ditindaklanjuti' }) +
        statCard('Kata Kasar', d.profanity, { accent: d.profanity > 0 ? 'text-red-600' : 'text-ink', icon: 'fa-comment-slash' }) +
        statCard('Sinyal Stres', d.mentalHealth, { accent: d.mentalHealth > 0 ? 'text-orange-600' : 'text-ink', icon: 'fa-brain', note: 'Kelelahan / burnout' })
      );
    }
  }

  async function loadSessions() {
    $('#session-list').html('<div class="col-span-full text-center py-10 text-muted"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></div>');

    let queryParams = { page: state.page, limit: state.limit };
    if (state.projectId && state.projectId !== 'all' && state.projectId !== 'null' && state.projectId !== 'undefined') queryParams.projectId = state.projectId;
    if (state.q) queryParams.q = state.q;
    if (state.date) queryParams.date = state.date;
    if (state.moderationType && state.moderationType !== 'all') queryParams.moderationType = state.moderationType;

    const res = await LogAPI.getSessions(queryParams);
    if (!res || !res.data) return;

    const { items, pagination } = res.data;
    $('#total-session-count').text(`${pagination.total} sesi`);
    $('#page-info').text(`${pagination.page} / ${pagination.totalPages || 1}`);
    $('#btn-prev-page').prop('disabled', pagination.page <= 1);
    $('#btn-next-page').prop('disabled', pagination.page >= pagination.totalPages);

    if (items.length === 0) {
      $('#session-list').html('<div class="col-span-full text-center py-12 text-[13px] text-muted-soft">Tidak ada sesi yang cocok dengan filter.</div>');
      return;
    }

    let html = '';
    items.forEach(item => {
      let cardStyle = 'border-hairline bg-white hover:border-hairline-strong';
      if (item.alert_count > 0) {
        if (item.alert_types.includes('hate_speech') || item.alert_types.includes('profanity')) cardStyle = 'border-red-300 bg-red-50/30';
        else if (item.alert_types.includes('mental_health')) cardStyle = 'border-amber-300 bg-amber-50/30';
      }
      const isActive = item.id === state.activeSessionId ? `ring-2 ring-primary ring-offset-1 ${cardStyle}` : cardStyle;

      let badges = '';
      if (item.alert_count > 0) {
        item.alert_types.forEach(t => {
          const m = formatModLabel(t);
          badges += `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${m.class} font-medium"><i class="fa-solid fa-triangle-exclamation mr-1 text-[9px]"></i>${m.text}</span>`;
        });
      }
      if (item.dominant_intent) {
        badges += `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border bg-canvas-soft text-muted border-hairline font-medium">${escapeHtml(item.dominant_intent)}</span>`;
      }

      const dateStr = new Date(item.last_active_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

      html += `
        <div class="session-card p-4 rounded-[14px] cursor-pointer transition-all hover:shadow-sm flex flex-col border ${isActive}" data-id="${item.id}">
          <div class="flex justify-between items-start gap-2 mb-1.5">
            <div class="font-serif text-[16px] text-ink font-medium flex items-center gap-1.5 min-w-0">
              <i class="fa-solid fa-user-circle text-muted-soft text-sm shrink-0"></i>
              <span class="truncate">${escapeHtml(item.session_label)}</span>
            </div>
            <div class="text-[11px] text-muted-soft bg-canvas-soft px-2 py-0.5 rounded-full border border-hairline shrink-0 whitespace-nowrap">${dateStr}</div>
          </div>
          <div class="text-[12px] text-muted-soft mb-3 flex items-center gap-1.5">
            <i class="fa-solid fa-graduation-cap text-[11px]"></i> ${escapeHtml(item.project_name)} · ${item.total_messages} pesan
          </div>
          <div class="text-[13px] text-body line-clamp-2 mb-3 bg-canvas-soft p-2.5 rounded-lg border border-hairline flex-1">${escapeHtml(item.last_message)}</div>
          <div class="flex flex-wrap gap-1.5 mt-auto">${badges}</div>
        </div>`;
    });
    $('#session-list').html(html);
  }

  function applyDayFilter(value) {
    const $tl = $('#chat-timeline');
    if (!value || value === 'all') {
      $tl.find('[data-day], [data-day-divider]').show();
      return;
    }
    $tl.find('[data-day], [data-day-divider]').hide();
    $tl.find(`[data-day="${value}"], [data-day-divider="${value}"]`).show();
  }

  async function loadDetail(sessionId) {
    $('#detail-content').removeClass('hidden');
    $('#sara-lock-overlay').addClass('hidden');
    $('#det-day-filter-wrap').addClass('hidden');
    $('#chat-timeline').html('<div class="text-center py-20 text-muted"><i class="fa-solid fa-spinner fa-spin text-3xl"></i></div>');

    const res = await LogAPI.getSessionDetail(sessionId);
    if (!res || !res.data) return;

    const { session } = res.data;
    // Pastikan kronologis (naik) agar divider hari konsisten.
    const messages = [...(res.data.messages || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    $('#det-student-name').text(session.session_label);
    $('#det-project-class').text(session.project_name);

    // --- Render timeline dengan divider hari (save point) ---
    let chatHtml = '';
    let lastDay = null;
    const days = [];

    messages.forEach(msg => {
      const k = dayKey(msg.created_at);
      if (k !== lastDay) {
        lastDay = k;
        days.push({ key: k, label: dayLabel(msg.created_at) });
        chatHtml += `
          <div class="chat-day-divider flex items-center gap-3 my-5" data-day-divider="${k}">
            <div class="flex-1 h-px bg-hairline"></div>
            <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-soft">${escapeHtml(dayLabel(msg.created_at))}</span>
            <div class="flex-1 h-px bg-hairline"></div>
          </div>`;
      }

      const isUser = msg.role === 'user';
      const align = isUser ? 'items-end' : 'items-start';

      // Label sumber (hanya untuk jawaban bot).
      let headLabel = '';
      if (isUser) {
        headLabel = `<span class="text-[11px] text-muted-soft">Siswa · ${timeLabel(msg.created_at)}</span>`;
      } else {
        const b = botSourceBadge(msg.context_used);
        headLabel = `
          <span class="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${b.cls}"><i class="fa-solid ${b.icon} text-[9px]"></i>${b.text}</span>
          <span class="text-[11px] text-muted-soft ml-1.5">${timeLabel(msg.created_at)}</span>`;
      }

      const bubbleCls = isUser
        ? 'bg-primary text-white rounded-br-sm'
        : 'bg-surface-card border border-hairline text-body rounded-bl-sm';
      const bodyHtml = isUser
        ? `<div class="whitespace-pre-wrap">${escapeHtml(msg.message)}</div>`
        : `<div class="alb-rich leading-relaxed">${renderRich(msg.message)}</div>`;

      // Meta: moderation + intent.
      let metaHtml = '';
      if (msg.moderation) {
        const m = formatModLabel(msg.moderation.type);
        metaHtml += `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${m.class} font-medium"><i class="fa-solid fa-triangle-exclamation mr-1 text-[9px]"></i>${m.text}</span>`;
      }
      if (msg.intent && isUser) {
        metaHtml += `<span class="text-[10px] text-muted-soft uppercase tracking-wider">${escapeHtml(msg.intent)}</span>`;
      }

      let contextHtml = '';
      if (!isUser && msg.context_used && msg.context_used.results_count > 0) {
        contextHtml = `
          <details class="mt-2 text-[12px] bg-canvas-soft border border-hairline rounded-lg p-2 text-body">
            <summary class="cursor-pointer font-medium outline-none text-muted">Sumber konteks (${msg.context_used.results_count})</summary>
            <ul class="list-disc pl-4 mt-1 opacity-80">
              ${(msg.context_used.top_sources || []).map(s => `<li>${escapeHtml(s.title || 'Dokumen')}</li>`).join('')}
            </ul>
          </details>`;
      }

      chatHtml += `
        <div class="flex flex-col ${align} w-full mb-4" data-day="${k}">
          <div class="mb-1 flex items-center">${headLabel}</div>
          <div class="max-w-[88%] md:max-w-[78%] px-3.5 py-2.5 rounded-2xl text-[14px] ${bubbleCls}">
            ${bodyHtml}
            ${contextHtml}
          </div>
          ${metaHtml ? `<div class="mt-1 flex flex-wrap gap-1.5 items-center">${metaHtml}</div>` : ''}
        </div>`;
    });

    $('#chat-timeline').html(chatHtml || '<div class="text-center py-20 text-muted-soft text-[13px]">Belum ada pesan pada sesi ini.</div>');

    // --- Filter waktu (divider hari) ---
    if (days.length > 1) {
      let opts = '<option value="all">Semua waktu percakapan</option>';
      days.forEach(d => opts += `<option value="${d.key}">${escapeHtml(d.label)}</option>`);
      $('#det-day-filter').html(opts).val('all');
      $('#det-day-filter-wrap').removeClass('hidden');
      $('#det-day-filter').off('change.albDay').on('change.albDay', function () { applyDayFilter($(this).val()); });
    }

    // --- Overlay lockdown SARA (prioritas guru) ---
    const isLocked = session.page_context?.safety_state?.locked;
    if (isLocked) {
      const $btn = $('#btn-generate-key-detail');
      $btn.data('session', session.id).removeClass('hidden').prop('disabled', false).html('<i class="fa-solid fa-key mr-1.5"></i> Buat Kunci Buka Blokir');
      $('#sara-key-result').addClass('hidden').removeClass('flex');
      $('#sara-key-input').val('');
      $('#sara-lock-overlay').removeClass('hidden');
    }
  }

  // --- Aksi overlay SARA (di-bind sekali, baca session dari data attribute) ---
  $('#btn-peek-conversation').on('click', () => $('#sara-lock-overlay').addClass('hidden'));

  $('#btn-generate-key-detail').on('click', async function () {
    const sid = $(this).data('session');
    if (!sid) return;
    const $btn = $(this);
    $btn.html('<i class="fa-solid fa-spinner fa-spin"></i>').prop('disabled', true);
    try {
      const res = await ApiService.post(`/logs/sessions/${sid}/unlock-key`, {});
      if (res && res.status === 'success') {
        $btn.addClass('hidden');
        $('#sara-key-result').removeClass('hidden').addClass('flex');
        $('#sara-key-input').val(res.data.unlock_key);
      } else {
        $btn.html('<i class="fa-solid fa-key mr-1.5"></i> Gagal, coba lagi').prop('disabled', false);
      }
    } catch (e) {
      $btn.html('<i class="fa-solid fa-key mr-1.5"></i> Error, coba lagi').prop('disabled', false);
    }
  });

  $('#sara-key-copy').on('click', function () {
    const input = document.getElementById('sara-key-input');
    if (!input) return;
    input.select();
    input.setSelectionRange(0, 99999);
    navigator.clipboard?.writeText(input.value);
    const $btn = $(this);
    $btn.html('<i class="fa-solid fa-check text-green-600 text-lg"></i>');
    setTimeout(() => $btn.html('<i class="fa-regular fa-copy text-lg"></i>'), 2000);
  });

  // --- Bind navigasi & filter ---
  $('#btn-close-chat').on('click', closeDrawer);
  $('#chat-overlay').on('click', closeDrawer);

  const handleFilterChange = () => { state.page = 1; loadSummary(); loadSessions(); };
  $('#filter-search').on('input', debounce(function () { state.q = $(this).val(); handleFilterChange(); }, 500));
  $('#filter-project').on('change', function () { state.projectId = $(this).val(); handleFilterChange(); });
  $('#filter-date').on('change', function () { state.date = $(this).val(); handleFilterChange(); });
  $('#filter-mod').on('change', function () { state.moderationType = $(this).val(); handleFilterChange(); });

  $('#btn-prev-page').on('click', () => { if (state.page > 1) { state.page--; loadSessions(); } });
  $('#btn-next-page').on('click', () => { state.page++; loadSessions(); });

  $(document).on('click', '.session-card', function () {
    state.activeSessionId = $(this).data('id');
    $('.session-card').removeClass('ring-2 ring-primary ring-offset-1');
    $(this).addClass('ring-2 ring-primary ring-offset-1');
    loadDetail(state.activeSessionId);
    openDrawer();
  });

  loadProjects();
  loadSummary();
  loadSessions();
});
