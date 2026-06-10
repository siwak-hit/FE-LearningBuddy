import $ from 'jquery';

export const Modal = {
  init() {
    // Tombol close atau klik di luar (overlay) menutup modal
    $(document).on('click', '.modal-close, .modal-overlay', function(e) {
      e.preventDefault();
      const id = $(this).closest('.custom-modal').attr('id');
      if(id) Modal.close(id);
    });
  },

  open(id) {
    const $modal = $(`#${id}`);
    $modal.removeClass('hidden');
    $modal[0].offsetHeight; // Memaksa browser me-render ulang (reflow) agar animasi jalan

    $modal.find('.modal-overlay').removeClass('opacity-0');
    $modal.find('.modal-box').removeClass('translate-y-full md:translate-y-8 opacity-0 md:scale-95').addClass('translate-y-0 opacity-100 md:scale-100');
  },

  close(id) {
    const $modal = $(`#${id}`);
    $modal.find('.modal-overlay').addClass('opacity-0');
    $modal.find('.modal-box').removeClass('translate-y-0 opacity-100 md:scale-100').addClass('translate-y-full md:translate-y-8 opacity-0 md:scale-95');

    setTimeout(() => { $modal.addClass('hidden'); }, 300);
  },

  // Custom Alert / Confirm pengganti bawaan browser
  confirm({ title, message, confirmText = 'Ya, Lanjutkan', cancelText = 'Batal', onConfirm }) {
    $('#dynamic-confirm-modal').remove();

    const modalHtml = `
      <div id="dynamic-confirm-modal" class="custom-modal fixed inset-0 z-[9999] hidden flex flex-col justify-end md:justify-center items-center">
        <div class="modal-overlay absolute inset-0 bg-ink/40 backdrop-blur-sm transition-opacity duration-300 opacity-0 cursor-pointer"></div>
        <div class="modal-box relative w-full md:max-w-md bg-surface-card rounded-t-[24px] md:rounded-[24px] p-8 shadow-2xl transform transition-all duration-300 translate-y-full md:translate-y-8 opacity-0 md:scale-95 flex flex-col">
          <div class="text-center mb-6">
            <div class="w-14 h-14 rounded-full bg-red-50 text-semantic-error flex items-center justify-center mx-auto mb-4 text-2xl"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <h2 class="font-serif text-2xl text-ink mb-2">${title}</h2>
            <p class="text-body text-[15px]">${message}</p>
          </div>
          <div class="flex gap-3 mt-auto">
            <button type="button" class="modal-close flex-1 border border-hairline-strong text-ink rounded-full py-3 font-medium hover:bg-canvas-soft transition-colors">${cancelText}</button>
            <button type="button" id="btn-dynamic-confirm" class="flex-1 bg-semantic-error text-white rounded-full py-3 font-medium hover:bg-red-700 transition-colors">${confirmText}</button>
          </div>
        </div>
      </div>
    `;

    $('body').append(modalHtml);

    $('#btn-dynamic-confirm').on('click', () => {
      Modal.close('dynamic-confirm-modal');
      if(onConfirm) onConfirm();
    });

    setTimeout(() => Modal.open('dynamic-confirm-modal'), 10);
  }
};
