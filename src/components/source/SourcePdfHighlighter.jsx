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

function clearOldHighlights() {
  document.querySelectorAll('[data-alb-pdf-highlight="true"]').forEach((node) => {
    node.style.backgroundColor = '';
    node.style.borderRadius = '';
    node.style.padding = '';
    node.removeAttribute('data-alb-pdf-highlight');
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
  // 1. Pastikan halamannya ada
  const targetPage = document.querySelector(`[data-page-number="${pageNumber}"]`);
  if (!targetPage) return false; // Halaman belum render, paksa retry!

  // 2. Pastikan layer teksnya ada
  const textLayer = targetPage.querySelector('.textLayer');
  if (!textLayer) return false; // Layer teks belum render, paksa retry!

  // 3. Pastikan teks sudah disuntikkan ke dalam layer
  const spans = textLayer.querySelectorAll('span');
  if (spans.length === 0) return false; // Teks belum disuntik, paksa retry!

  // JIKA SAMPAI DI SINI, TEKS PDF SUDAH RENDER 100%
  const safeKeywords = buildKeywords(keywords);
  let firstHighlightedNode = null;

  if (safeKeywords.length > 0) {
    spans.forEach((span) => {
      if (shouldHighlightSpan(span.textContent || '', safeKeywords)) {
        // Terapkan highlight kuning stabilo
        span.style.backgroundColor = 'rgba(250, 204, 21, 0.55)';
        span.style.borderRadius = '3px';
        span.setAttribute('data-alb-pdf-highlight', 'true');

        if (!firstHighlightedNode) {
          firstHighlightedNode = span;
        }
      }
    });
  }

  // Scroll otomatis ke teks yang di-highlight, atau minimal ke ujung atas halaman
  if (firstHighlightedNode) {
    firstHighlightedNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    targetPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return true; // Beri tahu sistem bahwa highlight berhasil, hentikan retry.
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
