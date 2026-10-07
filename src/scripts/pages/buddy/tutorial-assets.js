// ============================================================
// tutorial-assets.js — [v0.9.91] VERSI RINGAN.
//
// Sebelumnya (v0.9.90) saat workspace dibuka: 36 gambar diunduh langsung + 8 video diunduh
// lewat <video preload="auto"> tersembunyi. Itu penyebab puluhan MB di halaman /buddy.
//
// Sekarang:
//  • TIDAK ada video yang diunduh di awal. Ketersediaan file dicek lewat HEAD (beberapa
//    byte), dan baru dilakukan saat modal panduan dibuka (probeTutorialVideo).
//  • Gambar: hanya gambar LANGKAH PERTAMA tiap panduan, dan hanya saat browser idle &
//    koneksi tidak hemat-data. Sisa gambar dimuat normal saat siswa membuka modal
//    (service worker sudah meng-cache PNG).
//  • API yang diekspor tetap sama: prefetchTutorialAssets, isTutorialVideoAvailable.
//    Tambahan: probeTutorialVideo.
// ============================================================
import { ApiService } from '../../fetch/api.js';

// url video → true (ada) | false (tidak ada) | undefined (belum diprobe)
const videoStatus = new Map();
const probing = new Map();
let started = false;

export function isTutorialVideoAvailable(url) {
  return videoStatus.get(String(url || ''));
}

function isSavingData() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return false;
  return conn.saveData === true || ['slow-2g', '2g', '3g'].includes(conn.effectiveType);
}

function whenIdle(fn) {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout: 8000 });
  else setTimeout(fn, 3000);
}

// Cek apakah file video benar-benar ada TANPA mengunduhnya.
// Beberapa host mengembalikan 200 + index.html untuk file yang tidak ada → periksa content-type.
export function probeTutorialVideo(url) {
  const key = String(url || '');
  if (!key) return Promise.resolve(false);
  if (videoStatus.has(key)) return Promise.resolve(videoStatus.get(key));
  if (probing.has(key)) return probing.get(key);

  const looksLikeVideo = (res) => {
    if (!res || !res.ok) return false;
    const type = String(res.headers.get('content-type') || '').toLowerCase();
    return type.startsWith('video/') || type.includes('octet-stream');
  };

  const p = (async () => {
    let ok = false;
    try {
      let res = await fetch(key, { method: 'HEAD' });
      if (res.status === 405 || res.status === 501) {
        // Server tak mendukung HEAD → minta 1 byte saja.
        res = await fetch(key, { method: 'GET', headers: { Range: 'bytes=0-0' } });
      }
      ok = looksLikeVideo(res);
    } catch (_) {
      ok = false;
    }
    videoStatus.set(key, ok);
    probing.delete(key);
    return ok;
  })();

  probing.set(key, p);
  return p;
}

export async function prefetchTutorialAssets() {
  if (started) return;
  started = true;

  // Tunda sampai browser idle supaya tidak bersaing dengan render awal & request penting.
  whenIdle(async () => {
    if (isSavingData()) return; // koneksi lemot / hemat data → biarkan lazy saat modal dibuka

    let tutorials = [];
    try {
      const res = await ApiService.get('/chat/tutorial-assets');
      if (res?.status !== 'success' || !Array.isArray(res.data)) return;
      tutorials = res.data;
    } catch (err) {
      console.warn('[Buddy] Gagal memuat daftar aset panduan:', err);
      return;
    }

    // Hanya gambar langkah pertama tiap panduan (kecil), bukan semua gambar & bukan video.
    tutorials.forEach((tut) => {
      const first = (tut.images || [])[0];
      if (first) { const img = new Image(); img.decoding = 'async'; img.src = first; }
    });
  });
}
