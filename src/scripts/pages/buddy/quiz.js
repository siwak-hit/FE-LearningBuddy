// ============================================================
// quiz.js — [v0.9.42] Modal kuis interaktif (frontend-only, tak masuk DB).
// Soal/jawaban dari AI (action start_quiz). Semua interaksi (navigasi, koreksi langsung,
// skor, acak, kerjakan lagi) dikerjakan di sini. Hilang saat sesi/reload berakhir.
// ============================================================
import $ from 'jquery';

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Bangun "views" siap-tampil: urutan soal + opsi (opsional diacak), simpan indeks benar.
function buildViews(quiz, { shuffleOrder = false, shuffleOptions = false } = {}) {
  const order = quiz.questions.map((_, i) => i);
  const ordered = shuffleOrder ? shuffle(order) : order;
  return ordered.map((qi) => {
    const q = quiz.questions[qi];
    let options = q.options.map((text, i) => ({ text, correct: i === q.answer }));
    if (shuffleOptions) options = shuffle(options);
    return { q: q.q, explanation: q.explanation || '', options, correctIdx: options.findIndex((o) => o.correct) };
  });
}

let state = null; // { quiz, views, answers[], index, finished }

export function openQuizModal(quiz, opts = {}) {
  if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) return;
  const context = this;
  const views = buildViews(quiz, opts);
  state = { quiz, views, answers: new Array(views.length).fill(null), index: 0, finished: false };

  $('#alb-quiz-modal').remove();
  $('body').append(`
    <div id="alb-quiz-modal" class="fixed inset-0 z-[9800] bg-slate-950/70 backdrop-blur-sm flex items-stretch md:items-center justify-center md:p-4">
      <div class="bg-surface-card w-full h-full md:h-auto md:max-h-[88vh] md:max-w-2xl md:rounded-2xl shadow-2xl border border-hairline flex flex-col overflow-hidden">
        <div class="px-5 py-3 border-b border-hairline flex items-center justify-between gap-3 shrink-0 bg-white">
          <div class="min-w-0">
            <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted flex items-center gap-2"><i class="fa-solid fa-clipboard-question text-primary"></i> Latihan Kuis</div>
            <div class="text-[12px] text-muted-soft truncate">${esc(quiz.title || 'Materi')}</div>
          </div>
          <button type="button" class="alb-quiz-close w-9 h-9 rounded-full bg-surface-strong border border-hairline text-ink hover:bg-hairline shrink-0"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="h-1.5 bg-hairline shrink-0"><div id="alb-quiz-progress" class="h-full bg-primary transition-all duration-300" style="width:0%"></div></div>
        <div id="alb-quiz-body" class="p-5 md:p-6 overflow-y-auto flex-1"></div>
        <div id="alb-quiz-footer" class="px-5 py-3 border-t border-hairline bg-canvas-soft shrink-0 flex items-center justify-between gap-2"></div>
      </div>
    </div>
  `);

  const $modal = $('#alb-quiz-modal');
  $modal.on('click', '.alb-quiz-close', () => $modal.remove());
  $modal.on('click', (e) => { if (e.target.id === 'alb-quiz-modal') $modal.remove(); });

  // Pilih jawaban (sekali, lalu terkunci + koreksi langsung).
  $modal.on('click', '.alb-quiz-opt', function () {
    const i = state.index;
    if (state.answers[i] != null) return; // sudah dijawab
    state.answers[i] = Number($(this).attr('data-opt'));
    renderQuestion();
  });
  $modal.on('click', '.alb-quiz-prev', () => { if (state.index > 0) { state.index--; renderQuestion(); } });
  $modal.on('click', '.alb-quiz-next', () => { if (state.index < state.views.length - 1) { state.index++; renderQuestion(); } });
  $modal.on('click', '.alb-quiz-finish', () => { state.finished = true; renderResult(); });
  $modal.on('click', '.alb-quiz-retry', () => { state = { quiz, views: buildViews(quiz), answers: new Array(views.length).fill(null), index: 0, finished: false }; renderQuestion(); });
  $modal.on('click', '.alb-quiz-shuffle-q', () => { state = { quiz, views: buildViews(quiz, { shuffleOrder: true }), answers: new Array(quiz.questions.length).fill(null), index: 0, finished: false }; renderQuestion(); });
  $modal.on('click', '.alb-quiz-shuffle-a', () => { state = { quiz, views: buildViews(quiz, { shuffleOptions: true }), answers: new Array(quiz.questions.length).fill(null), index: 0, finished: false }; renderQuestion(); });
  $modal.on('click', '.alb-quiz-new', () => {
    $modal.remove();
    const token = quiz.token || '';
    if (token) context.sendDirectMessage?.({ message: `@${token} Buat ${quiz.count || quiz.questions.length} soal latihan`, mention: context.resolveMentionForSend?.(`@${token}`) || null, freshMention: true, forceAI: true, responseMode: 'short' });
  });

  renderQuestion();
}

function renderQuestion() {
  const { views, index, answers } = state;
  const v = views[index];
  const answered = answers[index] != null;
  const total = views.length;

  $('#alb-quiz-progress').css('width', `${Math.round(((index + 1) / total) * 100)}%`);

  const optsHtml = v.options.map((o, i) => {
    let cls = 'border-hairline-strong bg-white hover:bg-surface-strong';
    let icon = '';
    if (answered) {
      if (i === v.correctIdx) { cls = 'border-emerald-400 bg-emerald-50 text-emerald-800'; icon = '<i class="fa-solid fa-check text-emerald-600 ml-auto"></i>'; }
      else if (i === answers[index]) { cls = 'border-rose-400 bg-rose-50 text-rose-800'; icon = '<i class="fa-solid fa-xmark text-rose-600 ml-auto"></i>'; }
      else cls = 'border-hairline bg-white opacity-70';
    }
    return `<button type="button" class="alb-quiz-opt w-full text-left flex items-center gap-3 border rounded-xl px-4 py-3 text-[14px] transition-colors ${cls} ${answered ? 'cursor-default' : 'cursor-pointer'}" data-opt="${i}" ${answered ? 'disabled' : ''}>
      <span class="w-6 h-6 shrink-0 rounded-full border border-current/30 flex items-center justify-center text-[12px] font-bold">${String.fromCharCode(65 + i)}</span>
      <span class="min-w-0">${esc(o.text)}</span>${icon}
    </button>`;
  }).join('');

  const correct = answered && answers[index] === v.correctIdx;
  const feedback = answered
    ? `<div class="mt-4 rounded-xl px-4 py-3 text-[13px] ${correct ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}">
        <b>${correct ? '✅ Benar!' : '❌ Belum tepat.'}</b>${v.explanation ? `<br><span class="text-[12px] opacity-90">${esc(v.explanation)}</span>` : ''}
      </div>` : '';

  $('#alb-quiz-body').html(`
    <div class="text-[12px] font-bold text-muted mb-2">Soal ${index + 1} dari ${total}</div>
    <div class="text-[15px] md:text-[16px] font-semibold text-ink leading-relaxed mb-4">${esc(v.q)}</div>
    <div class="space-y-2.5">${optsHtml}</div>
    ${feedback}
  `).scrollTop(0);

  const isLast = index === total - 1;
  $('#alb-quiz-footer').html(`
    <button type="button" class="alb-quiz-prev px-4 py-2 rounded-full border border-hairline-strong text-[13px] font-semibold text-muted hover:text-ink disabled:opacity-40" ${index === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-left mr-1"></i> Sebelumnya</button>
    ${isLast
      ? `<button type="button" class="alb-quiz-finish px-5 py-2 rounded-full bg-primary hover:bg-primary-active text-white text-[13px] font-bold">Lihat Hasil <i class="fa-solid fa-flag-checkered ml-1"></i></button>`
      : `<button type="button" class="alb-quiz-next px-5 py-2 rounded-full bg-primary hover:bg-primary-active text-white text-[13px] font-bold">Selanjutnya <i class="fa-solid fa-arrow-right ml-1"></i></button>`}
  `);
}

function renderResult() {
  const { views, answers } = state;
  const total = views.length;
  let benar = 0;
  views.forEach((v, i) => { if (answers[i] === v.correctIdx) benar += 1; });
  const salah = total - benar;
  const pct = Math.round((benar / total) * 100);

  $('#alb-quiz-progress').css('width', '100%');
  $('#alb-quiz-body').html(`
    <div class="text-center py-4">
      <div class="text-[12px] font-bold uppercase tracking-wide text-muted mb-1">Nilai</div>
      <div class="text-5xl font-black ${pct >= 70 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-500' : 'text-rose-500'}">${benar} / ${total}</div>
      <div class="flex items-center justify-center gap-4 mt-4 text-[14px]">
        <span class="text-emerald-700 font-semibold"><i class="fa-solid fa-check"></i> Benar: ${benar}</span>
        <span class="text-rose-700 font-semibold"><i class="fa-solid fa-xmark"></i> Salah: ${salah}</span>
      </div>
    </div>
    <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      <button type="button" class="alb-quiz-retry flex items-center justify-center gap-2 bg-primary hover:bg-primary-active text-white rounded-xl px-4 py-3 text-[13px] font-bold"><i class="fa-solid fa-rotate-right"></i> Kerjakan lagi</button>
      <button type="button" class="alb-quiz-shuffle-q flex items-center justify-center gap-2 bg-white border border-hairline-strong hover:bg-surface-strong text-ink rounded-xl px-4 py-3 text-[13px] font-semibold"><i class="fa-solid fa-shuffle"></i> Acak urutan soal</button>
      <button type="button" class="alb-quiz-shuffle-a flex items-center justify-center gap-2 bg-white border border-hairline-strong hover:bg-surface-strong text-ink rounded-xl px-4 py-3 text-[13px] font-semibold"><i class="fa-solid fa-arrows-rotate"></i> Acak pilihan jawaban</button>
      <button type="button" class="alb-quiz-new flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 rounded-xl px-4 py-3 text-[13px] font-bold"><i class="fa-solid fa-wand-magic-sparkles"></i> Buat soal baru</button>
    </div>
  `).scrollTop(0);
  $('#alb-quiz-footer').empty();
}
