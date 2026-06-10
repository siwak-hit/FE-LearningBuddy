const Toast = {
    show(message, type = 'success') {
      let bgColor = "#16a34a"; // Success (Hijau)
      let icon = "fa-circle-check";

      if (type === 'warn') {
        bgColor = "#f59e0b"; // Warn (Kuning)
        icon = "fa-triangle-exclamation";
      } else if (type === 'danger') {
        bgColor = "#dc2626"; // Danger (Merah)
        icon = "fa-circle-xmark";
      }

      // Menggunakan Toastify dari CDN global
      if (window.Toastify) {
        window.Toastify({
          text: `<i class="fa-solid ${icon} mr-2"></i> ${message}`,
          duration: 3000,
          gravity: "top",
          position: "center",
          escapeMarkup: false, // Izinkan HTML untuk icon
          style: {
            background: bgColor,
            borderRadius: "9999px", // Pill shape
            padding: "10px 24px",
            fontFamily: "'Inter', sans-serif",
            fontSize: "14px",
            fontWeight: "500",
            boxShadow: "0 4px 16px rgba(0,0,0,0.1)"
          }
        }).showToast();
      } else {
        alert(message);
      }
    }
  };

  export default Toast;
