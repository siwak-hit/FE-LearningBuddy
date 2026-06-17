// src/scripts/pages/analytics.page.js
// [v0.8.3] Dashboard Analitik Pembelajaran (Fase 3).
import $ from 'jquery';
import { ApiService } from '../fetch/api.js';

$(document).ready(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  function card(label, value, icon, color) {
    return `
      <div class="bg-surface-card border border-hairline rounded-[14px] p-4 shadow-sm">
        <div class="flex items-center gap-2 text-[12px] font-semibold text-muted uppercase tracking-wide mb-1">
          <i class="fa-solid ${icon} ${color}"></i> ${esc(label)}
        </div>
        <div class="text-[28px] font-black text-ink leading-none">${esc(value)}</div>
      </div>`;
  }

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

  function renderDifficulty(dist, totalSessions) {
    const rows = [
      { label: 'Lancar', count: dist.lancar || 0, bar: 'bg-emerald-500' },
      { label: 'Mulai Bingung', count: dist.mulai_bingung || 0, bar: 'bg-amber-500' },
      { label: 'Kesulitan', count: dist.kesulitan || 0, bar: 'bg-rose-500' }
    ];
    const max = Math.max(...rows.map((r) => r.count), 1);
    return rows.map((r) => {
      const w = Math.max(4, Math.round((r.count / max) * 100));
      return `
        <div class="mb-3">
          <div class="flex items-center justify-between text-[13px] mb-1">
            <span class="text-ink font-medium">${r.label}</span>
            <span class="text-muted font-semibold">${r.count} sesi · ${pct(r.count, totalSessions)}%</span>
          </div>
          <div class="h-3 rounded-full bg-hairline-soft overflow-hidden">
            <div class="h-full rounded-full ${r.bar}" style="width:${w}%"></div>
          </div>
        </div>`;
    }).join('');
  }

  function renderEfficiency(src, eff) {
    return `
      <div class="flex items-center gap-4 mb-4">
        <div class="text-center flex-1">
          <div class="text-[30px] font-black text-emerald-600 leading-none">${eff.system_pct || 0}%</div>
          <div class="text-[12px] text-muted mt-1">Sistem / Cache</div>
        </div>
        <div class="text-center flex-1">
          <div class="text-[30px] font-black text-sky-600 leading-none">${eff.ai_pct || 0}%</div>
          <div class="text-[12px] text-muted mt-1">AI (kuota)</div>
        </div>
      </div>
      <div class="h-3 rounded-full overflow-hidden flex bg-hairline-soft">
        <div class="h-full bg-emerald-500" style="width:${eff.system_pct || 0}%"></div>
        <div class="h-full bg-sky-500" style="width:${eff.ai_pct || 0}%"></div>
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
    $('#summary-cards').html('<div class="col-span-full text-center py-6 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Menghitung analitik…</div>');

    try {
      const res = await ApiService.get(`/analytics/learning?projectId=${encodeURIComponent(projectId)}`);
      const d = res?.data;
      if (!d || !d.totals || d.totals.sessions === 0) {
        $('#summary-cards').empty();
        $('#analytics-empty').removeClass('hidden');
        ['#difficulty-chart', '#confusing-chart', '#efficiency-chart', '#topics-chart'].forEach((s) => $(s).empty());
        return;
      }
      $('#analytics-empty').addClass('hidden');

      $('#summary-cards').html(
        card('Total Sesi', d.totals.sessions, 'fa-comments', 'text-primary') +
        card('Siswa Aktif', d.totals.students, 'fa-users', 'text-sky-500') +
        card('Sesi Terdeteksi Kesulitan', d.totals.escalated_sessions, 'fa-triangle-exclamation', 'text-amber-500') +
        card('Rekomendasi Diterima', (d.recommendation?.acceptance_pct || 0) + '%', 'fa-handshake-angle', 'text-emerald-500')
      );

      $('#difficulty-chart').html(renderDifficulty(d.difficulty_distribution || {}, d.totals.sessions));
      $('#confusing-chart').html(bars(d.top_confusing_topics, 'bg-amber-500'));
      $('#efficiency-chart').html(renderEfficiency(d.answer_sources || {}, d.efficiency || {}));
      $('#topics-chart').html(bars(d.top_topics, 'bg-rose-400'));
    } catch (e) {
      $('#summary-cards').html('<div class="col-span-full text-center py-6 text-rose-500 text-[14px]">Gagal memuat analitik. Coba lagi.</div>');
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

    $('#eval-results').html(`
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div class="bg-canvas-soft rounded-xl p-4 text-center"><div class="text-[28px] font-black text-emerald-600">${p1(m.accuracy)}</div><div class="text-[12px] text-muted">Akurasi</div></div>
        <div class="bg-canvas-soft rounded-xl p-4 text-center"><div class="text-[28px] font-black text-violet-600">${p1(m.macro.f1)}</div><div class="text-[12px] text-muted">Macro-F1</div></div>
        <div class="bg-canvas-soft rounded-xl p-4 text-center"><div class="text-[28px] font-black text-ink">${m.n}</div><div class="text-[12px] text-muted">Sampel Berlabel</div></div>
      </div>
      <div class="overflow-x-auto mb-5"><div class="text-[12px] font-bold text-muted uppercase mb-2">Confusion Matrix</div>${cm}</div>
      <div class="overflow-x-auto"><div class="text-[12px] font-bold text-muted uppercase mb-2">Metrik per Kelas</div>${pc}</div>
    `);
  }

  $('#btn-export-eval').on('click', exportEval);
  $('#file-eval').on('change', function () { if (this.files && this.files[0]) onEvalFile(this.files[0]); this.value = ''; });

  $('#btn-refresh').on('click', loadAnalytics);
  $('#filter-project').on('change', loadAnalytics);

  (async () => { await loadProjects(); await loadAnalytics(); })();
});
