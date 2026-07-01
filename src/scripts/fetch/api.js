export const API_BASE = import.meta.env.PUBLIC_API_BASE_URL || 'http://localhost:3000/api';
export const API_TIMEOUT_MS = Number(import.meta.env.PUBLIC_API_TIMEOUT_MS || 20000);

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('alb_token');
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Set default Content-Type to JSON only if it's not a FormData request
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || API_TIMEOUT_MS);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers, signal: options.signal || controller.signal });

    clearTimeout(timeoutId);

    // [v0.9.6] Endpoint login TIDAK ikut auto-redirect saat 401. 401 di sini =
    // "email/password salah" → biarkan handler login menampilkan pesan errornya.
    // (Dulu 401 login ikut ke-redirect ke /auth/login → web cuma reload tanpa pesan.)
    // [FIX] Boundary publik siswa (buddy workspace) juga TIDAK ikut auto-redirect ke
    // login admin. 401/403 di sini = logika bisnis (mis. "key salah" di /chat/unlock),
    // BUKAN sesi admin kedaluwarsa. Dulu unlock chat yg 403 malah lempar siswa ke /auth/login.
    const ep = String(endpoint);
    const PUBLIC_PREFIXES = ['/auth/login', '/chat/', '/widget/', '/page-templates/', '/student-sessions/', '/student-notes/', '/moodle/student/', '/health'];
    const isPublicEndpoint = PUBLIC_PREFIXES.some((p) => ep.startsWith(p));

    if (!isPublicEndpoint && (response.status === 401 || response.status === 403)) {
      localStorage.removeItem('alb_token');
      window.location.href = '/auth/login';
      return { status: 'error', message: 'Sesi berakhir, silakan login ulang.' };
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('API Error:', error);
    if (error?.name === 'AbortError') {
      return {
        status: 'error',
        timeout: true,
        message: `Request terlalu lama (lebih dari ${Math.round(timeoutMs / 1000)} detik). Ini biasanya karena Moodle/server sedang lambat, **bukan karena kamu salah**. Kamu **tidak perlu mengetik ulang** — cukup klik tombol **🔄 Kirim ulang** di bawah. Kalau masih timeout sampai 3 kali, coba beberapa menit lagi ya.`
      };
    }
    return { status: 'error', message: 'Koneksi ke server gagal. Tidak perlu mengetik ulang — cukup klik tombol **🔄 Kirim ulang** di bawah. Jika tetap gagal, kemungkinan server atau Moodle sedang tidak stabil.' };
  }
}

export const ApiService = {
  fetch: request,
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, payload) => request(endpoint, { method: 'POST', body: JSON.stringify(payload) }),
  put: (endpoint, payload) => request(endpoint, { method: 'PUT', body: JSON.stringify(payload) }),
  patch: (endpoint, payload) => request(endpoint, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
  upload: (endpoint, formData) => request(endpoint, { method: 'POST', body: formData })
};
