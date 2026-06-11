import $ from 'jquery';

export function appendTypingIndicator() {
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
      </div>
    </div>`;

  this.$chatArea.append(html);
  this.scrollToBottom();
}

export function removeTypingIndicator() {
  $('#typing-indicator').remove();
}

export function scrollToBottom() {
  this.$chatArea.stop().animate({ scrollTop: this.$chatArea[0].scrollHeight }, 300);
}

export function appendBubble(rawText, isUser = false, source = 'ai', actions = []) {
  let text = rawText;
  let isTutorialMode = false;

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
    // RENDER UI TUTORIAL LANGKAH-LANGKAH
    formattedText = `<div class="mb-4 text-[14px] leading-relaxed text-ink">${this.escapeHtml(text.answer_text)}</div>`;
    formattedText += `<div class="space-y-4">`;

    // TAMBAHAN: Set Tracking untuk Mencegah Visual Duplikat
    let renderedElements = new Set();

    (text.steps || []).forEach(step => {
      formattedText += `
        <div class="border border-primary/20 bg-primary/5 rounded-xl p-3 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <div class="font-bold text-[13px] text-primary mb-1">Langkah ${step.step_number}: ${this.escapeHtml(step.title)}</div>
          <div class="text-[13px] text-body leading-relaxed">${this.escapeHtml(step.description)}</div>`;

      if (step.element_ref) {
        const refName = String(step.element_ref).toLowerCase();

        // Cek jika ID visual belum pernah dirender di tutorial ini
        if (!renderedElements.has(refName)) {
          const matchedEl = (this.contextData?.elements || []).find(e =>
            String(e.name).toLowerCase() === refName ||
            String(e.title).toLowerCase() === refName ||
            String(e.key).toLowerCase() === refName
          );

          if (matchedEl) {
            renderedElements.add(refName); // Kunci agar step berikutnya tidak render lagi

            const previewSrcdoc = this.buildElementPreviewSrcdoc
              ? this.buildElementPreviewSrcdoc(matchedEl)
              : `<!doctype html><html><body>${matchedEl.html || matchedEl.text}</body></html>`;

            formattedText += `
              <div class="mt-3 border border-hairline rounded-lg overflow-hidden">
                <div class="px-3 py-1.5 bg-slate-50 border-b border-hairline text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <i class="fa-solid fa-eye"></i> Visual: ${this.escapeHtml(matchedEl.name)}
                </div>
                <iframe class="w-full bg-white pointer-events-none border-0 block"
                        style="min-height: 80px;"
                        onload="try { this.style.height = this.contentWindow.document.documentElement.scrollHeight + 'px'; } catch(e){}"
                        sandbox="allow-scripts allow-same-origin"
                        referrerpolicy="no-referrer"
                        srcdoc="${this.escapeHtml(previewSrcdoc)}"></iframe>
              </div>
            `;
          }
        }
      }
      formattedText += `</div>`;
    });
    formattedText += `</div>`;
  } else {
    // RENDER TEXT BIASA (Materi / Element Explanation)
    formattedText = isUser ? this.escapeHtml(String(text)) : this.formatResponseText(String(text));
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
      if (act.type === 'system_feedback_ok' || act.type === 'system_feedback_ai') {
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
                sandbox=""
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
      actionsHtml = `
        <div class="alb-action-group mt-5 flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div class="alb-main-actions flex flex-wrap items-center gap-2">
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
        } else if (act.type === 'switch_context_and_ask') {
          // RENDER TOMBOL CROSS-CONTEXT
          const safePayload = encodeURIComponent(JSON.stringify(act.template || {}));
          const pendingMsg = this.escapeHtml(act.pending_message || '');
          actionsHtml += `<button type="button" class="btn-switch-context inline-flex items-center gap-1.5 bg-primary hover:bg-primary-active text-[13px] font-medium text-white px-4 py-2 rounded-full transition-colors shadow-sm" data-template="${safePayload}" data-message="${pendingMsg}"><i class="fa-solid fa-exchange-alt"></i> ${label}</button>`;

        } else if (act.type === 'ask_ai') {
          // RENDER TOMBOL TANYA AI DARI FAQ (SEKARANG AMAN)
          const safePayload = encodeURIComponent(JSON.stringify(act.payload || {}));
          actionsHtml += `<button type="button" class="btn-ask-ai-fallback inline-flex items-center gap-1.5 bg-primary hover:bg-primary-active text-[13px] font-medium text-white px-4 py-2 rounded-full transition-colors shadow-sm" data-payload="${safePayload}"><i class="fa-solid fa-sparkles"></i> ${label}</button>`;

        } else if (act.type === 'show_steps' || act.type === 'highlight_element') {
          actionsHtml += `<button type="button" class="inline-flex items-center gap-1.5 bg-surface-strong border border-hairline hover:bg-hairline-strong text-[13px] font-medium text-ink px-4 py-2 rounded-full transition-colors shadow-sm"><i class="fa-solid fa-bolt"></i> ${label}</button>`;
        }
      });

      actionsHtml += `
          </div>
          <div class="alb-feedback-actions flex flex-wrap items-center justify-end gap-2 md:ml-auto">
      `;

      feedbackActions.forEach(act => {
        const label = this.escapeHtml(act.label || 'Aksi');
        if (act.type === 'system_feedback_ok') {
          actionsHtml += `<button type="button" class="btn-system-feedback-ok inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 text-[13px] font-medium px-4 py-2 rounded-full transition-colors shadow-sm"><i class="fa-solid fa-check"></i> ${label}</button>`;
        } else if (act.type === 'system_feedback_ai') {
          const prompt = this.escapeHtml(act.prompt || 'Tolong jelaskan lebih detail dengan AI.');
          actionsHtml += `<button type="button" class="btn-system-feedback-ai inline-flex items-center gap-1.5 bg-sky-50 text-sky-700 border border-sky-100 hover:bg-sky-100 text-[13px] font-medium px-4 py-2 rounded-full transition-colors shadow-sm" data-prompt="${prompt}"><i class="fa-solid fa-sparkles"></i> ${label}</button>`;
        }
      });

      actionsHtml += `
          </div>
        </div>
      `;
    }
  }

  const avatarHtml = isUser
    ? `<div class="w-10 h-10 rounded-full bg-surface-strong border border-hairline text-muted flex items-center justify-center shrink-0 text-[15px]"><i class="fa-solid fa-user"></i></div>`
    : `<div class="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shrink-0 text-[15px] shadow-sm"><i class="fa-solid fa-robot"></i></div>`;

  const bubbleHtml = isUser
    ? `<div class="bg-surface-strong border border-hairline rounded-2xl rounded-tr-none p-4 md:p-5 max-w-[80%] text-[15px] text-ink shadow-[0_4px_16px_rgba(0,0,0,0.02)] leading-relaxed">${formattedText}</div>`
    : `<div class="bg-surface-card border border-hairline rounded-2xl rounded-tl-none p-4 md:p-5 max-w-[80%] text-[15px] text-body shadow-[0_4px_16px_rgba(0,0,0,0.04)] leading-relaxed">${badgeHtml}${formattedText}${visualHtml}${actionsHtml}${disclaimerHtml}</div>`;

  const html = isUser
    ? `<div class="flex items-start justify-end gap-3 md:gap-4">${bubbleHtml}${avatarHtml}</div>`
    : `<div class="alb-system-message-wrap"><div class="flex items-start gap-3 md:gap-4">${avatarHtml}${bubbleHtml}</div></div>`;

  this.$chatArea.append(html);
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
    { type: 'course', words: ['course', 'kursus', 'kelas', 'mata pelajaran', 'mata kuliah', 'detail kursus'], label: 'Buka halaman kelas/course' },
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



