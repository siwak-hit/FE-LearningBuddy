// ============================================================
// tutorial-assets.js — [v0.9.90] Prefetch aset panduan VClass saat workspace dibuka.
//
// Tujuannya: modal panduan (gambar & video) tidak loading lagi saat siswa mengkliknya.
//  • Gambar (~36 PNG kecil) diunduh SEGERA. Service worker (public/sw.js) sudah memakai
//    strategi stale-while-revalidate untuk PNG, jadi sekalian masuk Cache Storage.
//  • Video diunduh menyusul saat browser idle, satu per satu, dan DILEWATI pada koneksi
//    lambat / mode hemat data — jaringan sekolah tidak ideal untuk 8 file mp4 sekaligus.
//
// Pemanasan video sekaligus jadi PROBE ketersediaan file: video panduan mengikuti
// konvensi nama `/VIDEOS/<key>.mp4` dan belum semuanya diunggah guru. Modal memakai
// `isTutorialVideoAvailable()` untuk menyembunyikan switch "Video" pada panduan yang
// filenya belum ada, alih-alih menampilkan tab yang pasti gagal.
// ============================================================
import { ApiService } from '../../fetch/api.js';

// url video → true (siap dipakai) | false (file tidak ada) | undefined (belum diprobe)
const videoStatus = new Map();
let started = false;

export function isTutorialVideoAvailable(url) {
  return videoStatus.get(String(url || ''));
}

// Koneksi lemot / hemat data → cukup gambar saja, video biar streaming normal.
function shouldSkipVideo() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return false;
  return conn.saveData === true || ['slow-2g', '2g'].includes(conn.effectiveType);
}

function whenIdle(fn) {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout: 5000 });
  else setTimeout(fn, 1500);
}

// `<video preload="auto">` tersembunyi mengisi cache media browser tanpa perlu bantuan
// service worker (request video memakai header Range yang tidak cocok dengan Cache API).
function warmVideo(url) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';

    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      videoStatus.set(url, ok);
      video.removeAttribute('src');
      video.remove();
      resolve();
    };

    video.addEventListener('canplaythrough', () => finish(true), { once: true });
    video.addEventListener('error', () => finish(false), { once: true });
    // Video panjang mungkin tak pernah `canplaythrough`; metadata terbaca sudah cukup
    // membuktikan filenya ada, dan unduhannya dibiarkan lanjut sampai batas waktu.
    video.addEventListener('loadedmetadata', () => videoStatus.set(url, true), { once: true });
    setTimeout(() => finish(videoStatus.get(url) === true), 20000);

    video.src = url;
    document.body.appendChild(video);
  });
}

export async function prefetchTutorialAssets() {
  if (started) return;
  started = true;

  let tutorials = [];
  try {
    const res = await ApiService.get('/chat/tutorial-assets');
    if (res?.status !== 'success' || !Array.isArray(res.data)) return;
    tutorials = res.data;
  } catch (err) {
    console.warn('[Buddy] Gagal memuat daftar aset panduan:', err);
    return;
  }

  tutorials.forEach((tut) => {
    (tut.images || []).forEach((url) => { new Image().src = url; });
  });

  if (shouldSkipVideo()) return;

  const videos = tutorials.map((tut) => tut.video).filter(Boolean);
  whenIdle(async () => {
    for (const url of videos) await warmVideo(url);
  });
}
