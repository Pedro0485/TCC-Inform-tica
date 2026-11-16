(() => {
  function installStatusMessages() {
    window.NoctopusStatus = window.NoctopusStatus || {
      show(message, type = 'info') {
        let region = document.querySelector('.noctopus-status-region');
        if (!region) {
          region = document.createElement('div');
          region.className = 'noctopus-status-region';
          region.setAttribute('role', 'status');
          region.setAttribute('aria-live', 'polite');
          document.body.append(region);
        }
        region.textContent = message;
        region.dataset.type = type;
        region.classList.add('visible');
        clearTimeout(region._hideTimer);
        region._hideTimer = setTimeout(() => region.classList.remove('visible'), 3500);
      }
    };
  }
  function configureMobileNavigation() {
    if (!window.matchMedia('(max-width: 768px)').matches) return;
    document.querySelectorAll('.sidebar nav .nav-item').forEach((link) => {
      const label = link.querySelector('span')?.textContent.trim();
      if (!label) return;
      if (!link.hasAttribute('aria-label')) link.setAttribute('aria-label', label);
      link.title = label;
    });
  }
  function initialize() { configureMobileNavigation(); installStatusMessages(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
