// ============================================================
// mentions.js — Fitur mention "@" (v0.7.0)
// Dua grup saran saat user mengetik "@":
//   • Elemen Halaman (dari konteks aktif)  → @form-login, @tombol-masuk, ...
//   • Materi (dari dokumen RAG project)     → @materi-1, @materi-2, ...
// ============================================================
import $ from 'jquery';
import { ApiService } from '../../fetch/api.js';

function slugify(s = '') {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'elemen';
}

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// [v0.7.1] Ambil daftar MATERI dari VClass (materi yang sudah diselesaikan siswa).
// [v0.7.5] Pakai flag loading agar dropdown "@" bisa menampilkan spinner saat memuat.
export async function loadMateriMentions() {
  this.materiList = this.materiList || [];
  if (!this.sessionId) return;

  this._materiLoading = true;
  // Kalau dropdown sedang terbuka, segarkan agar spinner langsung muncul.
  if (this._mentionOpen) this.renderMentionDropdown(currentMentionQuery(this));

  try {
    const res = await ApiService.get(`/chat/session-materials/${this.sessionId}`);
    if (res?.status === 'success' && Array.isArray(res.data)) {
      this.materiList = res.data.map((m, i) => ({
        index: i + 1,
        title: m.title || `Materi ${i + 1}`,
        url: m.url || '',
        locked: m.locked === true,
        documentId: m.document_id || null
      }));
    }
  } catch (_) {
    /* biarkan list lama */
  } finally {
    this._materiLoading = false;
    this._materiLoaded = true;
    // Setelah selesai, refresh dropdown bila masih terbuka.
    if (this._mentionOpen) this.renderMentionDropdown(currentMentionQuery(this));
  }
}

// Ambil token "@..." yang sedang diketik di akhir input (untuk refresh dropdown).
function currentMentionQuery(context) {
  const m = (context.$inputArea?.val() || '').match(/@([\w-]*)$/);
  return m ? m[1] : '';
}

function buildMentionGroups(context, query = '') {
  const q = String(query || '').toLowerCase();
  const elements = Array.isArray(context.contextData?.elements) ? context.contextData.elements : [];
  const elemItems = elements.map((el) => ({ type: 'elemen', token: slugify(el.name), label: el.name, el }));
  const materiItems = (context.materiList || []).map((m) => ({
    type: 'materi', token: `materi-${m.index}`, label: m.title,
    documentId: m.documentId, url: m.url, index: m.index, locked: m.locked === true
  }));
  const f = (items) => (q ? items.filter((it) => it.token.includes(q) || it.label.toLowerCase().includes(q)) : items);
  return { elemen: f(elemItems).slice(0, 12), materi: f(materiItems).slice(0, 20) };
}

export function hideMentionDropdown() {
  $('#alb-mention-dropdown').remove();
  this._mentionOpen = false;
}

export function renderMentionDropdown(query = '') {
  const groups = buildMentionGroups(this, query);
  const materiLoading = this._materiLoading === true;
  // Jangan sembunyikan kalau materi masih dimuat (biar spinner tetap tampil).
  if (!groups.elemen.length && !groups.materi.length && !materiLoading) { this.hideMentionDropdown(); return; }
  this._mentionGroups = groups;

  const renderItem = (it, idx) => {
    if (it.locked) {
      // Materi terkunci: disabled + ikon gembok, tidak bisa diklik.
      return `
        <div class="w-full text-left px-3 py-2 flex items-center gap-2 opacity-55 cursor-not-allowed select-none" title="Materi ini masih terkunci di VClass">
          <span class="text-slate-400 font-bold text-[13px] shrink-0">@${esc(it.token)}</span>
          <span class="text-[12px] text-muted truncate">${esc(it.label)}</span>
          <i class="fa-solid fa-lock text-[11px] text-slate-400 ml-auto shrink-0"></i>
        </div>`;
    }
    return `
      <button type="button" class="alb-mention-item w-full text-left px-3 py-2 hover:bg-primary/5 flex items-center gap-2 border-0 bg-transparent cursor-pointer" data-group="${it.type}" data-idx="${idx}">
        <span class="text-primary font-bold text-[13px] shrink-0">@${esc(it.token)}</span>
        <span class="text-[12px] text-muted truncate">${esc(it.label)}</span>
      </button>`;
  };

  const header = (title, icon) => `<div class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted bg-surface-strong border-b border-hairline">${icon} ${title}</div>`;
  const grp = (title, icon, items) => (items.length ? `${header(title, icon)}${items.map((it, idx) => renderItem(it, idx)).join('')}` : '');

  // Bagian Materi: spinner saat memuat, daftar saat ada, hint saat kosong.
  let materiSection = '';
  if (materiLoading && !groups.materi.length) {
    materiSection = `${header('Materi (sudah kamu selesaikan)', '📚')}
      <div class="px-3 py-3 flex items-center gap-2 text-[12px] text-muted">
        <i class="fa-solid fa-spinner fa-spin text-primary"></i> Memuat materi dari VClass…
      </div>`;
  } else if (groups.materi.length) {
    materiSection = grp('Materi (sudah kamu selesaikan)', '📚', groups.materi);
  } else if (this._materiLoaded) {
    materiSection = `${header('Materi (sudah kamu selesaikan)', '📚')}
      <div class="px-3 py-3 text-[12px] text-muted-soft">Belum ada materi yang kamu selesaikan${query ? ' cocok pencarian' : ''}.</div>`;
  }

  const html = `
    <div id="alb-mention-dropdown" class="absolute bottom-full left-0 right-0 mb-2 max-h-64 overflow-y-auto bg-surface-card border border-hairline-strong rounded-2xl shadow-2xl z-30">
      ${grp('Elemen Halaman (Sistem)', '🧩', groups.elemen)}
      ${materiSection}
    </div>`;

  const $form = $('#chat-form');
  if (!$form.length) return;
  $('#alb-mention-dropdown').remove();
  $form.css('position', 'relative').append(html);
  this._mentionOpen = true;
}

// Dipanggil tiap input berubah — tampilkan dropdown bila sedang mengetik token "@...".
export function handleMentionInput() {
  // Begitu user mengetik sendiri, tutup dropdown saran lanjutan materi.
  if (this._materiFollowupOpen) this.hideMateriFollowupDropdown?.();

  const val = this.$inputArea?.val() || '';
  const m = val.match(/@([\w-]*)$/);
  if (m) {
    this.renderMentionDropdown(m[1]);
    return true;
  }
  this.hideMentionDropdown();
  if (this.activeMention && !val.includes('@' + this.activeMention.token)) this.activeMention = null;
  return false;
}

export function selectMention(group, idx) {
  const item = this._mentionGroups?.[group]?.[idx];
  if (!item || item.locked) return;

  // [v0.9.2] Tag tidak lagi jadi teks mentah di input — diubah jadi LABEL/chip + tombol X.
  // Buang token "@..." yang sedang diketik; sisa teks tetap jadi pertanyaan.
  const val = this.$inputArea.val() || '';
  const remainder = val.replace(/@[\w-]*$/, '').replace(/\s{2,}/g, ' ').trimStart();
  this.$inputArea.val(remainder).focus();

  const mention = item.type === 'materi'
    ? { type: 'materi', token: item.token, documentId: item.documentId, url: item.url, label: item.label, locked: false }
    : { type: 'elemen', token: item.token, label: item.label, el: item.el };

  this.setInputMention(mention);
  this.hideMentionDropdown();

  // [v0.9.2] Materi: munculkan DROPDOWN saran lanjutan. Di-defer agar klik pemicu
  // tidak langsung tertangkap handler "klik di luar" yang menutupnya seketika.
  if (item.type === 'materi') {
    setTimeout(() => this.renderMateriFollowupDropdown?.(mention), 0);
  }
}

// [v0.9.2] Render chip mention di dalam kolom input (gaya label seperti bubble user).
export function setInputMention(mention = {}) {
  if (!mention?.token) return;
  this.activeMention = mention;

  const $form = $('#chat-form');
  if (!$form.length) return;
  $('#alb-input-mention-chip').remove();

  const isMateri = mention.type === 'materi';
  const display = `@${mention.token}`;
  const chip = `
    <span id="alb-input-mention-chip" class="shrink-0 inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full pl-2.5 pr-1 py-1 text-[13px] font-semibold ml-1 max-w-[55%]" title="${esc(mention.label || display)}">
      <i class="fa-solid fa-at text-[10px] opacity-70"></i>
      <span class="truncate">${esc(display)}</span>
      <button type="button" id="alb-input-mention-remove" class="w-5 h-5 shrink-0 rounded-full hover:bg-primary/20 flex items-center justify-center border-0 bg-transparent text-primary cursor-pointer" title="Hapus tag"><i class="fa-solid fa-xmark text-[10px]"></i></button>
    </span>`;
  $form.prepend(chip);
  this.$inputArea?.attr('placeholder', isMateri ? 'Tulis pertanyaanmu, atau pilih saran di atas…' : 'Tulis pertanyaan tentang elemen ini…');
}

export function clearInputMention() {
  $('#alb-input-mention-chip').remove();
  this.hideMateriFollowupDropdown?.();
  this.activeMention = null;
  this.$inputArea?.attr('placeholder', 'Tanya sesuatu atau pilih elemen...');
}

// Daftar saran lanjutan untuk @materi-N.
const MATERI_FOLLOWUP_SUGGESTIONS = [
  { text: 'Rangkum materi ini', icon: 'fa-wand-magic-sparkles', hint: 'AI buat ringkasan singkat' },
  { text: 'Apa poin penting materi ini?', icon: 'fa-list-ul', hint: 'Daftar inti materi' },
  { text: 'Jelaskan materi ini dengan bahasa sederhana', icon: 'fa-lightbulb', hint: 'Penjelasan mudah dipahami' },
  { text: 'Buat 3 soal latihan dari materi ini', icon: 'fa-pen-to-square', hint: 'Latihan mandiri' }
];

export function hideMateriFollowupDropdown() {
  $('#alb-materi-followup').remove();
  this._materiFollowupOpen = false;
}

// [v0.9.1] DROPDOWN saran lanjutan (bukan chip) saat siswa memilih @materi-N.
// "Rangkum materi ini" memicu jalur AI di BE (wantsSummary) walau mode default.
export function renderMateriFollowupDropdown(mention = {}) {
  const $form = $('#chat-form');
  if (!$form.length || !mention?.token) return;

  this._materiFollowup = mention;
  $('#alb-mention-dropdown').remove();         // tutup dropdown mention bila masih ada
  $('#alb-materi-followup').remove();

  const label = esc(mention.label || 'Materi ini');
  const itemsHtml = MATERI_FOLLOWUP_SUGGESTIONS.map((s, idx) => `
    <button type="button" class="alb-materi-followup-item w-full text-left px-3 py-2.5 hover:bg-primary/5 flex items-center gap-3 border-0 bg-transparent cursor-pointer" data-idx="${idx}">
      <span class="w-7 h-7 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[12px]"><i class="fa-solid ${s.icon}"></i></span>
      <span class="flex flex-col min-w-0">
        <span class="text-[13px] font-semibold text-ink leading-tight">${esc(s.text)}</span>
        <span class="text-[11px] text-muted-soft leading-tight">${esc(s.hint)}</span>
      </span>
    </button>`).join('');

  const html = `
    <div id="alb-materi-followup" class="absolute bottom-full left-0 right-0 mb-2 max-h-72 overflow-y-auto bg-surface-card border border-hairline-strong rounded-2xl shadow-2xl z-30">
      <div class="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted bg-surface-strong border-b border-hairline flex items-center gap-1.5">
        <i class="fa-solid fa-book-open text-primary"></i> Mau apa dengan materi: ${label}?
      </div>
      ${itemsHtml}
    </div>`;

  $form.css('position', 'relative').append(html);
  this._materiFollowupOpen = true;
}

// Dipanggil saat klik item dropdown lanjutan materi.
export function selectMateriFollowup(idx) {
  const mention = this._materiFollowup;
  const s = MATERI_FOLLOWUP_SUGGESTIONS[Number(idx)];
  if (!mention || !s) return;
  const message = `@${mention.token} ${s.text}`;
  // Bersihkan chip & dropdown sebelum kirim.
  this.clearInputMention?.();
  this.$inputArea.val('');
  this.sendDirectMessage?.({ message, mention });
}

// Resolusi mention saat kirim (mendukung klik suggestion ATAU ketik manual).
export function resolveMentionForSend(text = '') {
  const t = String(text || '');
  if (this.activeMention && t.includes('@' + this.activeMention.token)) return this.activeMention;

  const mm = t.match(/@materi-(\d+)/i);
  if (mm) {
    const idx = Number(mm[1]);
    const m = (this.materiList || []).find((x) => x.index === idx);
    if (m) return { type: 'materi', token: `materi-${idx}`, documentId: m.documentId, url: m.url, label: m.title, locked: m.locked === true };
  }

  const em = t.match(/@([\w-]+)/);
  if (em) {
    const slug = em[1].toLowerCase();
    const el = (this.contextData?.elements || []).find((e) => slugify(e.name) === slug);
    if (el) return { type: 'elemen', token: slug, label: el.name, el };
  }
  return null;
}

export function bindMentionEvents() {
  const context = this;
  $(document)
    .off('click.albMentionItem')
    .on('click.albMentionItem', '.alb-mention-item', function () {
      context.selectMention($(this).attr('data-group'), Number($(this).attr('data-idx')));
    });
  // [v0.9.1] Klik item dropdown saran lanjutan @materi.
  $(document)
    .off('click.albMateriFollowup')
    .on('click.albMateriFollowup', '.alb-materi-followup-item', function () {
      context.selectMateriFollowup(Number($(this).attr('data-idx')));
    });
  // [v0.9.2] Tombol X pada chip mention di input → hapus tag.
  $(document)
    .off('click.albMentionChipRemove')
    .on('click.albMentionChipRemove', '#alb-input-mention-remove', function (e) {
      e.preventDefault();
      e.stopPropagation();
      context.clearInputMention?.();
      context.$inputArea?.focus();
    });
  // Tutup dropdown bila klik di luar area input/dropdown.
  $(document)
    .off('click.albMentionOutside')
    .on('click.albMentionOutside', (e) => {
      const $t = $(e.target);
      if (context._mentionOpen && !$t.closest('#alb-mention-dropdown, #chat-input').length) {
        context.hideMentionDropdown();
      }
      if (context._materiFollowupOpen && !$t.closest('#alb-materi-followup, #chat-input').length) {
        context.hideMateriFollowupDropdown();
      }
    });
}
