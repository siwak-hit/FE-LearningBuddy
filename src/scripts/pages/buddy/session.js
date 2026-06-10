import { ApiService } from '../../fetch/api.js';
import Toast from '../../components/toast.js';

export async function loadExternalSessionContext(sessionId) {
  this.sessionId = sessionId;
  sessionStorage.setItem('alb_ai_session_' + this.projectKey, this.sessionId);

  try {
    const res = await ApiService.get(`/chat/session/${sessionId}`);
    if (res.status === 'success' && res.data?.session) {
      const session = res.data.session;
      const pageContext = this.safeParseJson(session.page_context || session.pageContext, {});

      const alias = session.student_alias || pageContext.session_meta?.display_name;
      if (alias) {
        sessionStorage.setItem('alb_student_name', alias);
      }

      const parsedElements = Array.isArray(pageContext.elements) ? pageContext.elements : [];

      // PERBAIKAN: Pastikan kita menyimpan state yang konsisten
      this.contextData = {
        ...pageContext,
        sourceUrl: session.source_url || pageContext.sourceUrl || pageContext.url || '',
        elements: parsedElements
      };

      // PERBAIKAN: Selalu sinkronkan DB truth ke local storage sebagai fallback
      sessionStorage.setItem('alb_external_context', JSON.stringify(this.contextData));

      const displayTitle = pageContext.heading || pageContext.title || 'Halaman VClass';

      this.$elTitle.text(displayTitle);
      this.$elWelcome.text(displayTitle);

      if (session.source_url) {
        this.$btnBack.html('<i class="fa-solid fa-arrow-left mr-2"></i> Kembali ke VClass');
        this.$btnBack.off('click').on('click', () => {
          if (this.navigateSourceTab) this.navigateSourceTab(session.source_url, '', {});
          else window.open(session.source_url, '_blank');
        });
        this.$btnConfirmLeave.off('click').on('click', () => {
          if (this.navigateSourceTab) this.navigateSourceTab(session.source_url, '', {});
          else window.open(session.source_url, '_blank');
        });
      }

      let matchedTemplate = false;
      if (this.contextData.elements.length === 0 && typeof this.autoMatchTemplateFromContext === 'function') {
        matchedTemplate = await this.autoMatchTemplateFromContext();
      }

      if (!matchedTemplate) {
        this.renderElementList();
      }

      await this.loadSessionState();
      await this.loadChatHistory();
    }
  } catch (e) {
    console.error('Gagal load session context', e);
    this.$elTitle.text('Konteks tidak tersedia');
    this.renderElementList();
  }
}

export async function loadSessionState() {
  try {
    const res = await ApiService.get(`/chat/state/${this.sessionId}`);
    if (res.status === 'success' && res.data) {
      const { ai_usage, safety_state } = res.data;
      if (ai_usage) this.updateAiUsageUI(ai_usage);
      if (safety_state?.locked) this.handleLockdown(true);
    }
  } catch (e) {
    console.error('Gagal memuat session state', e);
  }
}

export async function loadChatHistory() {
  try {
    const res = await ApiService.get(`/chat/history/${this.sessionId}`);
    if (res.status === 'success' && res.data && res.data.length > 0) {
      this.$chatArea.empty();
      res.data.forEach(msg => {
        const isUser = msg.role === 'user';
        const source = msg.context_used?.response_source || 'system';
        const actions = msg.context_used?.actions || [];
        this.appendBubble(msg.message, isUser, source, actions);
      });
      this.scrollToBottom();
    }
  } catch (e) {
    console.error('Gagal memuat history', e);
  }
}

export async function createOrLoadSession() {
  if (this.urlSessionId) {
    this.sessionId = this.urlSessionId;
    sessionStorage.setItem('alb_ai_session_' + this.projectKey, this.sessionId);
    return;
  }
  let existingSession = sessionStorage.getItem('alb_ai_session_' + this.projectKey);
  if (existingSession) {
    this.sessionId = existingSession;
    return;
  }
  try {
    const payload = {
      projectKey: this.projectKey,
      sourceUrl: this.contextData?.sourceUrl || window.location.href,
      // PERBAIKAN KRUSIAL: Kirim SELURUH contextData, jangan hanya { title, summary }
      // agar backend menerima elements_json dan metadatanya sejak sesi awal dibuat.
      pageContext: this.contextData || { title: document.title }
    };
    if (this.mode === 'external') payload.mode = 'external';

    const res = await ApiService.post('/chat/session', payload);
    if (res.status === 'success') {
      this.sessionId = res.data.session.id;
      sessionStorage.setItem('alb_ai_session_' + this.projectKey, this.sessionId);
    }
  } catch (e) {
    console.error('Gagal inisiasi sesi chat', e);
    Toast.show('Gagal terhubung ke server', 'error');
  }
}

export function loadSessionData() {
  try {
    const rawContext = sessionStorage.getItem('alb_external_context');
    if (rawContext) {
      this.contextData = JSON.parse(rawContext);
      this.$elTitle.text(this.contextData.title || 'Halaman VClass');
      this.$elWelcome.text(this.contextData.title || 'Halaman VClass');
    }
    const rawConfig = sessionStorage.getItem('alb_external_config');
    if (rawConfig) {
      const config = JSON.parse(rawConfig);
      let theme = config.theme;
      if (typeof theme === 'string') theme = JSON.parse(theme);
      this.$chatTitle.text(theme?.title || 'AI Learning Buddy');
      this.$chatSubtitle.text(theme?.subtitle || 'Tanya materi atau panduan VClass');
    }
  } catch (e) {
    console.error('Gagal parse session data', e);
  }
}
