// ============================================================
// pageElements.js — Manifest "Element Halaman" berbasis FOLDER (statis-visual).
//
// Sumber gambar: FE/public/ELEMENTS/<folder>/<n>.png  →  URL: /ELEMENTS/<folder>/<n>.png
// (casing 'ELEMENTS' WAJIB sama dengan disk — server melayani aset case-sensitive)
//
// Konsep: sama seperti tutorial "cara login" — jawaban statis-visual dari SISTEM
// (bukan AI), per konteks halaman. Tiap elemen punya tombol "Jelaskan dengan AI".
//
// CARA EDIT (silakan diatur sendiri):
//   • `names`  : nama tiap elemen sesuai urutan gambar (1.png, 2.png, ...).
//                Kalau dikosongkan, otomatis "<label> — Bagian N".
//   • `desc`   : penjelasan singkat tiap elemen (sesuai urutan gambar).
//   • `aliases`: kata kunci judul/halaman yang dibawa dari widget (sessionStorage)
//                supaya konteks halaman ter-mapping ke folder yang benar.
// ============================================================

export const PAGE_ELEMENTS = [
  {
    key: 'login',
    label: 'Halaman Login',
    folder: 'Halaman Login',
    pageType: 'login',
    images: [1, 2, 3],
    aliases: ['login', 'log in', 'masuk', 'sign in', 'manajemen', 'persediaan', 'sistem manajemen'],
    names: ['Form Login (Email & Password)', 'Tombol Masuk / Login', 'Tampilan ketika gagal Login'],
    desc: [
      'Kolom untuk mengisi username/email dan password akun VClass-mu. Pastikan keduanya ditulis dengan benar sebelum masuk.',
      'Tombol untuk mengirim data login dan masuk ke akunmu. Klik setelah email dan password terisi.',
      'Tampilan Ketika kamu salah memasukkan email atau password. Pastikan email dan password yang kamu masukkan sudah benar agar tidak gagal saat Login.'
    ]
  },
  {
    key: 'utama',
    label: 'Halaman Utama VClass',
    folder: 'Halaman Utama Vclass',
    pageType: 'dashboard',
    images: [1, 2, 3, 4],
    aliases: ['utama', 'beranda', 'dashboard', 'home', 'vclass', 'my home', 'ikhtisar'],
    names: ['Menu Navbar','Link & Breadcrumb','Filter Pencarian','Daftar Kursus'],
    desc: [
      'Menu navigasi utama untuk berpindah ke halaman mana pun di VClass.',
      'Jejak lokasi halaman. Klik salah satu tautan di sebelah kiri untuk kembali ke halaman sebelumnya, atau klik ikon rumah untuk kembali ke beranda.',
      'Cara menemukan kursus berdasarkan filter tertentu (misalnya waktu atau kata kunci). Tersedia juga pilihan tampilan: bentuk kartu atau daftar (list).',
      'Daftar kursus yang kamu ikuti — inilah yang dibuka saat ingin mengerjakan tugas dari guru. Pastikan memilih kelas yang sesuai dengan kursusnya.'
    ]
  },
  {
    key: 'detail_kursus',
    label: 'Detail Kursus',
    folder: 'Halaman Detail Kursus',
    pageType: 'course',
    images: [1, 2, 3, 4, 5, 6, 7],
    aliases: ['detail kursus', 'detail course', 'course', 'kursus', 'mata pelajaran', 'mapel'],
    names: ['Navigasi','Progress Bar','Menu Samping','Konten Umum','Konten Materi','Konten Tugas','Status Terkunci'],
    desc: [
      'Menu untuk berpindah antar-tab: Nilai, daftar aktivitas, peserta kursus, dan kompetensi. Coba buka satu per satu — aman, tidak akan error kok!',
      'Persentase progres belajarmu di kursus ini, lengkap dengan menu akses cepat seperti pada Navigasi.',
      'Tombol untuk memilih tampilan: konten utama kursus, atau sekadar info kursus.',
      'Berisi tata tertib dan aturan kursus yang dibuat pengajar. Wajib kamu baca.',
      'Berisi materi yang bisa kamu baca sebagai bekal menjawab soal dari guru. Klik judul materi (yang ada ikonnya) untuk membukanya.',
      'Berisi tugas yang harus dikerjakan untuk mendapat nilai — seperti Kuis, Tugas pengumpulan, dan Forum diskusi. Perhatikan batas waktunya dan pastikan koneksi internetmu lancar.',
      'Menunjukkan status sebuah konten. Jika terkunci, selesaikan dulu konten sebelumnya sesuai syarat yang tertera agar konten itu terbuka. Catatan: baca syarat penyelesaiannya dengan teliti.'
    ]
  },
  {
    key: 'kuis',
    label: 'Halaman Kuis',
    folder: 'Halaman Kuis',
    pageType: 'quiz',
    images: [1, 2, 3, 4],
    aliases: ['kuis', 'quiz', 'pengerjaan kuis', 'kerjakan kuis', 'ujian', 'soal'],
    names: ['Status Siap','Navigasi Kuis','Soal','Konfirmasi Selesai'], desc: [
      'Langkah awal sebelum mengerjakan kuis pilihan ganda. Baca dulu aturannya, termasuk batas waktu pengerjaan.',
      'Menampilkan jumlah soal dan dipakai untuk berpindah ke nomor soal mana pun.',
      'Contoh format soal pilihan ganda. Klik salah satu jawaban untuk menjawab, atau "Bersihkan jawaban" untuk menghapus pilihanmu.',
      'Tombol konfirmasi saat kuis selesai. Klik "Selesaikan Kuis" bila sudah yakin, atau kembali ke kuis untuk memperbaiki jawaban. Sisa waktu pengerjaan juga terlihat di sini.'
    ]
  },
  {
    key: 'review_kuis',
    label: 'Review Kuis',
    folder: 'Halaman Review Kuis',
    pageType: 'quiz_review',
    images: [1, 2],
    aliases: ['review kuis', 'review quiz', 'hasil kuis', 'tinjauan kuis', 'ringkasan kuis'],
    names: ['Status & Koreksi','Navigasi'], desc: [
      'Menampilkan hasilmu: jawaban yang benar dan yang salah dari kuis yang baru dikerjakan. Bila ada kekeliruan koreksi, kamu bisa komplain ke guru.',
      'Tombol untuk pindah ke konten berikutnya atau sebelumnya.'
    ]
  },
  {
    key: 'buat_forum',
    label: 'Buat Forum Diskusi',
    folder: 'Halaman Buat Forum',
    pageType: 'forum',
    images: [1, 2, 3],
    aliases: ['forum', 'diskusi', 'buat forum', 'tambah diskusi', 'topik diskusi'],
    names: ['Tombol Aksi','Instruksi','Daftar Forum'], desc: [
      'Tombol untuk membuat forum baru, mencari forum, atau berlangganan forum (agar dapat notifikasi bila ada yang membuat forum di sana). Klik "Tambahkan Diskusi" untuk membuat forum.',
      'Berisi instruksi yang harus dibaca agar kamu tahu forum seperti apa yang perlu dibuat.',
      'Tempat melihat forum yang baru kamu buat. Jika namamu sudah muncul di daftar ini, berarti forum berhasil dipublikasikan. Kamu masih bisa mengeditnya, tapi ada batas waktunya — perhatikan baik-baik.'
    ]
  },
  {
    key: 'kumpul_tugas',
    label: 'Kumpulkan Tugas',
    folder: 'Halaman Kumpulin Tugas',
    pageType: 'assign',
    images: [1, 2, 3, 4],
    aliases: ['upload tugas', 'kumpul tugas', 'kumpulkan tugas', 'kumpulin tugas', 'assignment', 'tugas'],
    names: ['Instruksi','Status Pengerjaan','Pesan untuk Guru','Unggah File'],
    desc: [
      'Berisi instruksi yang harus kamu baca agar tahu apa yang perlu dikerjakan.',
      'Berisi aturan dan status pengunggahan tugasmu, misalnya berapa kali kesempatan mengunggah.',
      'Tempat menuliskan keterangan tugasmu — misalnya nama atau kelas, atau catatan lain bila diperlukan. Sesuaikan dengan perintah gurumu.',
      'Klik ikon panah ke bawah, lalu unggah file tugasmu (misalnya foto tugas tulis tangan bila diminta dalam bentuk foto). Setelah itu klik kirim dan tunggu hingga statusnya berubah menjadi selesai.'
    ]
  },
  {
    key: 'tugas_selesai',
    label: 'Tugas Selesai',
    folder: 'Halaman Kumpulin Tugas Selesai',
    pageType: 'assign_done',
    images: [1, 2],
    aliases: ['tugas selesai', 'sudah dikumpulkan', 'submission selesai', 'tugas terkirim'],
    names: ['Instruksi','Status Selesai'], desc: [
      'Berisi instruksi yang harus kamu baca agar tahu apa yang perlu dikerjakan.',
      'Status tugas yang sudah kamu kumpulkan. Jika tampilan VClass-mu sudah sama seperti gambar, berarti tugasmu berhasil diunggah. Catatan: cek nilaimu secara berkala karena nanti diberikan oleh guru.'
    ]
  }
];

// PENTING: casing harus PERSIS sama dengan folder di FE/public.
// Server (Vite dev & produksi Linux) melayani aset secara CASE-SENSITIVE.
// Folder di disk: FE/public/ELEMENTS/<Halaman ...>/<n>.png  → base = 'ELEMENTS'.
const ELEMENTS_BASE = 'ELEMENTS';

export function pageImagePath(folder, n) {
  // Encode tiap segmen agar spasi pada nama folder tetap valid sebagai URL.
  return '/' + [ELEMENTS_BASE, ...String(folder).split('/')].map(encodeURIComponent).join('/') + '/' + n + '.png';
}

// Bangun daftar elemen (format yang dipahami _renderElementCards) untuk sebuah halaman.
export function buildElementsForPage(key) {
  const page = PAGE_ELEMENTS.find((p) => p.key === key);
  if (!page) return [];
  return page.images.map((n, i) => {
    const name = (page.names && page.names[i]) || `${page.label} — Bagian ${n}`;
    const text = (page.desc && page.desc[i])
      || `Tampilan ${n} dari ${page.label}. Klik "Jelaskan dengan AI" untuk penjelasan lebih lanjut.`;
    return {
      key: `${page.key}_${n}`,
      name,
      type: 'Elemen Halaman',
      title: page.label,
      text,
      image: pageImagePath(page.folder, n),
      page_key: page.key,
      page_label: page.label,
      page_type: page.pageType
    };
  });
}

// Pilihan untuk dropdown "Ganti Konteks Halaman".
export function getPageElementOptions() {
  return PAGE_ELEMENTS.map((p) => ({ key: p.key, label: p.label, count: p.images.length }));
}

// Map konteks yang dibawa dari widget (judul/heading/pageType) ke key halaman.
export function resolvePageKeyFromContext(context = {}) {
  const hay = [
    context.pageType, context.page_type, context.templateName,
    context.title, context.heading, context.url, context.sourceUrl, context.summary
  ].filter(Boolean).join(' ').toLowerCase();

  if (!hay.trim()) return null;

  let bestKey = null;
  let bestScore = 0;
  for (const p of PAGE_ELEMENTS) {
    let score = 0;
    const needles = [p.key, p.label.toLowerCase(), p.pageType, ...(p.aliases || [])];
    for (const needle of needles) {
      if (needle && hay.includes(String(needle).toLowerCase())) {
        score = Math.max(score, String(needle).length); // alias terpanjang = sinyal terkuat
      }
    }
    if (score > bestScore) { bestScore = score; bestKey = p.key; }
  }
  return bestKey;
}

// [v0.6.0] Map TEKS PERTANYAAN user → key halaman, untuk fitur auto-pindah konteks.
// Lebih ketat dari resolvePageKeyFromContext: hanya memicu bila user jelas menanyakan
// "cara/letak/halaman/menu/tombol" + menyebut nama halaman/alias yang khas (≥4 huruf).
// Mengembalikan null untuk pertanyaan materi biasa (mis. "apa itu CMS").
export function resolvePageKeyFromText(text = '') {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;

  const hasPageCue = /\b(cara|caranya|gimana|gmn|bagaimana|buka|bukakan|tampilkan|lihat|melihat|dimana|di mana|letak|letaknya|halaman|menu|tombol|form|fitur|masuk ke|pergi ke)\b/.test(t);
  if (!hasPageCue) return null;

  // Jangan ganggu pertanyaan status LMS (deadline/belum dikerjakan) — itu urusan BE.
  if (/\b(belum|mana yang|deadline|tenggat|sudah berapa|nilai saya|skor saya)\b/.test(t)) return null;

  // Alias terlalu generik (nama platform / kata umum) tidak boleh memicu perpindahan,
  // mis. "vclass" tidak boleh menarik "cara login ke vclass" ke Halaman Utama.
  const GENERIC = new Set(['vclass', 'home', 'my home', 'ikhtisar', 'beranda']);

  let bestKey = null;
  let bestScore = 0;
  for (const p of PAGE_ELEMENTS) {
    let score = 0;
    for (const needle of [p.label.toLowerCase(), ...(p.aliases || [])]) {
      const n = String(needle).toLowerCase();
      if (GENERIC.has(n)) continue;
      if (n.length >= 4 && t.includes(n)) score = Math.max(score, n.length);
    }
    if (score > bestScore) { bestScore = score; bestKey = p.key; }
  }
  return bestScore >= 4 ? bestKey : null;
}
