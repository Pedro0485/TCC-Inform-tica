(() => {
  const LOCAL_KEY = 'noctopus_notifications_local_v1';
  const API = '/notificacoes';
  let serverItems = [];

  function token() { return localStorage.getItem('token') || ''; }
  function getRole() {
    const path = location.pathname.toLowerCase();
    if (path.includes('/coordenador/')) return 'coordenador';
    if (path.includes('/professor/')) return 'professor';
    return 'aluno';
  }

  function getLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
    catch { return []; }
  }
  function saveLocal(items) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(0, 30)));
    notifyChanged();
  }
  function getAll() {
    const local = getLocal().map(n => ({ ...n, source: 'local' }));
    return [...serverItems, ...local].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  function notifyChanged() { window.dispatchEvent(new CustomEvent('noctopus:notifications-changed')); }
  function formatDate(iso) {
    try { return new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(new Date(iso)); }
    catch { return ''; }
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  async function apiFetch(url, options = {}) {
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token()}` };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, { ...options, headers });
    const data = res.status === 204 ? null : await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || data?.message || 'Erro ao acessar notificações');
    return data;
  }

  async function loadServerNotifications(showNewDevice = false) {
    if (!token()) return [];
    try {
      const previousIds = new Set(serverItems.map(n => String(n.id)));
      const items = await apiFetch(API);
      serverItems = items.map(n => ({ ...n, source: 'server', read: !!n.read }));
      if (showNewDevice && previousIds.size) {
        const nova = serverItems.find(n => !previousIds.has(String(n.id)) && !n.read);
        if (nova) showDeviceNotification(nova.title, nova.message);
      }
      notifyChanged();
      return serverItems;
    } catch (err) {
      console.warn('[notificações]', err.message);
      return [];
    }
  }

  async function showDeviceNotification(title, message) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, { body: message, icon: '/assets/images/logo.png', badge: '/assets/images/logo.png', tag: `noctopus-${Date.now()}` });
      } else new Notification(title, { body: message, icon: '/assets/images/logo.png' });
    } catch (_) {}
  }

  function addLocal({ title, message = '', type = 'info', url = '' }) {
    const items = getLocal();
    const item = { id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`, title, message, type, url, createdAt: new Date().toISOString(), read: false };
    items.unshift(item);
    saveLocal(items);
    showDeviceNotification(title, message);
    return item;
  }

  async function markAllRead() {
    saveLocal(getLocal().map(n => ({ ...n, read: true })));
    if (token()) {
      try { await apiFetch(`${API}/marcar-todas-lidas`, { method: 'POST' }); }
      catch (_) {}
      await loadServerNotifications(false);
    }
  }

  function clearLocal() { saveLocal([]); }
  async function requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    return await Notification.requestPermission();
  }
  function ensureServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  function renderPageList() {
    const host = document.querySelector('[data-notifications-list]');
    if (!host) return;
    const items = getAll();
    if (!items.length) {
      host.innerHTML = '<div class="empty-state"><i class="ti ti-bell-off"></i><span>Nenhuma notificação recente</span></div>';
      return;
    }
    host.innerHTML = items.map(n => `
      <article class="notification-card ${n.read ? '' : 'unread'}">
        <div class="notification-card-icon"><i class="ti ti-${n.type === 'calendar' ? 'calendar-event' : 'bell'}"></i></div>
        <div class="notification-card-content">
          <h3>${escapeHtml(n.title)}</h3>
          <p>${escapeHtml(n.message)}</p>
          <time>${formatDate(n.createdAt)}</time>
        </div>
      </article>`).join('');
  }

  function mountBell() {
    if (document.querySelector('.notification-fab')) return;
    const role = getRole();
    const home = `${role}-home.html`;
    const button = document.createElement('button');
    button.className = 'notification-fab'; button.type = 'button'; button.setAttribute('aria-label','Abrir notificações');
    button.innerHTML = '<i class="ti ti-bell"></i><span class="notification-badge"></span>';
    const pop = document.createElement('div');
    pop.className = 'notification-popover';
    pop.innerHTML = `<div class="notification-popover-header"><strong>Notificações</strong><a class="notification-popover-link" href="${home}">Ver todas</a></div><div class="notification-preview-list"></div>`;
    document.body.append(button,pop);

    const update = () => {
      const items = getAll();
      const unread = items.filter(n => !n.read).length;
      const badge = button.querySelector('.notification-badge');
      badge.textContent = unread > 99 ? '99+' : unread; badge.classList.toggle('show', unread > 0);
      pop.querySelector('.notification-preview-list').innerHTML = items.length
        ? items.slice(0,4).map(n => `<div class="notification-preview-item ${n.read ? '' : 'unread'}"><i class="ti ti-bell"></i><div><strong>${escapeHtml(n.title)}</strong><span>${escapeHtml(n.message)}</span></div></div>`).join('')
        : '<div class="notification-preview-empty">Nenhuma notificação</div>';
      renderPageList();
    };
    button.addEventListener('click', async e => { e.stopPropagation(); pop.classList.toggle('open'); if (pop.classList.contains('open')) await markAllRead(); });
    pop.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => pop.classList.remove('open'));
    window.addEventListener('noctopus:notifications-changed', update);
    update();
  }

  window.NoctopusNotifications = { getAll, add: addLocal, markAllRead, clearAll: clearLocal, requestPermission, reload: loadServerNotifications };

  document.addEventListener('DOMContentLoaded', async () => {
    ensureServiceWorker(); mountBell(); renderPageList();
    await loadServerNotifications(false);
    setInterval(() => loadServerNotifications(true), 30000);
    document.querySelector('[data-notification-read-all]')?.addEventListener('click', markAllRead);
    document.querySelector('[data-notification-clear]')?.addEventListener('click', clearLocal);
    document.querySelector('[data-notification-permission]')?.addEventListener('click', async e => {
      const result = await requestPermission();
      e.currentTarget.textContent = result === 'granted' ? 'Notificações do dispositivo ativadas' : result === 'denied' ? 'Permissão bloqueada no navegador' : 'Notificações indisponíveis';
    });
  });
})();
