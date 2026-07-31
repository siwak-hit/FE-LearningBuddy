import $ from 'jquery';
import Toast from '../components/toast.js';
import { ApiService } from '../fetch/api.js';

// Toggle lihat/sembunyikan password (dipakai form login & daftar).
function bindPasswordToggle(btnId, inputId, iconId) {
  $(btnId).on('click', () => {
    const $pwd = $(inputId);
    const isHidden = $pwd.attr('type') === 'password';
    $pwd.attr('type', isHidden ? 'text' : 'password');
    $(iconId).toggleClass('fa-eye', !isHidden).toggleClass('fa-eye-slash', isHidden);
  });
}

const AuthPage = {
  init() {
    bindPasswordToggle('#toggle-password', '#password', '#toggle-password-icon');
    bindPasswordToggle('#toggle-reg-password', '#reg-password', '#toggle-reg-password-icon');

    // Beralih antara form Login dan Daftar.
    const showRegister = () => {
      $('#login-form').addClass('hidden');
      $('#register-form').removeClass('hidden');
      $('#to-register-wrap').addClass('hidden');
      $('#to-login-wrap').removeClass('hidden');
      $('#auth-subtitle').text('Daftar Akun Guru');
    };
    const showLogin = () => {
      $('#register-form').addClass('hidden');
      $('#login-form').removeClass('hidden');
      $('#to-login-wrap').addClass('hidden');
      $('#to-register-wrap').removeClass('hidden');
      $('#auth-subtitle').text('Masuk ke Dashboard Guru');
    };
    $('#to-register').on('click', showRegister);
    $('#to-login').on('click', showLogin);

    // ===== LOGIN =====
    $('#login-form').on('submit', async (e) => {
      e.preventDefault();

      // Hanya tombol SUBMIT yang jadi spinner — jangan sentuh tombol mata (type="button").
      const $btn = $(e.target).find('button[type="submit"]');
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

    // ===== DAFTAR =====
    $('#register-form').on('submit', async (e) => {
      e.preventDefault();

      const $btn = $(e.target).find('button[type="submit"]');
      $btn.html('<i class="fa-solid fa-spinner fa-spin mr-2"></i> Mendaftar...').prop('disabled', true);

      const email = $('#reg-email').val();
      const password = $('#reg-password').val();
      const registerCode = $('#reg-code').val();

      const res = await ApiService.fetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, registerCode })
      });

      if (res.status === 'success') {
        Toast.show('Akun berhasil dibuat! Silakan login.', 'success');
        // Pindah ke form login + bawa email supaya tinggal isi password.
        showLogin();
        $('#email').val(email);
        $('#password').val('').focus();
        $btn.html('Daftar').prop('disabled', false);
      } else {
        Toast.show(res.message || 'Pendaftaran gagal. Coba lagi.', 'danger');
        $btn.html('Daftar').prop('disabled', false);
      }
    });
  }
};

export default AuthPage;
