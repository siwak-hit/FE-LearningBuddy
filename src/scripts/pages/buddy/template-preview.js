// ============================================================
// template-preview.js — Util & builder preview template/elemen (srcdoc iframe,
// sanitasi HTML, scoring template vs konteks). [v0.9.7] Diekstrak dari dom-ui.js.
// Semua fungsi adalah method BuddyPage (pakai this.activeTemplate dsb).
// ============================================================
import $ from 'jquery';

export function parseTemplateJson(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed || fallback;
  } catch (e) {
    console.warn('[BuddyPage] Gagal parse data template:', e);
    return fallback;
  }
}

export function normalizeMatchText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/log\s*in/g, 'login')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function unwrapTemplateResponse(payload) {
  if (!payload) return null;

  // Support beberapa bentuk response backend:
  // 1) res.data = template
  // 2) res.data = { template }
  // 3) res.data = { matchedTemplate }
  // 4) res.data = { data: template }
  return payload.template || payload.matchedTemplate || payload.pageTemplate || payload.data || payload;
}

export function extractTemplateList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.templates)) return payload.templates;
  if (Array.isArray(payload.pageTemplates)) return payload.pageTemplates;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

export function normalizeTemplatePayload(template = {}) {
  const unwrapped = this.unwrapTemplateResponse(template) || {};
  const normalized = { ...unwrapped };
  normalized.elements_json = this.parseTemplateJson(unwrapped.elements_json, []);
  normalized.tutorial_steps_json = this.parseTemplateJson(unwrapped.tutorial_steps_json, []);
  normalized.question_suggestions_json = this.parseTemplateJson(unwrapped.question_suggestions_json, []);
  return normalized;
}

export function getPreviewApiBase() {
  const safeTrim = (value) => String(value || '').trim().replace(/\/$/, '');

  // Urutan ini sengaja longgar karena project Astro/Vite tiap environment bisa beda.
  const candidates = [
    window.__ALB_API_BASE__,
    window.__API_BASE__,
    window.API_BASE,
    window.ALB_API_BASE,
    typeof import.meta !== 'undefined' ? import.meta.env?.PUBLIC_API_BASE : '',
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_BASE : '',
    typeof import.meta !== 'undefined' ? import.meta.env?.PUBLIC_API_URL : '',
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : ''
  ].map(safeTrim).filter(Boolean);

  return candidates[0] || '';
}

export function normalizeExternalAssetUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `${window.location.protocol}${raw}`;
  try {
    return new URL(raw, window.location.href).href;
  } catch (_) {
    return raw;
  }
}

export function buildPreviewProxyUrl(url = '') {
  const normalizedUrl = this.normalizeExternalAssetUrl(url);
  if (!normalizedUrl) return '';

  const apiBase = this.getPreviewApiBase();

  // Jangan load asset cross-origin langsung. Kalau API base/proxy tidak tersedia,
  // kosongkan saja agar iframe tetap HTML/CSS lokal dan tidak kena CORS.
  if (!apiBase) return '';

  return `${apiBase}/page-templates/proxy-asset?url=${encodeURIComponent(normalizedUrl)}`;
}

export function getTemplateStyles(template = this.activeTemplate) {
  const html = template?.html_preview || '';
  if (!html) return '';

  const styles = [];

  // 1) Ambil stylesheet eksternal asli, tetapi href diarahkan ke proxy BE.
  // Karena stylesheet ini diletakkan di iframe srcdoc, CSS tidak akan meluber ke AI Workspace.
  const linkRegex = /<link\b(?=[^>]*rel=["']?stylesheet["']?)[^>]*>/gi;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const tag = linkMatch[0];
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i) || tag.match(/href=([^\s>]+)/i);
    const href = hrefMatch?.[1];
    const proxiedHref = this.buildPreviewProxyUrl(href);
    if (proxiedHref) {
      styles.push(`<link rel="stylesheet" href="${this.escapeHtml(proxiedHref)}">`);
    }
  }

  // 2) Ambil inline style asli. Ini aman karena masuk iframe, bukan DOM utama.
  const styleRegex = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
  let styleMatch;
  while ((styleMatch = styleRegex.exec(html)) !== null) {
    const cleanedStyle = String(styleMatch[0] || '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .trim();
    if (cleanedStyle) styles.push(cleanedStyle);
  }

  return styles.join('\n');
}

export function sanitizePreviewHtml(html = '') {
  return String(html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<link\b(?=[^>]*rel=["']?stylesheet["']?)[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, '')
    .replace(/@font-face\s*{[\s\S]*?}/gi, '')
    .replace(/url\(["']?[^)"']*font\.php[^)]*\)/gi, 'none')
    .trim();
}

export function stripTemplateStylesFromHtml(html = '') {
  return this.sanitizePreviewHtml(
    String(html || '')
      .replace(/<!--\s*styles:start\s*-->[\s\S]*?<!--\s*styles:end\s*-->/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  );
}

export function getPreviewBaseCss() {
  return `
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100%;
      background: transparent;
      /* Fallback font jika CSS web asli gagal dimuat */
      font-family: system-ui, -apple-system, sans-serif;
    }

    /* Cegah interaksi di dalam preview */
    *, *::before, *::after {
      pointer-events: none !important;
    }

    .buddy-preview-root {
      width: 100%;
      padding: 10px;
      overflow: hidden;
      box-sizing: border-box;
    }

    /* * FALLBACK STRUKTUR:
     * Hanya memberi dimensi dasar pada form.
     * Dilarang memberi warna dominan agar tidak menimpa CSS web asli.
     */
    input, select, textarea {
      width: 100%;
      min-height: 36px;
      border: 1px solid #d6d3d1;
      border-radius: 6px;
      margin-top: 4px;
      box-sizing: border-box;
    }

    button, .btn {
      min-height: 36px;
      border-radius: 6px;
    }

    img, svg {
      max-width: 100%;
      height: auto;
    }

    /* MATIKAN LOADING SCREEN DARI WEB ASLI */
    .preloader, .loader, #loader, .spinner, [id*="loading"] {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
    }
  `;
}

export function buildElementPreviewSrcdoc(matchedEl = {}, template = this.activeTemplate) {
  const rawHtml = matchedEl.html || matchedEl.text || '';
  const safeHtml = this.stripTemplateStylesFromHtml
    ? this.stripTemplateStylesFromHtml(rawHtml)
    : String(rawHtml || '').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  const templateStyles = (matchedEl.template_html_preview && this.getTemplateStyles ? this.getTemplateStyles({ html_preview: matchedEl.template_html_preview }) : '')
    || (template?.html_preview && this.getTemplateStyles ? this.getTemplateStyles(template) : '')
    || '';

  const fallbackStyles = '';

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base target="_blank">

  ${templateStyles || fallbackStyles}

  <style>
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      overflow: hidden !important;
      min-height: 0 !important;
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    .buddy-preview-root a,
    .buddy-preview-root button,
    .buddy-preview-root input,
    .buddy-preview-root select,
    .buddy-preview-root textarea {
      pointer-events: auto !important;
    }

    .buddy-preview-root {
      width: 100%;
      max-width: 100%;
      padding: 10px;
      box-sizing: border-box;
      overflow: hidden;
      background: #fff;
    }

    .buddy-preview-root form,
    .buddy-preview-root .login-card,
    .buddy-preview-root .card,
    .buddy-preview-root article,
    .buddy-preview-root section {
      max-width: 100% !important;
    }

    .buddy-preview-root input,
    .buddy-preview-root select,
    .buddy-preview-root textarea {
      max-width: 100% !important;
    }

    .preloader, .loader, #loader, [id*="loading"] {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
    }
  </style>
</head>
<body>
  <div class="buddy-preview-root">
    ${safeHtml}
  </div>
</body>
</html>`;
}

export function buildTemplatePreviewSrcdoc(template = this.activeTemplate) {
  const htmlPreview = this.sanitizePreviewHtml(template?.html_preview || '');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base target="_blank">
  <style>
    ${this.getPreviewBaseCss()}
    body { transform: scale(0.60); transform-origin: top left; width: 166%; background: #fff; }
  </style>
</head>
<body>
  ${htmlPreview}
</body>
</html>`;
}

export function scoreTemplateAgainstContext(template = {}, context = {}) {
  const title = this.normalizeMatchText(context.title || '');
  const heading = this.normalizeMatchText(context.heading || '');
  const url = this.normalizeMatchText(context.sourceUrl || context.url || '');
  const summary = this.normalizeMatchText(context.summary || '');
  const haystack = [title, heading, url, summary].filter(Boolean).join(' ');

  const matchTitle = this.normalizeMatchText(template.match_title_contains || '');
  const matchHeading = this.normalizeMatchText(template.match_heading_contains || '');
  const matchUrl = this.normalizeMatchText(template.match_url_contains || '');
  const pageType = this.normalizeMatchText(template.page_type || '');
  const templateName = this.normalizeMatchText(template.template_name || '');

  let score = 0;

  // Pencocokan KETAT: Title & Heading
  if (matchTitle && title.includes(matchTitle)) score += 100;
  if (matchHeading && heading.includes(matchHeading)) score += 90;

  // URL diturunkan drastis skornya agar tidak memicu false positive
  if (matchUrl && url.includes(matchUrl)) score += 30;

  if (pageType && haystack.includes(pageType)) score += 20;
  if (templateName && haystack.includes(templateName)) score += 10;

  const contextHasLogin = title.includes('login') || heading.includes('login') || url.includes('login') || summary.includes('login');
  const templateIsLogin = pageType === 'login' || matchTitle === 'login' || matchHeading === 'login' || matchUrl === 'login' || templateName.includes('login');

  // KILLER SWITCH: Jika template adalah Login, tapi judul halamannya BUKAN login,
  // hancurkan skor menjadi 0. Ini memastikan form login tidak akan nyasar ke form lain.
  if (templateIsLogin && !title.includes('login') && !heading.includes('login')) {
      return 0;
  }

  if (contextHasLogin && templateIsLogin) {
    score += 150;
  }

  return score;
}
