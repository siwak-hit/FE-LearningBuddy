import $ from 'jquery';

const STOPWORDS = ['apa', 'itu', 'sih', 'dari', 'yang', 'dan', 'di', 'ke', 'bagaimana', 'cara', 'adalah', 'sebagai', 'untuk', 'dengan', 'aja', 'ini', 'pada', 'dalam', 'kenapa', 'mengapa', 'kapan', 'siapa', 'atau', 'akan', 'bisa', 'ada', 'saja', 'tersebut', 'serta', 'dong', 'nih', 'ya'];

const normalizeText = (text = '') => String(text).toLowerCase().replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const unique = (items = []) => [...new Set(items.filter(Boolean))];

const extractHighlightKeywords = (query = '', chunkText = '') => {
  const queryTerms = normalizeText(query).split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.includes(w));
  const normalizedChunk = normalizeText(chunkText);
  if (!queryTerms.length || !normalizedChunk) return [];

  const highlights = [];

  // Cek frasa beruntun
  for (let i = 0; i < queryTerms.length; i++) {
    if (queryTerms[i + 1]) {
      const phrase = `${queryTerms[i]} ${queryTerms[i + 1]}`;
      if (normalizedChunk.includes(phrase)) highlights.push(phrase);
    }
  }

  const isDefinition = query.includes('apa itu') || query.includes('pengertian') || query.includes('jenis');

  queryTerms.forEach(term => {
    if (normalizedChunk.includes(term)) highlights.push(term);
    if (isDefinition) {
      if (normalizedChunk.includes(`pengertian ${term}`)) highlights.push(`pengertian ${term}`);
      if (normalizedChunk.includes(`jenis ${term}`)) highlights.push(`jenis ${term}`);
    }
  });

  return unique(highlights).sort((a, b) => b.length - a.length).slice(0, 6);
};

export const SourceViewer = {
  init() {
    $(document).off('click', '.btn-open-source-viewer').on('click', '.btn-open-source-viewer', function (e) {
      e.preventDefault();
      const sourceAttr = $(this).attr('data-source');
      if (sourceAttr) {
        try { SourceViewer.open(JSON.parse(decodeURIComponent(sourceAttr))); }
        catch (err) { console.error('Gagal memproses data source PDF'); }
      }
    });

    $(document).off('click', '#btn-close-source-viewer, #source-viewer-overlay').on('click', '#btn-close-source-viewer, #source-viewer-overlay', () => {
      SourceViewer.close();
    });

    $(document).off('click', '#btn-toggle-quote').on('click', '#btn-toggle-quote', function () {
      $('#source-viewer-quote').toggleClass('hidden');
      $(this).text($('#source-viewer-quote').hasClass('hidden') ? 'Tampilkan' : 'Sembunyikan');
    });
  },

  open(data) {
    if (!data) return;

    const fileUrl = data.file_url;
    const isPdf = fileUrl && (data.file_type === 'pdf' || fileUrl.endsWith('.pdf'));
    const pageNumber = parseInt(data.page_number || 1, 10);
    const keywords = extractHighlightKeywords(data.query, data.highlight_text || '');

    // 1. Set UI Text
    $('#source-viewer-title').text(data.title || 'Dokumen Rujukan');
    $('#source-viewer-page').text(`Halaman ${pageNumber}`);

    // 2. Set Fallback Link
    if (fileUrl) {
      $('#btn-fallback-link, #btn-empty-fallback').attr('href', fileUrl).removeClass('hidden').css('display', 'flex');
    }

    // 3. Render Area
    if (isPdf) {
      $('#source-viewer-empty').addClass('hidden');
      $('#pdf-scroll-area').removeClass('hidden').addClass('flex block');

      // MENGIRIM PERINTAH KE KOMPONEN REACT
      window.dispatchEvent(new CustomEvent('load-react-pdf', {
        detail: { url: fileUrl, pageNumber: pageNumber, keywords: keywords }
      }));
    } else {
      $('#pdf-scroll-area').removeClass('flex block').addClass('hidden');
      $('#source-viewer-empty').removeClass('hidden').show();
      $('#empty-icon').attr('class', 'fa-solid fa-file-lines text-2xl text-muted');
      $('#empty-title').text(fileUrl ? 'Format Bukan PDF' : 'File Tidak Ditemukan');
      $('#empty-desc').text(fileUrl ? 'Silakan buka file referensi ini melalui tab baru.' : 'File referensi tidak tersedia pada server.');
      if (!fileUrl) $('#btn-empty-fallback').addClass('hidden');
    }

    // 4. Buka Laci Drawer
    $('#source-viewer-overlay').removeClass('invisible opacity-0 pointer-events-none');
    $('#source-viewer-drawer').addClass('is-open');
  },

  close() {
    $('#source-viewer-overlay').addClass('invisible opacity-0 pointer-events-none');
    $('#source-viewer-drawer').removeClass('is-open');

    // Beri tahu React untuk membersihkan memory PDF
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('clear-react-pdf'));
    }, 300);
  }
};
