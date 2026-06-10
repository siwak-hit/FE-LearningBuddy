import $ from 'jquery';
import Toast from '../components/toast.js';
import { ApiService } from '../fetch/api.js';

const AuthPage = {
  init() {
    $('#login-form').on('submit', async (e) => {
      e.preventDefault();

      const $btn = $(e.target).find('button');
      $btn.html('<i class="fa-solid fa-spinner fa-spin mr-2"></i> Memverifikasi...').prop('disabled', true);

      const email = $('#email').val();
      const password = $('#password').val();

      // Memanggil API Backend Sungguhan
      const res = await ApiService.fetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (res.status === 'success') {
        // Simpan JWT Token asli dari Supabase ke localStorage
        localStorage.setItem('alb_token', res.data.token);

        Toast.show('Login berhasil! Mengalihkan...', 'success');

        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1000);
      } else {
        // Tampilkan pesan error jika salah password
        Toast.show(res.message || 'Email atau password salah', 'danger');
        $btn.html('Masuk').prop('disabled', false);
      }
    });
  }
};

export default AuthPage;
