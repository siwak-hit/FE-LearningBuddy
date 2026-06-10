import React, { useEffect, useState } from 'react';
import SourcePdfHighlighter from './source/SourcePdfHighlighter'; // Sesuaikan path-nya ke file JSX kamu

export default function PdfEmbedPage() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // 1. Ambil parameter dari URL (dikirim oleh Widget)
    const params = new URLSearchParams(window.location.search);
    const pdfUrl = params.get('url');
    const page = params.get('page') || 1;
    const query = params.get('q') || '';

    // 2. Jika ada URL PDF, trigger event yang sama persis seperti di source-viewer.js
    if (pdfUrl) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('load-react-pdf', {
          detail: {
            url: decodeURIComponent(pdfUrl),
            pageNumber: Number(page),
            keywords: query.split(' ').filter(Boolean) // Pecah kalimat jadi array kata kunci
          }
        }));
      }, 300); // Beri sedikit jeda agar DOM siap
    }

    setIsReady(true);
  }, []);

  if (!isReady) return <div style={{ padding: 20 }}>Menyiapkan penampil PDF...</div>;

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
      {/* Panggil komponen highlighter yang sudah jadi */}
      <SourcePdfHighlighter />
    </div>
  );
}
