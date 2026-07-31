// src/scripts/pages/analytics.page.js
// [v0.8.3] Dashboard Analitik Pembelajaran (Fase 3).
import $ from 'jquery';
import { ApiService } from '../fetch/api.js';

$(document).ready(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  // Bar horizontal: items [{label,count}], color class untuk bar.
  function bars(items, colorClass) {
    if (!items || !items.length) return '<div class="text-[13px] text-muted-soft py-3 text-center">Belum ada data.</div>';
    const max = Math.max(...items.map((i) => i.count), 1);
    return items.map((it) => {
      const w = Math.max(4, Math.round((it.count / max) * 100));
      return `
        <div class="mb-2.5">
          <div class="flex items-center justify-between text-[13px] mb-1">
            <span class="text-ink font-medium truncate pr-2">${esc(it.label)}</span>
            <span class="text-muted font-semibold shrink-0">${it.count}</span>
          </div>
          <div class="h-2.5 rounded-full bg-hairline-soft overflow-hidden">
            <div class="h-full rounded-full ${colorClass}" style="width:${w}%"></div>
          </div>
        </div>`;
    }).join('');
  }

  // Histogram vertikal distribusi tingkat kesulitan.
  function renderDifficulty(dist, totalSessions) {
    const rows = [
      { label: 'Lancar', count: dist.lancar || 0, bar: 'bg-[#6f8f6a]' },
      { label: 'Mulai Bingung', count: dist.mulai_bingung || 0, bar: 'bg-[#bfa059]' },
      { label: 'Kesulitan', count: dist.kesulitan || 0, bar: 'bg-[#c08472]' }
    ];
    const max = Math.max(...rows.map((r) => r.count), 1);
    const MAX_PX = 150;
    const columns = rows.map((r) => {
      const h = r.count > 0 ? Math.max(6, Math.round((r.count / max) * MAX_PX)) : 2;
      return `
        <div class="flex flex-col items-center justify-end flex-1">
          <span class="text-[13px] font-bold text-ink mb-1.5">${r.count}</span>
          <div class="w-full max-w-[72px] ${r.bar} rounded-t-md transition-all" style="height:${h}px"></div>
        </div>`;
    }).join('');
    const labels = rows.map((r) => `
      <div class="flex-1 text-center">
        <div class="text-[13px] text-ink font-medium">${r.label}</div>
        <div class="text-[11px] text-muted-soft">${pct(r.count, totalSessions)}%</div>
      </div>`).join('');
    return `
      <div class="pt-2">
        <div class="flex items-end justify-around gap-4 border-b border-hairline" style="height:${MAX_PX + 24}px">${columns}</div>
        <div class="flex justify-around gap-4 mt-2">${labels}</div>
      </div>`;
  }

  function renderEfficiency(src, eff) {
    return `
      <div class="flex items-center gap-4 mb-4">
        <div class="text-center flex-1">
          <div class="text-[30px] font-black text-[#6f8f6a] leading-none">${eff.system_pct || 0}%</div>
          <div class="text-[12px] text-muted mt-1">Sistem / Cache</div>
        </div>
        <div class="text-center flex-1">
          <div class="text-[30px] font-black text-[#7b91b0] leading-none">${eff.ai_pct || 0}%</div>
          <div class="text-[12px] text-muted mt-1">AI (kuota)</div>
        </div>
      </div>
      <div class="h-3 rounded-full overflow-hidden flex bg-hairline-soft">
        <div class="h-full bg-[#6f8f6a]" style="width:${eff.system_pct || 0}%"></div>
        <div class="h-full bg-[#7b91b0]" style="width:${eff.ai_pct || 0}%"></div>
      </div>
      <div class="text-[12px] text-muted mt-3">Sistem: ${src.system || 0} · Cache: ${src.cache || 0} · AI: ${src.ai || 0} (total ${src.total || 0} jawaban)</div>`;
  }

  async function loadProjects() {
    try {
      const res = await ApiService.get('/projects');
      if (res && res.data) {
        let opts = '<option value="all">Semua Project</option>';
        res.data.forEach((p) => { opts += `<option value="${esc(p.id)}">${esc(p.name)}</option>`; });
        $('#filter-project').html(opts);
      }
    } catch (_) { /* abaikan */ }
  }

  async function loadAnalytics() {
    const projectId = $('#filter-project').val() || 'all';
    ['#difficulty-chart', '#confusing-chart', '#efficiency-chart', '#topics-chart'].forEach((s) => $(s).html('<div class="text-center py-6 text-muted"><i class="fa-solid fa-spinner fa-spin"></i></div>'));

    try {
      const res = await ApiService.get(`/analytics/learning?projectId=${encodeURIComponent(projectId)}`);
      const d = res?.data;
      if (!d || !d.totals || d.totals.sessions === 0) {
        $('#analytics-empty').removeClass('hidden');
        ['#difficulty-chart', '#confusing-chart', '#efficiency-chart', '#topics-chart'].forEach((s) => $(s).empty());
        return;
      }
      $('#analytics-empty').addClass('hidden');

      $('#difficulty-chart').html(renderDifficulty(d.difficulty_distribution || {}, d.totals.sessions));
      $('#confusing-chart').html(bars(d.top_confusing_topics, 'bg-[#bfa059]'));
      $('#efficiency-chart').html(renderEfficiency(d.answer_sources || {}, d.efficiency || {}));
      $('#topics-chart').html(bars(d.top_topics, 'bg-[#c08472]'));
    } catch (e) {
      ['#difficulty-chart', '#confusing-chart', '#efficiency-chart', '#topics-chart'].forEach((s) => $(s).empty());
      $('#difficulty-chart').html('<div class="text-center py-6 text-rose-500 text-[14px]">Gagal memuat analitik. Coba lagi.</div>');
    }
  }

  // ===================== Fase 4: Evaluasi Model =====================
  const EVAL_COLS = ['session_id', 'student', 'messages', 'score', 'predicted', 'repeated', 'frustration', 'same_intent_streak', 'burnout', 'sample_question', 'actual'];
  const csvCell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  // Parser CSV sederhana (mendukung field berkutip).
  function parseCsv(text) {
    const rows = []; let row = []; let field = ''; let inQ = false;
    const s = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < s.length; i += 1) {
      const c = s[i];
      if (inQ) {
        if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 1; } else inQ = false; }
        else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.length && r.some((c) => String(c).trim() !== ''));
  }

  async function exportEval() {
    const projectId = $('#filter-project').val() || 'all';
    $('#eval-status').text('Menyiapkan dataset…');
    try {
      const res = await ApiService.get(`/analytics/evaluation/export?projectId=${encodeURIComponent(projectId)}`);
      const rows = res?.data?.rows || [];
      if (!rows.length) { $('#eval-status').text('Belum ada sesi untuk diekspor.'); return; }
      const lines = [EVAL_COLS.join(',')];
      rows.forEach((r) => lines.push(EVAL_COLS.map((c) => csvCell(r[c])).join(',')));
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `dataset_evaluasi_${projectId}_${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      $('#eval-status').text(`${rows.length} baris diekspor. Isi kolom "actual" lalu unggah lagi.`);
    } catch (_) { $('#eval-status').text('Gagal mengekspor dataset.'); }
  }

  async function onEvalFile(file) {
    $('#eval-status').text('Membaca file…');
    const text = await file.text();
    const grid = parseCsv(text);
    if (grid.length < 2) { $('#eval-status').text('CSV kosong / tidak valid.'); return; }
    const header = grid[0].map((h) => String(h).trim().toLowerCase());
    const iPred = header.indexOf('predicted');
    const iAct = header.indexOf('actual');
    if (iPred === -1 || iAct === -1) { $('#eval-status').text('CSV harus punya kolom "predicted" dan "actual".'); return; }
    const pairs = grid.slice(1)
      .map((r) => ({ predicted: r[iPred], actual: r[iAct] }))
      .filter((p) => String(p.actual || '').trim() !== '');
    if (!pairs.length) { $('#eval-status').text('Kolom "actual" belum diisi.'); return; }

    try {
      const res = await ApiService.post('/analytics/evaluation/compute', { pairs });
      if (res?.data) { renderEval(res.data); $('#eval-status').text(`Dihitung dari ${res.data.n} sampel berlabel.`); }
      else $('#eval-status').text(res?.message || 'Gagal menghitung metrik.');
    } catch (_) { $('#eval-status').text('Gagal menghitung metrik.'); }
  }

  function renderEval(m) {
    const txt = m.label_text || {};
    const p1 = (x) => (x * 100).toFixed(1) + '%';
    // Confusion matrix
    let cm = `<table class="text-[12px] border-collapse"><thead><tr><th class="p-2 text-muted text-left">Asli ↓ / Prediksi →</th>`;
    m.labels.forEach((p) => { cm += `<th class="p-2 text-center text-ink">${txt[p] || p}</th>`; });
    cm += '</tr></thead><tbody>';
    m.labels.forEach((a) => {
      cm += `<tr><td class="p-2 font-semibold text-ink">${txt[a] || a}</td>`;
      m.labels.forEach((p) => {
        const v = m.confusion_matrix[a][p];
        const diag = a === p;
        cm += `<td class="p-2 text-center ${diag ? 'bg-emerald-50 text-emerald-700 font-bold' : (v ? 'bg-rose-50 text-rose-600' : 'text-muted-soft')} border border-hairline rounded">${v}</td>`;
      });
      cm += '</tr>';
    });
    cm += '</tbody></table>';

    let pc = `<table class="w-full text-[12px]"><thead><tr class="text-muted text-left"><th class="p-2">Kelas</th><th class="p-2">Precision</th><th class="p-2">Recall</th><th class="p-2">F1</th><th class="p-2">Jumlah</th></tr></thead><tbody>`;
    m.labels.forEach((l) => {
      const c = m.per_class[l];
      pc += `<tr class="border-t border-hairline"><td class="p-2 font-semibold text-ink">${txt[l] || l}</td><td class="p-2">${p1(c.precision)}</td><td class="p-2">${p1(c.recall)}</td><td class="p-2 font-semibold">${p1(c.f1)}</td><td class="p-2">${c.support}</td></tr>`;
    });
    pc += `<tr class="border-t-2 border-hairline-strong"><td class="p-2 font-bold text-ink">Makro Rata-rata</td><td class="p-2">${p1(m.macro.precision)}</td><td class="p-2">${p1(m.macro.recall)}</td><td class="p-2 font-bold">${p1(m.macro.f1)}</td><td class="p-2">${m.n}</td></tr>`;
    pc += '</tbody></table>';

    // [v0.9.51] Diagram batang Precision/Recall/F1 per kelas (CSS murni, tanpa library).
    const COLORS = { precision: '#2a78d6', recall: '#1baf7a', f1: '#eda100' };
    const bar = (val, color) => {
      const h = Math.max(2, Math.round(val * 100 * 1.5)); // 100% => 150px
      return `<div class="flex flex-col items-center justify-end">
        <span class="text-[9px] text-muted mb-0.5">${Math.round(val * 100)}</span>
        <div style="width:20px;height:${h}px;background:${color};border-radius:3px 3px 0 0"></div>
      </div>`;
    };
    let groups = '';
    m.labels.forEach((l) => {
      const c = m.per_class[l];
      groups += `<div class="flex flex-col items-center gap-2 flex-1">
        <div class="flex items-end justify-center gap-1.5" style="height:172px">${bar(c.precision, COLORS.precision)}${bar(c.recall, COLORS.recall)}${bar(c.f1, COLORS.f1)}</div>
        <div class="text-[11px] font-semibold text-ink text-center leading-tight">${txt[l] || l}</div>
      </div>`;
    });
    const legend = `<div class="flex flex-wrap gap-3 text-[11px] text-muted mb-3">
      <span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm" style="background:${COLORS.precision}"></span>Precision</span>
      <span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm" style="background:${COLORS.recall}"></span>Recall</span>
      <span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm" style="background:${COLORS.f1}"></span>F1</span>
    </div>`;
    const barChart = `<div class="border border-hairline rounded-xl p-4">${legend}<div class="flex items-end justify-around gap-3">${groups}</div><div class="text-[10px] text-muted-soft mt-2 text-center">Nilai dalam persen (0–100)</div></div>`;

    const tabBtn = (id, label, active) =>
      `<button type="button" data-eval-view="${id}" class="eval-view-btn px-3 py-1.5 text-[12px] font-semibold rounded-lg border transition-colors ${active ? 'bg-primary text-white border-primary' : 'bg-white text-muted border-hairline hover:text-ink'}">${label}</button>`;

    $('#eval-results').html(`
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div class="bg-canvas-soft rounded-xl p-4 text-center"><div class="text-[28px] font-black text-emerald-600">${p1(m.accuracy)}</div><div class="text-[12px] text-muted">Akurasi</div></div>
        <div class="bg-canvas-soft rounded-xl p-4 text-center"><div class="text-[28px] font-black text-violet-600">${p1(m.macro.f1)}</div><div class="text-[12px] text-muted">Macro-F1</div></div>
        <div class="bg-canvas-soft rounded-xl p-4 text-center"><div class="text-[28px] font-black text-ink">${m.n}</div><div class="text-[12px] text-muted">Sampel Berlabel</div></div>
      </div>
      <div class="flex items-center gap-2 mb-4">${tabBtn('table', 'Tabel', true)}${tabBtn('chart', 'Diagram', false)}</div>
      <div data-eval-pane="table">
        <div class="overflow-x-auto mb-5"><div class="text-[12px] font-bold text-muted uppercase mb-2">Confusion Matrix</div>${cm}</div>
        <div class="overflow-x-auto"><div class="text-[12px] font-bold text-muted uppercase mb-2">Metrik per Kelas</div>${pc}</div>
      </div>
      <div data-eval-pane="chart" class="hidden">
        <div class="mb-5"><div class="text-[12px] font-bold text-muted uppercase mb-2">Precision / Recall / F1 per Kelas</div>${barChart}</div>
        <div class="overflow-x-auto"><div class="text-[12px] font-bold text-muted uppercase mb-2">Confusion Matrix</div>${cm}</div>
      </div>
    `);
  }

  // [v0.9.51] Toggle tampilan hasil evaluasi: Tabel <-> Diagram.
  $('#eval-results').on('click', '.eval-view-btn', function () {
    const view = $(this).data('eval-view');
    $('#eval-results .eval-view-btn').removeClass('bg-primary text-white border-primary').addClass('bg-white text-muted border-hairline');
    $(this).addClass('bg-primary text-white border-primary').removeClass('bg-white text-muted border-hairline');
    $('#eval-results [data-eval-pane]').addClass('hidden');
    $(`#eval-results [data-eval-pane="${view}"]`).removeClass('hidden');
  });

  $('#btn-export-eval').on('click', exportEval);
  $('#file-eval').on('change', function () { if (this.files && this.files[0]) onEvalFile(this.files[0]); this.value = ''; });

  $('#btn-refresh').on('click', loadAnalytics);
  $('#filter-project').on('change', loadAnalytics);

  // Modal panduan membaca analitik (carousel Info).
  let anInfoIdx = 0;
  const anSlides = () => $('.an-info-slide');
  function renderAnInfo() {
    const slides = anSlides();
    const total = slides.length || 1;
    if (anInfoIdx < 0) anInfoIdx = 0;
    if (anInfoIdx > total - 1) anInfoIdx = total - 1;
    slides.addClass('hidden').eq(anInfoIdx).removeClass('hidden');
    $('#an-info-prev').prop('disabled', anInfoIdx === 0).toggleClass('opacity-40 cursor-not-allowed', anInfoIdx === 0);
    const last = anInfoIdx === total - 1;
    $('#an-info-next').html(last
      ? '<span class="hidden sm:inline">Selesai</span><i class="fa-solid fa-check text-[11px]"></i>'
      : '<span class="hidden sm:inline">Berikutnya</span><i class="fa-solid fa-chevron-right text-[11px]"></i>');
    $('#an-info-dots').html(
      Array.from({ length: total }, (_, i) =>
        `<span class="w-2 h-2 rounded-full ${i === anInfoIdx ? 'bg-ink' : 'bg-hairline-strong'}"></span>`
      ).join('')
    );
    // Scroll badan modal balik ke atas tiap ganti slide.
    $('#analytics-info-modal .overflow-y-auto').scrollTop(0);
  }
  const openInfo = () => { anInfoIdx = 0; $('#analytics-info-modal').removeClass('hidden'); renderAnInfo(); };
  const closeInfo = () => $('#analytics-info-modal').addClass('hidden');
  $('#btn-info-analytics').on('click', openInfo);
  $('#analytics-info-close, #analytics-info-overlay').on('click', closeInfo);
  $('#an-info-prev').on('click', () => { anInfoIdx -= 1; renderAnInfo(); });
  $('#an-info-next').on('click', () => {
    const total = anSlides().length;
    if (anInfoIdx >= total - 1) { closeInfo(); return; }
    anInfoIdx += 1; renderAnInfo();
  });
  $(document).on('keydown', (e) => {
    if ($('#analytics-info-modal').hasClass('hidden')) return;
    if (e.key === 'Escape') closeInfo();
    else if (e.key === 'ArrowRight') { anInfoIdx = Math.min(anSlides().length - 1, anInfoIdx + 1); renderAnInfo(); }
    else if (e.key === 'ArrowLeft') { anInfoIdx = Math.max(0, anInfoIdx - 1); renderAnInfo(); }
  });

  // Tab menu analitik (Section 2): tab bar di desktop, dropdown di mobile — tersinkron.
  function activateAnalyticsTab(target) {
    if (!target) return;
    $('#analytics-tabs .an-tab-btn').removeClass('is-active');
    $(`#analytics-tabs .an-tab-btn[data-target="${target}"]`).addClass('is-active');
    $('.an-pane').addClass('hidden');
    $('#' + target).removeClass('hidden');
    $('#analytics-tab-select').val(target);
  }
  $('#analytics-tabs .an-tab-btn').on('click', function () { activateAnalyticsTab($(this).data('target')); });
  $('#analytics-tab-select').on('change', function () { activateAnalyticsTab($(this).val()); });

  (async () => { await loadProjects(); await loadAnalytics(); })();
});
