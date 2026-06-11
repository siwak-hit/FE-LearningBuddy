import React, { useEffect, useRef, useState } from 'react';
import { PdfLoader, PdfHighlighter } from 'react-pdf-highlighter-extended';
import * as pdfjsLib from 'pdfjs-dist';

const PDFJS_VERSION = '4.10.38';
const PDF_WORKER_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildKeywords(keywords = []) {
  return [...new Set(
    keywords
      .map((item) => normalizeText(item))
      .filter((item) => item.length > 2)
      .sort((a, b) => b.length - a.length)
  )].slice(0, 8);
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createHighlightOverlayFromRange(range, pageEl) {
  const pageRect = pageEl.getBoundingClientRect();
  const rects = Array.from(range.getClientRects());

  rects.forEach((rect) => {
    // Skip rect yang aneh / terlalu besar.
    if (!rect.width || !rect.height) return;
    if (rect.width > pageRect.width * 0.75) return;
    if (rect.height > 40) return;

    const highlight = document.createElement('div');
    highlight.setAttribute('data-alb-pdf-highlight', 'true');

    highlight.style.position = 'absolute';
    highlight.style.left = `${rect.left - pageRect.left}px`;
    highlight.style.top = `${rect.top - pageRect.top}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
    highlight.style.backgroundColor = 'rgba(250, 204, 21, 0.45)';
    highlight.style.borderRadius = '3px';
    highlight.style.pointerEvents = 'none';
    highlight.style.zIndex = '3';

    pageEl.appendChild(highlight);
  });
}

function clearOldHighlights() {
  document.querySelectorAll('[data-alb-pdf-highlight="true"]').forEach((node) => {
    node.remove();
  });

  document.querySelectorAll('[data-alb-pdf-highlight-span="true"]').forEach((node) => {
    node.style.backgroundColor = '';
    node.style.borderRadius = '';
    node.style.padding = '';
    node.style.boxShadow = '';
    node.style.position = '';
    node.style.zIndex = '';
    node.removeAttribute('data-alb-pdf-highlight-span');
  });
}

function shouldHighlightSpan(spanText = '', safeKeywords = []) {
  const normalizedSpanText = normalizeText(spanText);
  if (!normalizedSpanText) return false;

  return safeKeywords.some((keyword) => {
    // Kalau keyword pendek/satu kata
    if (!keyword.includes(' ')) {
      return normalizedSpanText.includes(keyword);
    }
    // Kalau keyword phrase, pecah jadi token
    const tokens = keyword.split(/\s+/);
    return tokens.some((token) => normalizedSpanText.includes(token));
  });
}

function highlightKeywordsInTextLayer(keywords = [], pageNumber = 1) {
  const targetPage = document.querySelector(`[data-page-number="${pageNumber}"]`);
  if (!targetPage) return false;

  const textLayer = targetPage.querySelector('.textLayer');
  if (!textLayer) return false;

  const spans = textLayer.querySelectorAll('span');
  if (spans.length === 0) return false;

  const safeKeywords = buildKeywords(keywords);
  let firstHighlightedNode = null;
  let highlightedCount = 0;

  console.log('[SourcePdfHighlighter] Highlight check:', {
    pageNumber,
    safeKeywords,
    spanCount: spans.length
  });

  if (safeKeywords.length > 0) {
    spans.forEach((span) => {
      const rawText = span.textContent || '';
      const normalizedSpanText = normalizeText(rawText);
      if (!normalizedSpanText) return;

      safeKeywords.forEach((keyword) => {
        const normalizedKeyword = normalizeText(keyword);
        if (!normalizedKeyword) return;

        // Untuk frasa seperti "media sosial", wajib cocok sebagai frasa.
        // Untuk keyword satu kata, cocokkan kata itu saja.
        const regex = new RegExp(escapeRegExp(normalizedKeyword), 'i');

        if (!regex.test(normalizedSpanText)) return;

        // Cari posisi match di teks asli secara sederhana.
        const lowerRaw = rawText.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        const index = lowerRaw.indexOf(lowerKeyword);

        // Kalau frasa tidak ketemu di rawText karena normalisasi,
        // jangan highlight seluruh span. Ini mencegah blok gede.
        if (index < 0) return;

        try {
          const range = document.createRange();
          range.setStart(span.firstChild, index);
          range.setEnd(span.firstChild, index + keyword.length);

          createHighlightOverlayFromRange(range, targetPage);

          highlightedCount += 1;
          if (!firstHighlightedNode) firstHighlightedNode = span;

          range.detach?.();
        } catch (err) {
          // Jangan fallback highlight span penuh, karena itu penyebab blok kuning besar.
          console.warn('[SourcePdfHighlighter] Gagal membuat range highlight:', err);
        }
      });
    });
  }

  console.log('[SourcePdfHighlighter] Highlight result:', {
    pageNumber,
    highlighted: highlightedCount
  });

  if (firstHighlightedNode) {
    firstHighlightedNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    targetPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return true;
}

export default function SourcePdfHighlighter() {
  const [pdfConfig, setPdfConfig] = useState(null);

  const highlighterUtilsRef = useRef(null);
  const observerRef = useRef(null);
  const retryTimerRef = useRef(null);

  useEffect(() => {
    const handleLoadPdf = (event) => {
      const detail = event.detail || {};
      clearOldHighlights();
      setPdfConfig(null);

      setTimeout(() => {
        setPdfConfig({
          url: detail.url,
          pageNumber: Number(detail.pageNumber || 1),
          keywords: Array.isArray(detail.keywords) ? detail.keywords : []
        });
      }, 50);
    };

    const handleClearPdf = () => {
      setPdfConfig(null);
      clearOldHighlights();
    };

    window.addEventListener('load-react-pdf', handleLoadPdf);
    window.addEventListener('clear-react-pdf', handleClearPdf);

    return () => {
      window.removeEventListener('load-react-pdf', handleLoadPdf);
      window.removeEventListener('clear-react-pdf', handleClearPdf);
    };
  }, []);

  useEffect(() => {
    if (!pdfConfig?.url) return;

    const cleanup = () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (retryTimerRef.current) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    cleanup();
    clearOldHighlights();

    let attempts = 0;
    const maxAttempts = 30; // Maksimal coba mencari teks selama ~12 detik

    const run = () => {
      attempts += 1;

      // highlightKeywordsInTextLayer akan mereturn TRUE jika teks sudah render
      const isRendered = highlightKeywordsInTextLayer(pdfConfig.keywords, pdfConfig.pageNumber);

      if (isRendered) {
        cleanup(); // Sukses! Hentikan pencarian
      } else if (attempts >= maxAttempts) {
        cleanup(); // Nyerah kalau internet user terlalu lemot (lebih dari 12 detik)
      }
    };

    // Cek setiap 400ms apakah teks PDF sudah muncul
    retryTimerRef.current = setInterval(run, 400);

    // Pantau juga perubahan DOM kalau-kalau render terjadi di luar interval
    observerRef.current = new MutationObserver(() => {
      run();
    });

    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true
    });

    return cleanup;
  }, [pdfConfig]);

  if (!pdfConfig?.url) {
    return null;
  }

  return (
    <div style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }}>
      <PdfLoader
        key={`${pdfConfig.url}-${pdfConfig.pageNumber}-${pdfConfig.keywords.join('|')}`}
        document={pdfConfig.url}
        workerSrc={PDF_WORKER_URL}
        onError={(error) => {
          console.error('[SourcePdfHighlighter] Gagal load PDF:', error);
        }}
      >
        {(pdfDocument) => (
          <PdfHighlighter
            pdfDocument={pdfDocument}
            enableAreaSelection={(event) => event.altKey}
            highlights={[]}
            utilsRef={(utils) => {
              highlighterUtilsRef.current = utils;
            }}
          >
            {() => null}
          </PdfHighlighter>
        )}
      </PdfLoader>
    </div>
  );
}
