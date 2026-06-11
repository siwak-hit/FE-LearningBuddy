export function getCssSelector(el) {
  if (!el || !el.tagName) return '';
  if (el.id) return `#${CSS.escape(el.id)}`;

  const parts = [];
  let current = el;

  while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
    let selector = current.tagName.toLowerCase();

    if (current.className && typeof current.className === 'string') {
      const safeClasses = current.className
        .split(/\s+/)
        .filter(Boolean)
        .filter((cls) => !cls.includes(':'))
        .slice(0, 2);

      if (safeClasses.length) {
        selector += `.${safeClasses.map((cls) => CSS.escape(cls)).join('.')}`;
      }
    }

    const parent = current.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter(
        (child) => child.tagName === current.tagName
      );

      if (sameTagSiblings.length > 1) {
        selector += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
    }

    parts.unshift(selector);
    current = parent;
  }
  return parts.join(' > ');
}

export function collectPageElements() {
  const MAX_ELEMENTS = 12;

  const getCleanText = (el) => {
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const cloneElementWithInlineStyles = (element) => {
    const clone = element.cloneNode(true);

    const applyStyles = (sourceNode, targetNode) => {
      if (!(sourceNode instanceof Element) || !(targetNode instanceof Element)) return;

      const computed = window.getComputedStyle(sourceNode);
      const importantStyles = [
        'display', 'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
        'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'border', 'border-width', 'border-style', 'border-color', 'border-radius',
        'background', 'background-color', 'color', 'font-family', 'font-size', 'font-weight',
        'line-height', 'letter-spacing', 'text-align', 'box-shadow', 'gap', 'align-items',
        'justify-content', 'grid-template-columns', 'flex-direction', 'overflow'
      ];

      importantStyles.forEach((prop) => {
        const value = computed.getPropertyValue(prop);
        if (value) targetNode.style.setProperty(prop, value);
      });

      targetNode.removeAttribute('id');
      targetNode.removeAttribute('onclick');
      targetNode.removeAttribute('href');
      targetNode.removeAttribute('srcset');

      Array.from(sourceNode.children).forEach((child, index) => {
        applyStyles(child, targetNode.children[index]);
      });
    };

    applyStyles(element, clone);
    clone.querySelectorAll('script, style, iframe, canvas').forEach((item) => item.remove());

    const buddyKey = element.getAttribute('data-buddy-el');
    if (buddyKey === 'navbar') {
      const brandSpan = clone.querySelector('span');
      if (brandSpan) brandSpan.remove();

      clone.querySelectorAll('a').forEach((link) => {
        const text = (link.innerText || link.textContent || '').trim().toLowerCase();
        if (text.includes('my courses')) link.remove();
      });

      clone.style.display = 'flex';
      clone.style.alignItems = 'center';
      clone.style.justifyContent = 'space-between';
      clone.style.width = '100%';
      clone.style.height = '64px';
      clone.style.padding = '0 28px';
      clone.style.boxSizing = 'border-box';
      clone.style.overflow = 'hidden';

      const brand = clone.children[0];
      if (brand) {
        brand.style.whiteSpace = 'nowrap';
        brand.style.flexShrink = '0';
        brand.style.margin = '0';
      }

      const rightMenu = clone.children[1];
      if (rightMenu) {
        rightMenu.style.display = 'flex';
        rightMenu.style.alignItems = 'center';
        rightMenu.style.justifyContent = 'flex-end';
        rightMenu.style.gap = '24px';
        rightMenu.style.flexShrink = '0';
        rightMenu.style.margin = '0';
      }
    }

    return clone.outerHTML;
  };

  const getElementTitle = (el, fallback = 'Elemen') => {
    const dataBuddy = el.getAttribute('data-buddy-el');
    if (dataBuddy) return dataBuddy;

    const heading = el.querySelector?.('h1, h2, h3, h4, h5, h6');
    if (heading) {
      const headingText = getCleanText(heading);
      if (headingText) return headingText;
    }

    const aria = el.getAttribute?.('aria-label');
    if (aria) return aria.trim();

    const title = el.getAttribute?.('title');
    if (title) return title.trim();

    const text = getCleanText(el);
    if (text) return text.slice(0, 42);

    return fallback;
  };

  const slugify = (value) => {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/gi, ' ').trim().split(' ').slice(0, 3).join('');
  };

  const getElementType = (el) => {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const className = String(el.className || '').toLowerCase();
    const dataBuddy = String(el.getAttribute('data-buddy-el') || '').toLowerCase();

    if (tag === 'button' || role === 'button') return '@Tombol';
    if (tag === 'a' || role === 'link') return '@Tautan';
    if (tag === 'form') return '@Formulir';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return '@KolomInput';

    if (dataBuddy.includes('navbar') || tag === 'nav' || tag === 'header') return '@Navigasi';
    if (dataBuddy.includes('hero')) return '@Header';
    if (dataBuddy.includes('materi')) return '@Materi';
    if (className.includes('upload') || className.includes('tugas')) return '@Tugas';

    return '@Elemen';
  };

  const buildElementData = (el, index) => {
    const dataBuddy = el.getAttribute('data-buddy-el');
    const title = getElementTitle(el, `Elemen ${index + 1}`);
    const cleanText = getCleanText(el);
    const type = getElementType(el);

    const name = dataBuddy ? `@${dataBuddy}` : `@${slugify(title) || `element${index + 1}`}`;
    const rect = el.getBoundingClientRect();

    return {
      key: dataBuddy || `element-${index + 1}`,
      name,
      title,
      type,
      text: cleanText ? cleanText.slice(0, 180) : `${type} dari halaman aktif.`,
      selector: dataBuddy ? `[data-buddy-el="${dataBuddy}"]` : this.getCssSelector(el),
      rect: { width: Math.round(rect.width), height: Math.round(rect.height) },
      html: cloneElementWithInlineStyles(el)
    };
  };

  const markedElements = Array.from(document.querySelectorAll('[data-buddy-el]'))
    .filter((el) => {
      if (el.closest('#view-workspace')) return false;
      if (el.closest('#open-ai-page')) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .map((el, index) => buildElementData(el, index));

  if (markedElements.length > 0) return markedElements.slice(0, MAX_ELEMENTS);

  const candidateSelectors = ['nav', 'header', 'main h1', 'main h2', 'main h3', 'section', 'article', '[class*="card"]', '[class*="course"]', '[class*="materi"]', '[class*="assignment"]', '[class*="tugas"]', '[class*="upload"]', 'form'];
  const ignoredSelectors = ['script', 'style', 'noscript', 'canvas', 'iframe', '[aria-hidden="true"]', '.sr-only', '#open-ai-page', '#view-workspace', '#cooldown-overlay', '#context-sidebar', '#context-backdrop'];

  const isIgnored = (el) => ignoredSelectors.some((selector) => {
    try { return el.matches(selector) || el.closest(selector); } catch { return false; }
  });

  const scoreElement = (el) => {
    const tag = el.tagName.toLowerCase();
    const text = getCleanText(el);
    let score = 0;
    if (tag === 'form') score += 120;
    if (tag === 'button' || tag === 'input') score += 100;
    if (tag === 'a') score += 90;
    if (tag === 'nav') score += 100;
    if (tag === 'header') score += 90;
    if (tag === 'section') score += 70;
    if (text.length > 20) score += 20;
    if (text.length > 300) score -= 25;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 20) score -= 50;
    return score;
  };

  const candidates = [];
  candidateSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      if (isIgnored(el)) return;
      const rect = el.getBoundingClientRect();
      const text = getCleanText(el);
      if (rect.width <= 0 || rect.height <= 0) return;
      if (!text && !el.querySelector('input, button, a, img, i, svg')) return;
      candidates.push(el);
    });
  });

  return Array.from(new Set(candidates))
    .map((el, index) => ({ el, index, score: scoreElement(el) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ELEMENTS)
    .map(({ el, index }) => buildElementData(el, index));
}

export function collectUserTasks() {
  const tasks = [];

  // Mencari elemen timeline/kalender Moodle umum (bisa disesuaikan dengan struktur tema Moodle 167)
  const eventNodes = document.querySelectorAll('.timeline-event-list-item, .event, .activity.assignment');

  eventNodes.forEach(node => {
    const titleNode = node.querySelector('.text-truncate, .instancename, .event-name');
    const dateNode = node.querySelector('.text-right, .date, .time');

    if (titleNode && dateNode) {
      const title = (titleNode.innerText || titleNode.textContent).trim();
      const dueDate = (dateNode.innerText || dateNode.textContent).trim();

      // Deteksi tipe
      let type = 'activity';
      if (title.toLowerCase().includes('quiz') || title.toLowerCase().includes('kuis')) type = 'quiz';
      if (title.toLowerCase().includes('tugas') || title.toLowerCase().includes('assignment')) type = 'assignment';

      // Deteksi status (contoh logika: cek apakah ada badge 'submitted' atau 'selesai')
      const statusNode = node.querySelector('.badge, .status');
      const statusText = statusNode ? (statusNode.innerText || statusNode.textContent).toLowerCase() : '';
      const status = statusText.includes('submitted') || statusText.includes('selesai') ? 'completed' : 'not_submitted';

      tasks.push({
        title,
        type,
        dueDate,
        status,
        courseName: document.title // Kasar, tapi aman untuk fallback
      });
    }
  });

  return tasks;
}
