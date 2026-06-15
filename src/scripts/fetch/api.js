export const API_BASE = import.meta.env.PUBLIC_API_BASE_URL || 'http://localhost:3000/api';
export const API_TIMEOUT_MS = Number(import.meta.env.PUBLIC_API_TIMEOUT_MS || 20000);

function isAuthLoginEndpoint(endpoint = '') {
  return String(endpoint || '').replace(/^\/+/, '').startsWith('auth/login');
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch (error) {
    return {
      status: response.ok ? 'success' : 'error',
      message: response.ok ? 'Request berhasil' : (response.statusText || 'Request gagal'),
      data: null
    };
  }
}

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('alb_token');
  const headers = { ...options.headers };
  const shouldSkipAuthRedirect = Boolean(options.skipAuthRedirect) || isAuthLoginEndpoint(endpoint);

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
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal
    });

    clearTimeout(timeoutId);

    const payload = await readJsonSafely(response);

    if (response.status === 401 || response.status === 403) {
      // Khusus login: jangan redirect ke halaman login lagi.
      // Kalau email/password salah, biarkan auth.page.js menampilkan pesan error dari backend.
      if (shouldSkipAuthRedirect) {
        return {
          status: 'error',
          message: payload?.message || 'Email atau password salah.',
          data: payload?.data ?? null
        };
      }

      localStorage.removeItem('alb_token');
      window.location.href = '/auth/login';
      return { status: 'error', message: 'Sesi berakhir, silakan login ulang.', data: null };
    }

    return payload;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('API Error:', error);
    if (error?.name === 'AbortError') {
      return { status: 'error', message: `Request terlalu lama. Batas maksimal ${Math.round(timeoutMs / 1000)} detik.`, data: null };
    }
    return { status: 'error', message: 'Koneksi ke server gagal', data: null };
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
