(() => {
  const storageKey = 'noctopus_economia_dados';
  const isLowData = () => localStorage.getItem(storageKey) === '1';
  function applyLowData() {
    document.documentElement.classList.toggle('low-data-mode', isLowData());
  }
  function addLowDataControl() {
    if (!window.matchMedia('(max-width: 768px)').matches || document.querySelector('.low-data-toggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'low-data-toggle';
    button.innerHTML = '<i class="ti ti-leaf" aria-hidden="true"></i><span>Economia</span>';
    button.setAttribute('aria-label', 'Ativar economia de dados');
    button.addEventListener('click', () => {
      localStorage.setItem(storageKey, isLowData() ? '0' : '1');
      applyLowData();
      const active = isLowData();
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', active ? 'Desativar economia de dados' : 'Ativar economia de dados');
      if (window.NoctopusStatus) window.NoctopusStatus.show(active ? 'Economia de dados ativada' : 'Economia de dados desativada', 'success');
    });
    button.setAttribute('aria-pressed', String(isLowData()));
    document.body.append(button);
  }
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
  function initialize() { configureMobileNavigation(); installStatusMessages(); applyLowData(); addLowDataControl(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
