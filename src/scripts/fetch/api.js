export const API_BASE = import.meta.env.PUBLIC_API_BASE_URL || 'http://localhost:3000/api';

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

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('alb_token');
      window.location.href = '/auth/login';
      return { status: 'error', message: 'Sesi berakhir, silakan login ulang.' };
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    return { status: 'error', message: 'Koneksi ke server gagal' };
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
