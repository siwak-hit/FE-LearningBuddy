import $ from 'jquery';

export function appendTypingIndicator(opts = {}) {
  const aiMode = opts && opts.aiMode === true;
  const html = `
    <div id="typing-indicator" class="flex items-start gap-3 md:gap-4">
      <div class="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shrink-0 text-[15px] shadow-sm">
        <i class="fa-solid fa-robot"></i>
      </div>
      <div class="bg-surface-card border border-hairline rounded-2xl rounded-tl-none px-5 py-4 max-w-[80%] shadow-[0_4px_16px_rgba(0,0,0,0.04)] flex gap-1.5 items-center min-h-[52px]">
        <style>
          @keyframes alb-pulse-dot {
            0%, 80%, 100% { transform: scale(0.5); opacity: 0.4; }
            40% { transform: scale(1); opacity: 1; }
          }
          .alb-dot-anim {
            width: 7px; height: 7px; border-radius: 50%; background-color: #a8a29e;
            animation: alb-pulse-dot 1.4s infinite ease-in-out both;
          }
          .alb-dot-anim:nth-child(1) { animation-delay: -0.32s; }
          .alb-dot-anim:nth-child(2) { animation-delay: -0.16s; }
        </style>
        <div class="alb-dot-anim"></div>
        <div class="alb-dot-anim"></div>
        <div class="alb-dot-anim"></div>
        <span id="alb-typing-text" class="text-[12px] text-muted-soft ml-1.5 leading-tight"></span>
      </div>
    </div>`;

  this.$chatArea.append(html);

  // [v0.9.31 #spinner] Teks loading BERTINGKAT mengikuti lama tunggu:
  //   • < 10 dtk  → spinner + label ringan (sistem/cache biasanya secepat ini).
  //   • 10–~18 dtk → "mohon tunggu sebentar lagi" (kesan: masih diproses).
  //   • mendekati timeout (20 dtk) → kata-kata jelas bahwa sistem MASIH bekerja
  //     (server/VClass sedang sibuk), bukan diam/hang.
  clearTypingTimers();
  const $txt = $('#alb-typing-text');
  $txt.text('Mencari jawaban…');
  window.__albTypingTimers = [];
  const stage = (ms, text) => window.__albTypingTimers.push(setTimeout(() => {
    $('#alb-typing-text').text(text);
  }, ms));

  stage(1500, 'Mengecek basis pengetahuan sistem…');
  // [v0.9.28] Tahap "menyusun jawaban AI" HANYA saat mode AI (biar tak menyesatkan
  // kalau ternyata jawabannya dari sistem).
  if (aiMode) stage(3200, 'Menyusun jawaban dengan AI…');
  // Tier 2: 10 dtk → reassurance.
  stage(10000, 'Sebentar ya, jawabanmu masih diproses… 🙏');
  // Tier 3: mendekati timeout → tegaskan sistem masih bekerja.
  stage(16000, 'Masih memproses — server VClass lagi agak sibuk. Aku belum berhenti kok, mohon tunggu sebentar lagi…');

  this.scrollToBottom();
}

function clearTypingTimers() {
  // Bersihkan timer lama (format lama __albTypingTimer/2 + format array baru).
  ['__albTypingTimer', '__albTypingTimer2'].forEach((k) => {
    if (window[k]) { clearTimeout(window[k]); window[k] = null; }
  });
  if (Array.isArray(window.__albTypingTimers)) {
    window.__albTypingTimers.forEach((t) => clearTimeout(t));
    window.__albTypingTimers = [];
  }
}

export function removeTypingIndicator() {
  clearTypingTimers();
  $('#typing-indicator').remove();
}

const INPUT_LOCK_NOTICE_HIDE_KEY = `alb_hide_input_lock_notice:${window.location.host}`;
const INPUT_LOCK_NOTICE_COUNT_KEY = `alb_input_lock_notice_count:${window.location.host}`;

function getNoticeCount() {
  return Number(localStorage.getItem(INPUT_LOCK_NOTICE_COUNT_KEY) || 0) || 0;
}

function setNoticeCount(value) {
  localStorage.setItem(INPUT_LOCK_NOTICE_COUNT_KEY, String(Math.max(0, Number(value || 0))));
}

function isInputLockNoticeHiddenForever() {
  return localStorage.getItem(INPUT_LOCK_NOTICE_HIDE_KEY) === '1';
}

function showInputLockedNotice(context) {
  if (!context?.$inputArea?.length) return;
  if (isInputLockNoticeHiddenForever()) return;

  const noticeId = 'alb-input-locked-notice';
  let count = getNoticeCount() + 1;
  setNoticeCount(count);

  let $notice = $('#' + noticeId);
  if (!$notice.length) {
    $notice = $(
      `<div id="${noticeId}" class="mt-2 mb-1 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-[12px] leading-relaxed shadow-sm">
        <div class="flex items-start gap-2">
          <i class="fa-solid fa-circle-info mt-0.5 shrink-0"></i>
          <div class="flex-1 min-w-0">
            <div class="alb-input-lock-text">Input dikunci sementara. Klik tombol <b>"Sudah jelas"</b> pada respons chat terakhir untuk bisa mengetik lagi, atau pilih <b>"Belum jelas"</b> jika ingin AI menjelaskan.</div>
            <div class="alb-input-lock-extra hidden mt-2 pt-2 border-t border-amber-200/70">
              <label class="inline-flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" id="alb-hide-input-lock-notice-switch" class="rounded border-amber-300 text-primary focus:ring-primary" />
                <span>Jangan tampilkan info ini lagi</span>
              </label>
            </div>
          </div>
          <button type="button" id="alb-input-lock-notice-close" class="w-7 h-7 rounded-full bg-white/70 border border-amber-100 text-amber-800 hover:bg-white shrink-0" aria-label="Tutup info input terkunci">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>`
    );

    const $form = context.$inputArea.closest('form');
    if ($form.length) $form.before($notice);
    else context.$inputArea.before($notice);

    $notice.on('click', '#alb-input-lock-notice-close', () => hideInputLockedNotice());
    $notice.on('change', '#alb-hide-input-lock-notice-switch', function () {
      if ($(this).is(':checked')) {
        localStorage.setItem(INPUT_LOCK_NOTICE_HIDE_KEY, '1');
        hideInputLockedNotice();
      }
    });
  }

  $notice.find('.alb-input-lock-extra').toggleClass('hidden', count < 3);
  $notice.removeClass('hidden');
}

function hideInputLockedNotice() {
  $('#alb-input-locked-notice').addClass('hidden');
}

export function clearInputLockedNoticePreference() {
  localStorage.removeItem(INPUT_LOCK_NOTICE_HIDE_KEY);
  setNoticeCount(0);
  hideInputLockedNotice();
}

export function hideInputLockedNoticeExternal() {
  hideInputLockedNotice();
}

function disableSupersededFeedbackActions(context) {
  const $chatArea = context?.$chatArea;
  if (!$chatArea || !$chatArea.length) return false;

  const $pending = $chatArea.find('.alb-system-message-wrap[data-waiting-feedback="1"]');
  if (!$pending.length) return false;

  $pending.each((_, wrap) => {
    const $wrap = $(wrap);
    $wrap.find('.btn-system-feedback-ok, .btn-system-feedback-ai, .btn-ask-ai-fallback, .btn-feedback-resolved')
      .prop('disabled', true)
      .addClass('opacity-60 cursor-not-allowed pointer-events-none')
      .attr('title', 'Tombol ini sudah digantikan oleh percakapan terbaru.');
    $wrap.removeAttr('data-waiting-feedback').attr('data-superseded-feedback', '1');
  });

  hideInputLockedNotice();
  return true;
}

// [v0.9.27 #4] Saat user mengirim pertanyaan BARU, tombol-tombol dari respons sebelumnya
// "berlalu": di-disable + dibungkus accordion tertutup (auto-hide) agar layar tak ramai
// tombol. Tetap bisa dibuka kalau perlu.
function collapseSupersededActions(context) {
  const $area = context?.$chatArea;
  if (!$area || !$area.length) return;
  $area.find('.alb-action-group').not('.alb-superseded').each(function () {
    const $grp = $(this);
    const $btns = $grp.find('button');
    $grp.addClass('alb-superseded');
    if (!$btns.length) return;
    $btns.prop('disabled', true).addClass('opacity-50 cursor-not-allowed pointer-events-none').attr('title', 'Respons ini sudah berlalu.');
    const n = $btns.length;
    const $details = $(`
      <details class="alb-superseded-acc group mt-3 border border-hairline rounded-xl bg-surface-strong/50 overflow-hidden">
        <summary class="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold text-muted-soft flex items-center gap-2 [&::-webkit-details-marker]:hidden hover:bg-surface-strong transition-colors">
          <i class="fa-solid fa-clock-rotate-left text-[10px]"></i>
          <span>${n} tombol dari respons sebelumnya</span>
          <i class="fa-solid fa-chevron-down text-[10px] ml-auto transition-transform group-open:rotate-180"></i>
        </summary>
      </details>`);
    $grp.before($details);
    $details.append($grp.addClass('!mt-0 p-2.5'));
  });
}

export function scrollToBottom() {
  this.$chatArea.stop().animate({ scrollTop: this.$chatArea[0].scrollHeight }, 300);
}

export function appendBubble(rawText, isUser = false, source = 'ai', actions = [], options = {}) {
  // [v0.9.27 #1] Pengingat/notice → TOAST yang bisa diklik (buka modal), bukan kartu inline.
  if (!isUser && options.notice && typeof this.showReminderToast === 'function') {
    this.showReminderToast({ notice: options.notice, message: String(rawText ?? ''), actions: Array.isArray(actions) ? actions : [] });
    return;
  }

  let text = rawText;
  let isTutorialMode = false;

  if (isUser && disableSupersededFeedbackActions(this)) {
    this._unlockInputAfterCurrentResponse = true;
  }
  // [v0.9.27 #4] Pertanyaan baru dari user → rapikan tombol respons lama ke accordion.
  if (isUser) collapseSupersededActions(this);

  // 1. Deteksi & Parse JSON khusus dari AI
  if (!isUser && typeof text === 'string' && text.includes('"answer_mode"') && text.includes('tutorial_steps')) {
    try {
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();

      // Jika AI memotong JSON karena limit, baris ini akan melempar error
      const parsed = JSON.parse(cleanJson);

      if (parsed.answer_mode === 'tutorial_steps') {
        text = parsed;
      }
    } catch (e) {
      console.warn('[Buddy] Gagal mem-parse JSON AI (kemungkinan terpotong batas token):', e);

      // FALLBACK: Cegah raw JSON tampil ke pengguna. Ekstrak pesan utamanya saja.
      const fallbackMatch = text.match(/"answer_text"\s*:\s*"([^"]+)"/);
      if (fallbackMatch && fallbackMatch[1]) {
         text = fallbackMatch[1] + "\n\n*(Catatan: Visualisasi langkah tidak dapat ditampilkan karena penjelasan AI terlalu panjang).*";
      } else {
         text = "Penjelasan langkah-langkah terlalu panjang sehingga visualisasi terpotong oleh sistem. Tolong minta saya untuk menjelaskannya dengan lebih singkat.";
      }
    }
  }

  // 2. Tentukan Mode Tampilan
  if (typeof text === 'object' && text !== null && text.answer_mode === 'tutorial_steps') {
    isTutorialMode = true;
  }

  // 3. Bangun HTML untuk Bubble Chat
  let formattedText = '';

  if (isTutorialMode) {
    // RENDER UI TUTORIAL LANGKAH-LANGKAH + VISUAL PER LANGKAH
    formattedText = `<div class="mb-4 text-[14px] leading-relaxed text-ink">${this.formatResponseText ? this.formatResponseText(text.answer_text || '') : this.escapeHtml(text.answer_text || '')}</div>`;
    formattedText += `<div class="space-y-4">`;

    const templateElements = [
      ...(Array.isArray(text.template_elements) ? text.template_elements : []),
      ...(Array.isArray(text.elements) ? text.elements : []),
      ...(Array.isArray(this.contextData?.elements) ? this.contextData.elements : [])
    ];

    const findVisualElement = (step) => {
      const refs = [step.element_ref, step.element_key, step.key, step.ref, step.name]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase().trim());

      if (step.html) {
        return {
          key: step.element_key || step.element_ref || step.key,
          name: step.element_ref || step.element_key || step.title,
          title: step.title,
          text: step.description,
          html: step.html,
          template_styles: step.template_styles || text.template_styles || ''
        };
      }

      return templateElements.find((el) => {
        return [el.key, el.name, el.title, el.selector]
          .filter(Boolean)
          .some((value) => refs.includes(String(value).toLowerCase().trim()));
      }) || null;
    };

    (text.steps || []).forEach((step, index) => {
      const stepNumber = step.step_number || step.step || index + 1;
      formattedText += `
        <div class="alb-visual-step border border-primary/20 bg-primary/5 rounded-xl p-3 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <div class="font-bold text-[13px] text-primary mb-1">Langkah ${this.escapeHtml(stepNumber)} - ${this.escapeHtml(step.title || 'Panduan')}</div>
          <div class="text-[13px] text-body leading-relaxed">${this.escapeHtml(step.description || '')}</div>`;

      const matchedEl = findVisualElement(step);
      if (matchedEl) {
        const previewSrcdoc = this.buildElementPreviewSrcdoc
          ? this.buildElementPreviewSrcdoc(matchedEl)
          : `<!doctype html><html><body>${matchedEl.html || matchedEl.text || ''}</body></html>`;

        formattedText += `
          <div class="mt-3 border border-hairline rounded-xl overflow-hidden bg-white">
            <div class="px-3 py-2 bg-slate-50 border-b border-hairline text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center justify-between gap-2">
              <span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-eye"></i> Visual: ${this.escapeHtml(matchedEl.name || matchedEl.title || 'Elemen')}</span>
              <span class="text-[10px] normal-case font-semibold bg-white border border-hairline px-2 py-0.5 rounded-full">dari template DB</span>
            </div>
            <iframe class="buddy-inline-preview-frame w-full bg-white border-0 block"
                    style="min-height: 150px; height: 190px;"
                    sandbox="allow-popups allow-top-navigation-by-user-activation"
                    referrerpolicy="no-referrer"
                    loading="lazy"
                    srcdoc="${this.escapeHtml(previewSrcdoc)}"></iframe>
          </div>
        `;
      }

      formattedText += `</div>`;
    });

    formattedText += `</div>`;

    if (text.faq_reference && (text.faq_reference.title || text.faq_reference.content)) {
      const faqTitle = text.faq_reference.title || 'Referensi FAQ terkait';
      const faqContent = text.faq_reference.content || '';
      formattedText += this.formatResponseText
        ? this.formatResponseText(`\n\n[ACCORDION=${faqTitle}]\n${faqContent}\n[/ACCORDION]`)
        : '';
    }
  } else {
    // RENDER TEXT BIASA (Materi / Element Explanation)
    if (isUser) {
      // [v0.9.0] Beri style label pada token mention "@..." biar jadi pembeda visual.
      // Hanya token di awal kata (didahului spasi/awal) supaya email tidak ikut tersorot.
      // [v0.9.10] max-md: kontras tinggi di bubble gelap mobile (primary samar di latar hitam).
      // [#4] Token materi (@materi-N) ditampilkan sebagai "Materi: <nama materi>" — bukan
      // "materi-N" yang kurang informatif. Nama diambil dari this.materiList.
      const materiList = Array.isArray(this.materiList) ? this.materiList : [];
      formattedText = this.escapeHtml(String(text)).replace(
        /(^|\s)@([a-z0-9][\w-]*)/gi,
        (full, pre, token) => {
          const mm = token.match(/^materi-(\d+)$/i);
          let labelText = token;
          let icon = 'fa-at';
          if (mm) {
            const found = materiList.find((m) => String(m.index) === mm[1]);
            labelText = found ? `Materi: ${found.title}` : `Materi ${mm[1]}`;
            icon = 'fa-book-open';
          }
          const cls = 'font-semibold text-primary bg-primary/10 border border-primary/20 max-md:text-white max-md:bg-white/20 max-md:border-white/40 rounded px-1.5 py-px text-[13px]';
          // [#5] Pill materi bisa panjang → truncate 1 baris + klik untuk lihat penuh
          //      (saat dibuka fontnya dikecilkan biar tak melebar/terbungkus).
          if (mm) {
            return `${pre}<span class="alb-bubble-mention inline-flex items-center align-bottom max-w-[180px] cursor-pointer ${cls}" data-expanded="0" title="${this.escapeHtml(labelText)} — klik untuk lihat penuh"><i class="fa-solid ${icon} text-[10px] mr-0.5 opacity-70 shrink-0"></i><span class="alb-bubble-mention-text truncate">${this.escapeHtml(labelText)}</span></span>`;
          }
          return `${pre}<span class="inline-flex items-center ${cls}"><i class="fa-solid ${icon} text-[10px] mr-0.5 opacity-70"></i>${this.escapeHtml(labelText)}</span>`;
        }
      );
    } else {
      formattedText = this.formatResponseText(String(text));
    }
  }

  let badgeHtml = '';
  let disclaimerHtml = '';

  if (!isUser) {
    if (source === 'ai') {
      badgeHtml = `<div class="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-600 bg-sky-50 px-2 py-0.5 rounded border border-sky-100"><i class="fa-solid fa-sparkles"></i> Jawaban AI</div><br/>`;
      disclaimerHtml = `<div class="mt-3 text-[11px] text-muted-soft border-t border-hairline pt-2"><i class="fa-solid fa-circle-info"></i> Catatan: Ini adalah jawaban AI yang bisa saja keliru, selalu cek ulang dengan materi atau tanyakan ke instruktur jika ragu.</div>`;
    } else if (source === 'fallback') {
      badgeHtml = `<div class="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100"><i class="fa-solid fa-server"></i> Jaringan Lemot / Fallback</div><br/>`;
    } else {
      badgeHtml = `<div class="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200"><i class="fa-solid fa-robot"></i> Jawaban Sistem</div><br/>`;
    }
  }

  let actionsHtml = '';
  let visualHtml = '';

  if (actions && actions.length > 0) {
    const mainActions = [];
    const feedbackActions = [];
    const visualActions = [];

    actions.forEach(act => {
      // [v0.9.30] "Tanya AI" (ask_ai) ikut kelompok KONFIRMASI (kanan) bersama "Sudah jelas",
      // bukan kelompok utama/tutorial (kiri).
      if (act.type === 'system_feedback_ok' || act.type === 'system_feedback_ai' || act.type === 'feedback_resolved' || act.type === 'ask_ai') {
        feedbackActions.push(act);
      } else if (act.type === 'inline_visual') {
        visualActions.push(act);
      } else if (act.type === 'tutorial_flow') {
        // Abaikan tombol tutorial lama
      } else {
        mainActions.push(act);
      }
    });

    if (!isUser && visualActions.length > 0) {
      visualHtml += `
        <div class="alb-inline-visuals mt-5 space-y-3">
          <div class="text-[12px] font-bold text-slate-500 uppercase tracking-wide">
            Visual elemen yang dimaksud:
          </div>
      `;

      visualActions.forEach((act, index) => {
        const label = this.escapeHtml(act.label || `Visual ${index + 1}`);
        const normalizedText = this.normalizeElementText
          ? this.normalizeElementText(act.text || '', 100)
          : String(act.text || '').replace(/\s+/g, ' ').trim().slice(0, 100);
        const text = this.escapeHtml(normalizedText);

        const previewSrcdoc = this.buildElementPreviewSrcdoc
          ? this.buildElementPreviewSrcdoc({
              key: act.element_key,
              html: act.html,
              text: act.text,
              title: act.label,
              selector: act.selector,
              type: act.element_type
            })
          : `<!doctype html><html><body>${act.html || text}</body></html>`;

        const safePreviewSrcdoc = this.escapeHtml(previewSrcdoc);

        visualHtml += `
          <div class="alb-inline-visual-card border border-hairline rounded-2xl bg-slate-50 overflow-hidden">
            <div class="px-4 py-3 border-b border-hairline bg-white flex items-center justify-between gap-3">
              <div>
                <div class="text-[13px] font-semibold text-ink">${label}</div>
                ${text ? `<div class="text-[11px] text-muted-soft mt-0.5">${text}</div>` : ''}
              </div>
              <span class="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Visual</span>
            </div>
            <div class="p-3">
              <iframe
                class="buddy-inline-preview-frame w-full h-[180px] rounded-xl bg-white border border-hairline"
                sandbox="allow-popups allow-top-navigation-by-user-activation"
                referrerpolicy="no-referrer"
                loading="lazy"
                srcdoc="${safePreviewSrcdoc}"
              ></iframe>
            </div>
          </div>
        `;
      });

      visualHtml += `</div>`;
    }

    if (mainActions.length > 0 || feedbackActions.length > 0) {
      // [v0.9.27 rev] Layout 2 kelompok: KIRI = tombol utama/tutorial (~62%), KANAN =
      // kontainer tombol konfirmasi (flex, isinya "Belum/Sudah jelas" sejajar). DESKTOP
      // sebaris; MOBILE menumpuk kolom KECUALI kontainer konfirmasi tetap flex (2 tombol
      // sebaris). `[&>button]:w-full` memaksa tombol penuh.
      const _hasFeedback = feedbackActions.length > 0;
      const _hasMain = mainActions.length > 0;
      const _mainBasis = _hasFeedback ? 'md:flex-[0_0_65%]' : 'md:flex-1';
      // md:items-stretch + h-full pada tombol konfirmasi → tinggi 2 tombol konfirmasi
      // mengikuti tinggi tombol tutorial (yang punya 2 baris teks).
      actionsHtml = `
        <div class="alb-action-group mt-5 flex flex-col md:flex-row gap-2 items-stretch w-full">
          ${_hasMain ? `<div class="alb-main-actions flex flex-col gap-2 min-w-0 ${_mainBasis} shrink-0 [&>button]:w-full [&>button]:h-full [&>button]:justify-center [&>button]:text-center">` : ''}
      `;

      mainActions.forEach(act => {
        const label = this.escapeHtml(act.label || 'Aksi');
        const url = act.url ? this.escapeHtml(act.url) : '#';

        if (act.type === 'return_to_source' || act.type === 'navigate_source' || act.type === 'open_in_source_tab') {
          const targetUrl = act.url ? this.escapeHtml(act.url) : '';
          const pageType = act.pageType || act.page_type || '';
          const safePageType = this.escapeHtml(pageType);
          actionsHtml += `<button type="button" class="btn-return-source inline-flex items-center gap-1.5 bg-primary hover:bg-primary-active text-[13px] font-medium text-white px-4 py-2 rounded-full transition-colors shadow-sm" data-url="${targetUrl}" data-page-type="${safePageType}"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${label}</button>`;
        } else if (act.type === 'open_url' || act.type === 'navigate') {
          const pageType = act.pageType || act.page_type || '';
          const safePageType = this.escapeHtml(pageType);
          actionsHtml += `<button type="button" class="btn-return-source inline-flex items-center gap-1.5 bg-surface-card border border-hairline hover:bg-surface-strong text-[13px] font-medium text-ink px-4 py-2 rounded-full transition-colors shadow-sm" data-url="${url}" data-page-type="${safePageType}"><i class="fa-solid fa-arrow-right"></i> ${label}</button>`;
        } else if (act.type === 'wa_teacher') {
          actionsHtml += `<button type="button" class="btn-wa-action inline-flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-[13px] font-medium text-white px-4 py-2 rounded-full transition-colors shadow-sm"><i class="fa-brands fa-whatsapp"></i> ${label}</button>`;
        } else if (act.type === 'open_complaint') {
          // [v0.9.17] Buka modal form komplain terpandu.
          actionsHtml += `<button type="button" class="btn-open-complaint inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-[13px] font-semibold text-white px-4 py-2 rounded-full transition-colors shadow-sm"><i class="fa-solid fa-flag"></i> ${label}</button>`;
        } else if (act.type === 'resend_last') {
          // [v0.9.19] Kirim ulang request terakhir yang gagal/timeout (1 klik).
          actionsHtml += `<button type="button" class="btn-resend-last inline-flex items-center gap-1.5 bg-primary hover:bg-primary-active text-[13px] font-semibold text-white px-4 py-2 rounded-full transition-colors shadow-sm"><i class="fa-solid fa-rotate-right"></i> ${label}</button>`;
        } else if (act.type === 'pick_intent') {
          // [v0.9.24] Pilihan disambiguasi → kirim ulang dgn intent eksplisit.
          const pIntent = this.escapeHtml(act.intent || '');
          const pPrompt = this.escapeHtml(act.prompt || label);
          actionsHtml += `<button type="button" class="btn-pick-intent inline-flex items-center gap-1.5 bg-surface-card border border-primary/30 hover:bg-primary/5 text-[13px] font-semibold text-primary px-4 py-2 rounded-full transition-colors shadow-sm" data-intent="${pIntent}" data-prompt="${pPrompt}">${label}</button>`;
        } else if (act.type === 'open_moodle_materials' || act.type === 'open_moodle_material_picker') {
          const safePayload = encodeURIComponent(JSON.stringify({
            title: act.type === 'open_moodle_material_picker' ? 'Pilih Materi Moodle' : 'Materi Terkait',
            mode: act.type,
            materials: Array.isArray(act.materials) ? act.materials : []
          }));
          actionsHtml += `<button type="button" class="btn-open-moodle-materials inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 text-[13px] font-semibold px-4 py-2 rounded-full transition-colors shadow-sm" data-payload="${safePayload}"><i class="fa-solid fa-book-open"></i> ${label}</button>`;
        } else if (act.type === 'open_pdf_viewer') {
          const payload = {
            title: act.label ? act.label.replace('Buka ', '') : 'Materi Referensi',
            file_url: act.url || '',
            file_type: 'pdf',
            page_number: act.page_number || 1,
            query: act.query || '',

            // INI WAJIB IKUT MASUK KE data-source
            highlight_text:
              act.highlight_text ||
              act.chunk_text ||
              act.content ||
              ''
          };

          const safePayload = encodeURIComponent(JSON.stringify(payload));

          actionsHtml += `<button type="button" class="btn-open-source-viewer inline-flex items-center gap-1.5 bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 text-[13px] font-medium px-4 py-2 rounded-full transition-colors shadow-sm" data-source="${safePayload}"><i class="fa-solid fa-file-pdf"></i> ${label}</button>`;
        } else if (act.type === 'continue_prompt') {
          const prompt = this.escapeHtml(act.prompt || label);
          actionsHtml += `<button type="button" class="btn-continue-prompt inline-flex items-center gap-1.5 bg-surface-card border border-hairline hover:bg-surface-strong text-[13px] font-medium text-ink px-4 py-2 rounded-full transition-colors shadow-sm" data-prompt="${prompt}"><i class="fa-solid fa-forward-step"></i> ${label}</button>`;
        } else if (act.type === 'open_html_view') {
          // [v0.9.16] Bukti visual (mis. review jawaban kuis dari Moodle).
          const safePayload = encodeURIComponent(JSON.stringify({ html: act.html || '', title: act.title || 'Review Jawaban' }));
          actionsHtml += `<button type="button" class="btn-open-html-view inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 text-[13px] font-semibold px-4 py-2 rounded-full transition-colors shadow-sm" data-payload="${safePayload}"><i class="fa-solid fa-clipboard-check"></i> ${label}</button>`;
        } else if (act.type === 'quiz_setup') {
          // [v0.9.42] Pilihan jumlah soal kuis (maks 10) → kirim ulang dgn jumlah dipilih.
          const token = this.escapeHtml(act.token || '');
          const cnt = Number(act.count) || 5;
          actionsHtml += `<button type="button" class="btn-quiz-setup inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 text-[13px] font-semibold px-4 py-2 rounded-full transition-colors shadow-sm" data-token="${token}" data-count="${cnt}"><i class="fa-solid fa-list-ol"></i> ${label}</button>`;
        } else if (act.type === 'start_quiz') {
          // [v0.9.42] Kartu kuis interaktif — klik buka modal (data kuis di data-quiz).
          const quizPayload = encodeURIComponent(JSON.stringify(act.quiz || {}));
          const n = Number(act.quiz?.count) || (Array.isArray(act.quiz?.questions) ? act.quiz.questions.length : 0);
          actionsHtml += `<button type="button" class="btn-start-quiz group flex w-full max-w-full items-center gap-3 bg-white border border-primary/30 hover:border-primary/60 hover:bg-primary/5 px-4 py-3 rounded-2xl transition-all shadow-sm" data-quiz="${quizPayload}">
            <span class="w-10 h-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-[18px]"><i class="fa-solid fa-clipboard-question"></i></span>
            <span class="flex flex-col items-start min-w-0 flex-1 text-left">
              <span class="text-[14px] font-black text-ink leading-tight">📘 Latihan Quiz</span>
              <span class="text-[12px] text-muted-soft">Jumlah soal: ${n} · klik untuk mulai</span>
            </span>
            <span class="shrink-0 text-[12px] font-bold text-white bg-primary group-hover:bg-primary-active rounded-full px-3 py-1.5">Mulai</span>
          </button>`;
        } else if (act.type === 'mention_regenerate') {
          // [v0.9.8] Minta hasil @materi BARU (konteks sama, hasil beda) — bypass cache.
          const token = this.escapeHtml(act.token || '');
          const prompt = this.escapeHtml(act.prompt || label);
          actionsHtml += `<button type="button" class="btn-mention-regenerate inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 text-[13px] font-medium px-4 py-2 rounded-full transition-colors shadow-sm" data-token="${token}" data-prompt="${prompt}"><i class="fa-solid fa-rotate"></i> ${label}</button>`;
        } else if (act.type === 'switch_context_and_ask') {
          // RENDER TOMBOL CROSS-CONTEXT
          const safePayload = encodeURIComponent(JSON.stringify(act.template || {}));
          const pendingMsg = this.escapeHtml(act.pending_message || '');
          actionsHtml += `<button type="button" class="btn-switch-context inline-flex items-center gap-1.5 bg-primary hover:bg-primary-active text-[13px] font-medium text-white px-4 py-2 rounded-full transition-colors shadow-sm" data-template="${safePayload}" data-message="${pendingMsg}"><i class="fa-solid fa-exchange-alt"></i> ${label}</button>`;

        } else if (act.type === 'static_tutorial_carousel') {
          const safePayload = encodeURIComponent(JSON.stringify(act.payload || {}));
          const stepCount = Array.isArray(act.payload?.steps) ? act.payload.steps.length : 0;
          const tutorialTitle = this.escapeHtml(act.payload?.title || act.label || 'Tutorial VClass');
          actionsHtml += `
            <button type="button"
              class="btn-static-tutorial group flex w-full max-w-full items-center gap-2.5 bg-white border border-slate-200 hover:border-primary/40 hover:bg-primary/5 text-slate-800 px-3.5 py-2.5 rounded-xl transition-all shadow-sm"
              data-payload="${safePayload}">
              <span class="w-8 h-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-[14px] group-hover:bg-primary/15 transition-colors">
                <i class="fa-solid fa-book-open-reader"></i>
              </span>
              <span class="flex flex-col items-start min-w-0 flex-1 text-left">
                <span class="w-full text-[12px] font-black text-slate-900 leading-tight truncate">${tutorialTitle}</span>
                <span class="text-[10px] text-slate-500 leading-none mt-0.5">${stepCount ? `${stepCount} langkah · klik untuk buka` : 'Lihat tutorial visual'}</span>
              </span>
              <i class="fa-solid fa-chevron-right text-[11px] text-slate-400 group-hover:text-primary transition-colors shrink-0"></i>
            </button>
          `;

        } else if (act.type === 'video_tutorial') {
          const safeUrl = this.escapeHtml(act.url || '');
          const safeTitle = this.escapeHtml(act.title || 'Video Tutorial');
          actionsHtml += `<button type="button" class="btn-video-tutorial inline-flex items-center gap-1.5 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 text-[13px] font-semibold px-4 py-2 rounded-full transition-colors shadow-sm" data-url="${safeUrl}" data-title="${safeTitle}"><i class="fa-solid fa-circle-play"></i> ${label}</button>`;
        } else if (act.type === 'ask_ai') {
          // RENDER TOMBOL TANYA AI DARI FAQ (SEKARANG AMAN)
          const safePayload = encodeURIComponent(JSON.stringify(act.payload || {}));
          actionsHtml += `<button type="button" class="btn-ask-ai-fallback inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 text-[13px] font-semibold px-4 py-2 rounded-full transition-colors shadow-sm" data-payload="${safePayload}"><i class="fa-solid fa-sparkles"></i> ${label}</button>`;

        } else if (act.type === 'show_steps' || act.type === 'highlight_element') {
          actionsHtml += `<button type="button" class="inline-flex items-center gap-1.5 bg-surface-strong border border-hairline hover:bg-hairline-strong text-[13px] font-medium text-ink px-4 py-2 rounded-full transition-colors shadow-sm"><i class="fa-solid fa-bolt"></i> ${label}</button>`;
        }
      });

      // Tutup kontainer main, buka kontainer KONFIRMASI (selalu flex: 2 tombol sejajar).
      actionsHtml += `
        ${_hasMain ? '</div>' : ''}
        ${_hasFeedback ? '<div class="alb-feedback-actions flex flex-row gap-2 min-w-0 md:flex-1 [&>button]:flex-1 [&>button]:h-full [&>button]:justify-center [&>button]:text-center">' : ''}
      `;

      feedbackActions.forEach(act => {
        const label = this.escapeHtml(act.label || 'Aksi');
        if (act.type === 'system_feedback_ok') {
          // [v0.9.27 rev] rounded-xl + py-2.5 menyamai tinggi/sudut tombol tutorial.
          actionsHtml += `<button type="button" class="btn-system-feedback-ok inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 text-[13px] font-medium px-4 py-2.5 rounded-xl transition-colors shadow-sm"><i class="fa-solid fa-check"></i> ${label}</button>`;
        } else if (act.type === 'feedback_resolved') {
          actionsHtml += `<button type="button" class="btn-feedback-resolved inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[13px] font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"><i class="fa-solid fa-circle-check"></i> ${label}</button>`;
        } else if (act.type === 'system_feedback_ai') {
          const prompt = this.escapeHtml(act.prompt || 'Tolong jelaskan lebih detail dengan AI.');
          actionsHtml += `<button type="button" class="btn-system-feedback-ai inline-flex items-center gap-1.5 bg-sky-50 text-sky-700 border border-sky-100 hover:bg-sky-100 text-[13px] font-medium px-4 py-2.5 rounded-xl transition-colors shadow-sm" data-prompt="${prompt}"><i class="fa-solid fa-sparkles"></i> ${label}</button>`;
        } else if (act.type === 'ask_ai') {
          // [v0.9.30] "Tanya AI" di kelompok konfirmasi (kanan) — rounded-xl samai "Sudah jelas".
          const safePayload = encodeURIComponent(JSON.stringify(act.payload || {}));
          actionsHtml += `<button type="button" class="btn-ask-ai-fallback inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 text-[13px] font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm" data-payload="${safePayload}"><i class="fa-solid fa-sparkles"></i> ${label}</button>`;
        }
      });

      actionsHtml += `
        ${_hasFeedback ? '</div>' : ''}
        </div>
      `;
    }
  }

  const hasWaAction = !isUser && Array.isArray(actions) && actions.some((act) => ['wa_teacher', 'wa_specific_task'].includes(act?.type));
  const shouldWaitForSystemFeedback = !isUser && !hasWaAction && !options.noFeedbackLock && Array.isArray(actions) && actions.some((act) => act?.type === 'system_feedback_ok' || act?.type === 'feedback_resolved');
  if (!isUser) this._lastBotMessageWaitsForFeedback = shouldWaitForSystemFeedback;

  // [v0.9.9] Mobile: avatar disembunyikan — bubble dibedakan dari warna saja.
  const avatarHtml = isUser
    ? `<div class="w-10 h-10 rounded-full bg-surface-strong border border-hairline text-muted hidden md:flex items-center justify-center shrink-0 text-[15px]"><i class="fa-solid fa-user"></i></div>`
    : `<div class="w-10 h-10 rounded-full bg-primary text-white hidden md:flex items-center justify-center shrink-0 text-[15px] shadow-sm"><i class="fa-solid fa-robot"></i></div>`;

  // [v0.4.3] Lampirkan gambar elemen pada bubble pertanyaan user (biar konteksnya jelas).
  const userImageHtml = (isUser && options.image)
    ? `<div class="mb-2.5 rounded-lg overflow-hidden border border-hairline-strong bg-white">
         <div class="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-500"><i class="fa-solid fa-camera"></i> Elemen yang ditanyakan</div>
         <img src="${this.escapeHtml(options.image)}" alt="elemen" loading="lazy" class="w-full h-auto block max-h-48 object-contain bg-slate-50">
       </div>`
    : '';

  // [v0.9.25] Tombol Salin/Kirim-ulang kini DI DALAM bubble (baris kecil di bawah, dipisah
  // garis tipis) supaya tidak menambah baris yang bikin ramai. Warna menyesuaikan bubble
  // (user mobile = gelap → max-md:teks putih).
  const encodedUserMsg = isUser ? encodeURIComponent(String(rawText ?? '')) : '';
  const userActionsHtml = isUser ? `
    <div class="flex items-center justify-end gap-1.5 mt-2.5 pt-2 border-t border-black/5 max-md:border-white/15">
      <button type="button" class="btn-user-copy inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1 transition-colors bg-black/[0.04] hover:bg-black/10 border border-black/5 text-muted hover:text-ink max-md:bg-white/15 max-md:hover:bg-white/25 max-md:border-white/15 max-md:text-white/80 max-md:hover:text-white" data-msg="${encodedUserMsg}" title="Salin pertanyaan">
        <i class="fa-regular fa-copy"></i> Salin
      </button>
      <button type="button" class="btn-user-reload inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1 transition-colors bg-black/[0.04] hover:bg-black/10 border border-black/5 text-muted hover:text-primary max-md:bg-white/15 max-md:hover:bg-white/25 max-md:border-white/15 max-md:text-white/80 max-md:hover:text-white" data-msg="${encodedUserMsg}" title="Kirim ulang pertanyaan yang sama">
        <i class="fa-solid fa-rotate-right"></i> Kirim ulang
      </button>
    </div>` : '';

  let botActionsHtml = '';
  if (!isUser) {
    const copySource = (typeof text === 'object' && text) ? (text.answer_text || '') : String(rawText ?? '');
    const plainCopy = copySource
      .replace(/\[\/?ACCORDION[^\]]*\]/gi, '')
      .replace(/\*\*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (plainCopy) {
      botActionsHtml = `
        <div class="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-black/5">
          <button type="button" class="btn-bot-copy inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1 transition-colors bg-surface-strong hover:bg-hairline-strong border border-hairline text-muted hover:text-ink" data-copy="${encodeURIComponent(plainCopy)}" title="Salin jawaban (teks saja)">
            <i class="fa-regular fa-copy"></i> Salin
          </button>
        </div>`;
    }
  }

  // [v0.9.9] Desktop (base) = bubble user abu terang + teks gelap (seperti semula).
  // Mobile (max-md) = latar gelap + teks putih.
  const bubbleHtml = isUser
    ? `<div class="bg-surface-strong text-ink border border-hairline max-md:bg-ink max-md:text-white max-md:border-ink rounded-2xl rounded-tr-none p-4 md:p-5 max-w-[88%] md:max-w-[80%] text-[15px] shadow-[0_4px_16px_rgba(0,0,0,0.02)] leading-relaxed">${userImageHtml}${formattedText}${userActionsHtml}</div>`
    : `<div class="bg-surface-card border border-hairline rounded-2xl rounded-tl-none p-4 md:p-5 max-w-[88%] md:max-w-[80%] text-[15px] text-body shadow-[0_4px_16px_rgba(0,0,0,0.04)] leading-relaxed">${badgeHtml}${formattedText}${visualHtml}${actionsHtml}${disclaimerHtml}${botActionsHtml}</div>`;

  // [v0.9.10] Notif/pengingat (bukan jawaban chat) → kartu di TENGAH, gaya & warna beda,
  // tanpa avatar, bisa ditutup. Dipakai untuk rekomendasi kesulitan & pindah konteks.
  const noticeVariant = !isUser ? options.notice : null;
  let html;
  if (noticeVariant) {
    const cfg = noticeVariant === 'context'
      ? { wrap: 'bg-primary/5 border-primary/20', chip: 'bg-primary/15 text-primary', icon: 'fa-right-left', label: 'Konteks dialihkan' }
      : { wrap: 'bg-amber-50 border-amber-200', chip: 'bg-amber-200/70 text-amber-900', icon: 'fa-lightbulb', label: 'Pengingat' };
    html = `
      <div class="alb-system-notice my-3 mx-auto w-full max-w-[92%] md:max-w-[80%] border ${cfg.wrap} rounded-2xl p-4 pr-10 shadow-sm relative">
        <button type="button" class="btn-dismiss-notice absolute top-2.5 right-2.5 w-7 h-7 rounded-full text-muted hover:text-ink hover:bg-black/5 flex items-center justify-center transition-colors" title="Tutup pengingat"><i class="fa-solid fa-xmark text-[12px]"></i></button>
        <div class="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] ${cfg.chip} rounded-full px-2.5 py-1 mb-2"><i class="fa-solid ${cfg.icon} text-[10px]"></i> ${cfg.label}</div>
        <div class="text-[14px] leading-relaxed text-ink">${formattedText}</div>
        ${actionsHtml}
      </div>`;
  } else if (isUser) {
    html = `<div><div class="flex items-start justify-end gap-3 md:gap-4">${bubbleHtml}${avatarHtml}</div></div>`;
  } else {
    html = `<div class="alb-system-message-wrap"${shouldWaitForSystemFeedback ? ' data-waiting-feedback="1"' : ''}><div class="flex items-start gap-3 md:gap-4">${avatarHtml}${bubbleHtml}</div></div>`;
  }

  this.$chatArea.append(html);

  // [v0.9.27 #3] Tabel/daftar aktivitas LMS → sinkronkan paginasi ke viewport (mobile 1/halaman).
  if (!isUser && typeof html === 'string' && html.indexOf('data-alb-lms-table') !== -1) {
    this.syncLmsTablesPagination?.();
  }

  // Untuk jawaban sistem yang meminta konfirmasi, tahan input dulu supaya siswa
  // tidak lanjut bertanya sebelum memilih "Sudah jelas" atau "Belum jelas".
  // Tombol "Sudah jelas" akan mengaktifkan input lagi dari events.js.
  if (shouldWaitForSystemFeedback && this.$inputArea?.length && this.$btnSend?.length) {
    this.$inputArea
      .prop('disabled', true)
      .attr('placeholder', 'Klik tombol "Sudah jelas" pada respons chat terakhir untuk bisa ngechat lagi.');
    this.$btnSend.prop('disabled', true);
    showInputLockedNotice(this);
  } else if (!isUser) {
    hideInputLockedNotice();
  }

  this.scrollToBottom();
}



export function getLmsCourseIdFromContext() {
  try {
    const sourceUrl = this.contextData?.sourceUrl || this.contextData?.source_url || this.contextData?.url || window.location.href;
    const parsed = new URL(sourceUrl, window.location.href);
    return parsed.searchParams.get('id') || '2';
  } catch (_) {
    return '2';
  }
}

export function getKnownLmsUrlByPageType(pageType = '', courseId = '') {
  const LMS_BASE = 'https://lms.smpn167jakarta.sch.id';
  const cleanType = String(pageType || '').toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
  const id = courseId || this.getLmsCourseIdFromContext?.() || '2';

  if (cleanType === 'login' || cleanType === 'masuk') return `${LMS_BASE}/login/index.php`;
  if (cleanType === 'dashboard' || cleanType === 'beranda' || cleanType === 'mycourses' || cleanType === 'kursussaya') return `${LMS_BASE}/my/courses.php`;
  if (cleanType === 'course' || cleanType === 'kursus' || cleanType === 'detailkursus' || cleanType === 'kelas') return `${LMS_BASE}/course/view.php?id=${encodeURIComponent(id)}`;
  if (cleanType === 'logout' || cleanType === 'keluar') return `${LMS_BASE}/login/logout.php`;
  if (cleanType === 'grade' || cleanType === 'nilai' || cleanType === 'lihatnilai') return `${LMS_BASE}/grade/report/user/index.php?id=${encodeURIComponent(id)}`;
  if (cleanType === 'activities' || cleanType === 'activity' || cleanType === 'aktivitas' || cleanType === 'listaktivitas') return `${LMS_BASE}/course/overview.php?id=${encodeURIComponent(id)}`;
  if (cleanType === 'participants' || cleanType === 'siswa' || cleanType === 'listsiswa' || cleanType === 'peserta') return `${LMS_BASE}/user/index.php?id=${encodeURIComponent(id)}`;
  if (cleanType === 'materi' || cleanType === 'modul' || cleanType === 'resource') return `${LMS_BASE}/course/view.php?id=${encodeURIComponent(id)}`;

  return '';
}

export function inferSystemActions(userMessage = '', existingActions = []) {
  const actions = Array.isArray(existingActions) ? [...existingActions] : [];
  const alreadyHasSourceAction = actions.some((act) => ['return_to_source', 'navigate_source', 'open_in_source_tab'].includes(act?.type));
  if (alreadyHasSourceAction) return actions;

  const message = this.normalizeMatchText ? this.normalizeMatchText(userMessage) : String(userMessage || '').toLowerCase();
  if (!message) return actions;

  const templates = [
    ...(Array.isArray(this.availablePageTemplates) ? this.availablePageTemplates : []),
    ...(this.activeTemplate ? [this.activeTemplate] : [])
  ].filter(Boolean);

  const intentRules = [
    // Materi harus dicek sebelum login, karena kalimat seperti
    // "saya sudah login tinggal cari materi" mengandung kata login sebagai status, bukan permintaan login.
    { type: 'materi', words: ['materi', 'modul', 'pelajaran', 'nyari materi', 'cari materi', 'buka materi'], label: 'Buka halaman materi' },
    { type: 'dashboard', words: ['dashboard', 'beranda', 'daftar course', 'kursus saya'], label: 'Buka dashboard / kursus saya' },
    { type: 'course', words: ['course', 'kursus', 'kelas', 'mata pelajaran', 'pelajaran', 'detail kursus'], label: 'Buka halaman kelas/course' },
    { type: 'login', words: ['login', 'masuk', 'signin', 'sign in'], label: 'Buka halaman login' },
    { type: 'activities', words: ['aktifitas', 'aktivitas', 'list aktifitas', 'daftar aktivitas', 'kegiatan course'], label: 'Lihat list aktivitas course' },
    { type: 'grade', words: ['nilai', 'lihat nilai', 'grade', 'hasil nilai'], label: 'Lihat nilai yang didapat' },
    { type: 'participants', words: ['siswa', 'list siswa', 'daftar siswa', 'peserta'], label: 'Lihat list siswa course' },
    { type: 'logout', words: ['logout', 'keluar akun', 'keluar dari akun'], label: 'Logout dari VClass' },
    { type: 'quiz', words: ['quiz', 'kuis', 'ujian', 'tes'], label: 'Buka halaman kuis' }
  ];

  const matchedRule = intentRules.find((rule) => rule.words.some((word) => {
    const normalizedWord = this.normalizeMatchText ? this.normalizeMatchText(word) : word;
    return message.includes(normalizedWord);
  }));

  if (!matchedRule) return actions;

  const findText = (template) => this.normalizeMatchText ? this.normalizeMatchText([
    template.page_type,
    template.template_name,
    template.match_url_contains,
    template.match_title_contains,
    template.match_heading_contains
  ].filter(Boolean).join(' ')) : '';

  const matchedTemplate = templates.find((template) => findText(template).includes(matchedRule.type))
    || templates.find((template) => String(template.page_type || '').toLowerCase() === matchedRule.type)
    || null;

  const targetUrl = this.resolveTemplateNavigationUrl ? this.resolveTemplateNavigationUrl(matchedTemplate, matchedRule.type) : '';

  actions.push({
    type: 'return_to_source',
    label: matchedRule.label,
    pageType: matchedRule.type,
    url: targetUrl
  });

  return actions;
}

export function resolveTemplateNavigationUrl(template = {}, pageType = '') {
  const knownLmsUrl = this.getKnownLmsUrlByPageType ? this.getKnownLmsUrlByPageType(pageType) : '';
  if (knownLmsUrl) return knownLmsUrl;

  const sourceUrl = this.contextData?.sourceUrl || this.contextData?.source_url || '';
  const safeUrl = (value) => String(value || '').replace(/&amp;/g, '&').trim();
  const htmlParts = [];

  if (template?.html_preview) htmlParts.push(template.html_preview);
  const elements = this.parseTemplateJson ? this.parseTemplateJson(template?.elements_json, []) : (template?.elements_json || []);
  if (Array.isArray(elements)) elements.forEach((el) => { if (el?.html) htmlParts.push(el.html); });

  const rawHtml = htmlParts.join('\n');
  const candidates = [];
  rawHtml.replace(/(?:href|action)=['"]([^'"]+)['"]/gi, (_, url) => {
    const clean = safeUrl(url);
    if (clean && !clean.startsWith('#') && !clean.startsWith('javascript:')) candidates.push(clean);
    return _;
  });

  const normalizedPageType = this.normalizeMatchText ? this.normalizeMatchText(pageType || template?.page_type || '') : String(pageType || template?.page_type || '').toLowerCase();
  const matchUrl = this.normalizeMatchText ? this.normalizeMatchText(template?.match_url_contains || '') : String(template?.match_url_contains || '').toLowerCase();
  const wanted = [normalizedPageType, matchUrl].filter(Boolean);

  let selected = candidates.find((url) => {
    const normalized = this.normalizeMatchText ? this.normalizeMatchText(url) : url.toLowerCase();
    return wanted.some((w) => normalized.includes(w));
  }) || candidates[0] || '';

  const toAbsolute = (url, base) => {
    try { return new URL(url, base || window.location.href).href; } catch (_) { return url; }
  };

  if (selected) {
    selected = toAbsolute(selected, sourceUrl || window.location.href);

    // Kalau template hasil save berasal dari domain asli Moodle, sedangkan halaman pengguna sedang lokal/dev,
    // arahkan ke path yang sama di domain halaman asal agar tab sebelumnya yang berubah, bukan buka domain lain.
    try {
      const source = sourceUrl ? new URL(sourceUrl) : null;
      const target = new URL(selected);
      if (source && source.origin !== target.origin && (source.hostname === 'localhost' || source.hostname === '127.0.0.1')) {
        const sourceBase = source.pathname.endsWith('/') ? source.pathname : source.pathname.replace(/[^/]*$/, '');
        const targetPath = target.pathname.replace(/^\//, '');
        return `${source.origin}${sourceBase}${targetPath}${target.search || ''}${target.hash || ''}`;
      }
    } catch (_) {}

    return selected;
  }

  if (sourceUrl) {
    try {
      const source = new URL(sourceUrl);
      const basePath = source.pathname.endsWith('/') ? source.pathname : source.pathname.replace(/[^/]*$/, '');
      const fallbackSegment = template?.match_url_contains || pageType || '';
      if (fallbackSegment) return `${source.origin}${basePath}${String(fallbackSegment).replace(/^\//, '')}`;
      return source.href;
    } catch (_) {}
  }

  return '';
}
