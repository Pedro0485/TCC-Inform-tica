(() => {
  const LOCAL_KEY = 'noctopus_notifications_local_v1';
  const DISMISSED_KEY = 'noctopus_notifications_dismissed_v1';
  const API = '/notificacoes';

  let serverItems = [];
  let firstServerLoad = true;

  // =========================================================
  // AUTENTICAÇÃO
  // =========================================================

  function token() {
    return localStorage.getItem('token') || '';
  }

  function getRole() {
    const path = location.pathname.toLowerCase();

    if (path.includes('/coordenador/')) return 'coordenador';
    if (path.includes('/professor/')) return 'professor';

    return 'aluno';
  }

  // =========================================================
  // NOTIFICAÇÕES LOCAIS
  // =========================================================

  function getLocal() {
    try {
      const data = JSON.parse(
        localStorage.getItem(LOCAL_KEY) || '[]'
      );

      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('[notificações] Erro ao ler notificações locais:', error);
      return [];
    }
  }

  function saveLocal(items) {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify(items.slice(0, 30))
    );

    notifyChanged();
  }

  // =========================================================
  // NOTIFICAÇÕES DO SERVIDOR EXCLUÍDAS PELO USUÁRIO
  // =========================================================
  //
  // Como as notificações do servidor podem ser destinadas a
  // vários usuários ao mesmo tempo (ex.: "todos", "turmas"),
  // excluir uma notificação não pode apagá-la do banco para
  // todo mundo. Por isso guardamos, neste dispositivo, quais
  // IDs o usuário já excluiu/limpou e as escondemos da lista.

  function getDismissed() {
    try {
      const data = JSON.parse(
        localStorage.getItem(DISMISSED_KEY) || '[]'
      );

      return Array.isArray(data) ? data.map(String) : [];
    } catch (error) {
      console.warn('[notificações] Erro ao ler notificações excluídas:', error);
      return [];
    }
  }

  function addDismissed(ids) {
    const current = new Set(getDismissed());

    ids.forEach(id => current.add(String(id)));

    localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify(Array.from(current).slice(-300))
    );
  }

  // =========================================================
  // NORMALIZAÇÃO
  // =========================================================

  function normalizeNotification(n, source = 'server') {
    if (!n) return null;

    return {
      id: n.id,
      title: n.title ?? n.titulo ?? 'Notificação',
      message: n.message ?? n.mensagem ?? '',
      type: n.type ?? n.tipo ?? 'info',
      url: n.url ?? '',
      createdAt:
        n.createdAt ??
        n.created_at ??
        n.data_criacao ??
        new Date().toISOString(),
      read:
        n.read === true ||
        n.read === 1 ||
        n.lida === true ||
        n.lida === 1,
      source
    };
  }

  // =========================================================
  // TODAS AS NOTIFICAÇÕES
  // =========================================================

  function getAll() {
    const local = getLocal()
      .map(n => normalizeNotification(n, 'local'))
      .filter(Boolean);

    const server = serverItems
      .map(n => normalizeNotification(n, 'server'))
      .filter(Boolean);

    return [...server, ...local]
      .sort((a, b) => {
        return (
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime()
        );
      });
  }

  function notifyChanged() {
    window.dispatchEvent(
      new CustomEvent('noctopus:notifications-changed')
    );
  }

  // =========================================================
  // FORMATAÇÃO
  // =========================================================

  function formatDate(iso) {
    try {
      const date = new Date(iso);

      if (Number.isNaN(date.getTime())) {
        return '';
      }

      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
      }).format(date);

    } catch {
      return '';
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(
      /[&<>'"]/g,
      c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      })[c]
    );
  }

  // =========================================================
  // API
  // =========================================================

  async function apiFetch(url, options = {}) {
    const headers = {
      ...(options.headers || {})
    };

    const jwt = token();

    if (jwt) {
      headers.Authorization = `Bearer ${jwt}`;
    }

    if (
      options.body &&
      !headers['Content-Type'] &&
      !headers['content-type']
    ) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...options,
      headers,
      cache: 'no-store'
    });

    const data =
      response.status === 204
        ? null
        : await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.error ||
        data?.message ||
        `Erro HTTP ${response.status}`
      );
    }

    return data;
  }

  // =========================================================
  // CARREGAR NOTIFICAÇÕES DO SERVIDOR
  // =========================================================

  async function loadServerNotifications(showNewDevice = false) {
    const jwt = token();

    if (!jwt) {
      console.warn(
        '[notificações] Usuário não possui token de autenticação.'
      );

      serverItems = [];
      notifyChanged();

      return [];
    }

    try {
      // Guarda os IDs que já estavam carregados
      const previousIds = new Set(
        serverItems.map(n => String(n.id))
      );

      const response = await apiFetch(API);

      /*
       * Aceita tanto:
       *
       * [
       *   {...}
       * ]
       *
       * quanto:
       *
       * {
       *   notificacoes: [...]
       * }
       *
       * ou:
       *
       * {
       *   notifications: [...]
       * }
       */

      let items = [];

      if (Array.isArray(response)) {
        items = response;

      } else if (Array.isArray(response?.notificacoes)) {
        items = response.notificacoes;

      } else if (Array.isArray(response?.notifications)) {
        items = response.notifications;

      } else if (Array.isArray(response?.data)) {
        items = response.data;
      }

      const dismissed = new Set(getDismissed());

      serverItems = items
        .map(n => normalizeNotification(n, 'server'))
        .filter(Boolean)
        .filter(n => !dismissed.has(String(n.id)));

      // =====================================================
      // IDENTIFICAR NOVA NOTIFICAÇÃO
      // =====================================================

      if (
        showNewDevice &&
        previousIds.size > 0
      ) {
        const novas = serverItems.filter(
          n =>
            !previousIds.has(String(n.id)) &&
            !n.read
        );

        for (const nova of novas) {
          await showDeviceNotification(
            nova.title,
            nova.message
          );
        }
      }

      notifyChanged();

      console.log(
        `[notificações] ${serverItems.length} notificação(ões) carregada(s).`
      );

      firstServerLoad = false;

      return serverItems;

    } catch (error) {
      console.error(
        '[notificações] Erro ao carregar notificações do servidor:',
        error
      );

      /*
       * Não apagamos serverItems quando a requisição falhar.
       * Assim, uma falha momentânea da API não remove as
       * notificações que já estavam aparecendo na central.
       */

      return serverItems;
    }
  }

  // =========================================================
  // NOTIFICAÇÃO DO NAVEGADOR / SERVICE WORKER
  // =========================================================

  async function showDeviceNotification(title, message) {
    if (!('Notification' in window)) {
      return;
    }

    if (Notification.permission !== 'granted') {
      return;
    }

    try {
      if ('serviceWorker' in navigator) {
        const registration =
          await navigator.serviceWorker.ready;

        await registration.showNotification(
          title,
          {
            body: message,

            icon: '/assets/images/logo.png',

            badge: '/assets/images/logo.png',

            tag: `noctopus-notification-${Date.now()}`,

            renotify: true,

            data: {
              url: location.href
            }
          }
        );

        return;
      }

      new Notification(title, {
        body: message,
        icon: '/assets/images/logo.png'
      });

    } catch (error) {
      console.warn(
        '[notificações] Não foi possível mostrar notificação no dispositivo:',
        error
      );
    }
  }

  // =========================================================
  // ADICIONAR NOTIFICAÇÃO LOCAL
  // =========================================================

  function addLocal({
    title,
    message = '',
    type = 'info',
    url = ''
  }) {
    const items = getLocal();

    const item = {
      id:
        `local-${Date.now()}-` +
        Math.random()
          .toString(16)
          .slice(2),

      title,
      message,
      type,
      url,

      createdAt:
        new Date().toISOString(),

      read: false
    };

    items.unshift(item);

    saveLocal(items);

    showDeviceNotification(
      title,
      message
    );

    return item;
  }

  // =========================================================
  // MARCAR TODAS COMO LIDAS
  // =========================================================

  async function markAllRead() {

    // Notificações locais
    saveLocal(
      getLocal().map(n => ({
        ...n,
        read: true
      }))
    );

    // Notificações do servidor
    if (token()) {
      try {

        await apiFetch(
          `${API}/marcar-todas-lidas`,
          {
            method: 'POST'
          }
        );

        // Atualiza imediatamente a interface
        serverItems = serverItems.map(n => ({
          ...n,
          read: true
        }));

        notifyChanged();

      } catch (error) {

        console.warn(
          '[notificações] Não foi possível marcar como lidas:',
          error
        );
      }
    }
  }

  // =========================================================
  // CONFIRMAÇÃO DE EXCLUSÃO
  // =========================================================

  async function confirmNotificationDeletion({ all = false } = {}) {
    const title = all
      ? 'Limpar todas as notificações?'
      : 'Excluir esta notificação?';

    const text = all
      ? 'Todas as notificações desta central serão removidas da sua visualização.'
      : 'Essa ação não poderá ser desfeita.';

    // Usa o SweetAlert2 quando estiver disponível no projeto.
    if (window.Swal) {
      const result = await window.Swal.fire({
        icon: 'warning',
        title,
        text,
        showCancelButton: true,
        confirmButtonText: all ? 'Sim, limpar' : 'Sim, excluir',
        cancelButtonText: 'Cancelar',
        reverseButtons: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        customClass: {
          icon: 'notification-delete-warning-icon'
        },
        focusCancel: true,
        heightAuto: false
      });

      return result.isConfirmed;
    }

    // Fallback para páginas que não carregam o SweetAlert2.
    return window.confirm(`${title}\n\n${text}`);
  }

  // =========================================================
  // LIMPAR TODAS AS NOTIFICAÇÕES
  // =========================================================
  //
  // Limpa as notificações locais e, para as notificações vindas
  // do servidor, marca todas as que estão sendo exibidas no
  // momento como excluídas neste dispositivo.

  async function clearAll() {
    const confirmed = await confirmNotificationDeletion({ all: true });

    if (!confirmed) {
      return false;
    }

    saveLocal([]);

    if (serverItems.length) {
      addDismissed(serverItems.map(n => n.id));
      serverItems = [];
    }

    notifyChanged();

    return true;
  }

  // =========================================================
  // EXCLUIR UMA NOTIFICAÇÃO
  // =========================================================

  function removeNotification(id, source) {

    const isLocal =
      source === 'local' ||
      String(id).startsWith('local-');

    if (isLocal) {

      const items = getLocal().filter(
        n => String(n.id) !== String(id)
      );

      saveLocal(items);

      return;
    }

    addDismissed([id]);

    serverItems = serverItems.filter(
      n => String(n.id) !== String(id)
    );

    notifyChanged();
  }

  // =========================================================
  // MARCAR UMA NOTIFICAÇÃO COMO LIDA
  // =========================================================

  async function markOneRead(id, source) {

    const isLocal =
      source === 'local' ||
      String(id).startsWith('local-');

    if (isLocal) {

      const items = getLocal().map(n =>
        String(n.id) === String(id)
          ? { ...n, read: true }
          : n
      );

      saveLocal(items);

      return;
    }

    // Atualização otimista da interface
    serverItems = serverItems.map(n =>
      String(n.id) === String(id)
        ? { ...n, read: true }
        : n
    );

    notifyChanged();

    if (!token()) {
      return;
    }

    try {

      await apiFetch(
        `${API}/${id}/lida`,
        { method: 'POST' }
      );

    } catch (error) {

      console.warn(
        '[notificações] Não foi possível marcar a notificação como lida:',
        error
      );
    }
  }

  // =========================================================
  // MODAL DE DETALHES DA NOTIFICAÇÃO
  // =========================================================

  function ensureDetailModal() {

    let overlay = document.querySelector(
      '.notification-detail-overlay'
    );

    if (overlay) {
      return overlay;
    }

    overlay = document.createElement('div');
    overlay.className = 'notification-detail-overlay';

    overlay.innerHTML = `
      <div
        class="notification-detail-modal"
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          class="notification-detail-close"
          aria-label="Fechar"
        >
          <i class="ti ti-x"></i>
        </button>

        <div class="notification-detail-icon">
          <i class="ti ti-bell"></i>
        </div>

        <span class="notification-detail-status"></span>

        <h3 class="notification-detail-title"></h3>

        <time class="notification-detail-date"></time>

        <p class="notification-detail-message"></p>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        closeDetailModal();
      }
    });

    overlay
      .querySelector('.notification-detail-close')
      .addEventListener('click', closeDetailModal);

    document.addEventListener('keydown', event => {
      if (
        event.key === 'Escape' &&
        overlay.classList.contains('open')
      ) {
        closeDetailModal();
      }
    });

    return overlay;
  }

  function closeDetailModal() {

    const overlay = document.querySelector(
      '.notification-detail-overlay'
    );

    if (overlay) {
      overlay.classList.remove('open');
    }
  }

  async function openNotification(notification) {

    if (!notification) {
      return;
    }

    const overlay = ensureDetailModal();

    const icon =
      notification.type === 'calendar'
        ? 'calendar-event'
        : 'bell';

    overlay.querySelector(
      '.notification-detail-icon i'
    ).className = `ti ti-${icon}`;

    const statusEl = overlay.querySelector(
      '.notification-detail-status'
    );

    statusEl.textContent = notification.read
      ? 'Lida'
      : 'Não lida';

    statusEl.classList.toggle(
      'unread',
      !notification.read
    );

    overlay.querySelector(
      '.notification-detail-title'
    ).textContent = notification.title;

    overlay.querySelector(
      '.notification-detail-date'
    ).textContent = formatDate(notification.createdAt);

    overlay.querySelector(
      '.notification-detail-message'
    ).textContent =
      notification.message ||
      'Esta notificação não possui descrição.';

    overlay.classList.add('open');

    // Fecha o popover do sino, caso esteja aberto
    document
      .querySelector('.notification-popover')
      ?.classList.remove('open');

    if (!notification.read) {
      await markOneRead(
        notification.id,
        notification.source
      );
    }
  }

  function handleNotificationClick(event) {

    // Clique no botão de excluir tem prioridade e não deve
    // abrir o modal de detalhes da notificação.
    const deleteButton = event.target.closest(
      '[data-notification-delete]'
    );

    if (deleteButton) {

      event.stopPropagation();

      const id = deleteButton.dataset.notificationDelete;

      const item = getAll().find(
        n => String(n.id) === String(id)
      );

      if (!item) {
        return;
      }

      // Só exclui depois que o usuário confirmar.
      confirmNotificationDeletion().then(confirmed => {
        if (!confirmed) {
          return;
        }

        removeNotification(id, item.source);
      });

      return;
    }

    const card = event.target.closest(
      '[data-notification-id]'
    );

    if (!card) {
      return;
    }

    const id = card.dataset.notificationId;

    const item = getAll().find(
      n => String(n.id) === String(id)
    );

    if (!item) {
      return;
    }

    openNotification(item);
  }

  // =========================================================
  // PERMISSÃO DE NOTIFICAÇÕES
  // =========================================================

  async function requestPermission() {

    if (!('Notification' in window)) {
      return 'unsupported';
    }

    try {
      return await Notification.requestPermission();
    } catch {
      return 'denied';
    }
  }

  // =========================================================
  // SERVICE WORKER
  // =========================================================

  function ensureServiceWorker() {

    if (
      'serviceWorker' in navigator &&
      location.protocol !== 'file:'
    ) {

      navigator.serviceWorker
        .register('/sw.js')
        .then(registration => {

          console.log(
            '[notificações] Service Worker registrado:',
            registration.scope
          );

        })
        .catch(error => {

          console.warn(
            '[notificações] Erro ao registrar Service Worker:',
            error
          );

        });
    }
  }

  // =========================================================
  // RENDERIZAR LISTA DA PÁGINA
  // =========================================================

  function renderPageList() {

    const host =
      document.querySelector(
        '[data-notifications-list]'
      );

    if (!host) {
      return;
    }

    // Conecta o clique apenas uma vez, já que o host
    // é reaproveitado a cada nova renderização.
    if (!host.dataset.notificationsBound) {
      host.addEventListener('click', handleNotificationClick);
      host.dataset.notificationsBound = '1';
    }

    const items = getAll();

    if (!items.length) {

      host.innerHTML = `
        <div class="empty-state">
          <i class="ti ti-bell-off"></i>
          <span>Nenhuma notificação recente</span>
        </div>
      `;

      return;
    }

    host.innerHTML = items
      .map(n => {

        const icon =
          n.type === 'calendar'
            ? 'calendar-event'
            : 'bell';

        return `
          <article
            class="notification-card ${n.read ? '' : 'unread'}"
            data-notification-id="${escapeHtml(n.id)}"
          >

            <div class="notification-card-icon">
              <i class="ti ti-${icon}"></i>
            </div>

            <div class="notification-card-content">

              <h3>
                ${escapeHtml(n.title)}
              </h3>

              <p>
                ${escapeHtml(n.message)}
              </p>

              <time>
                ${formatDate(n.createdAt)}
              </time>

            </div>

            <button
              type="button"
              class="notification-card-delete"
              data-notification-delete="${escapeHtml(n.id)}"
              aria-label="Excluir notificação"
              title="Excluir notificação"
            >
              <i class="ti ti-trash"></i>
            </button>

          </article>
        `;

      })
      .join('');
  }

  // =========================================================
  // SINO DE NOTIFICAÇÕES
  // =========================================================

  function mountBell() {

    if (
      document.querySelector(
        '.notification-fab'
      )
    ) {
      return;
    }

    const role = getRole();

    const home =
      `${role}-home.html`;

    // -------------------------------------------------------
    // BOTÃO
    // -------------------------------------------------------

    const button =
      document.createElement('button');

    button.className =
      'notification-fab';

    button.type = 'button';

    button.setAttribute(
      'aria-label',
      'Abrir notificações'
    );

    button.innerHTML = `
      <i class="ti ti-bell"></i>
      <span class="notification-badge"></span>
    `;

    // -------------------------------------------------------
    // POPOVER
    // -------------------------------------------------------

    const pop =
      document.createElement('div');

    pop.className =
      'notification-popover';

    pop.innerHTML = `
      <div class="notification-popover-header">

        <strong>
          Notificações
        </strong>

        <a
          class="notification-popover-link"
          href="${home}"
        >
          Ver todas
        </a>

      </div>

      <div class="notification-preview-list"></div>
    `;

    document.body.append(
      button,
      pop
    );

    // Delegação de clique na lista do popover (o container
    // é reaproveitado; só o innerHTML muda a cada update()).
    pop
      .querySelector('.notification-preview-list')
      .addEventListener('click', handleNotificationClick);

    // -------------------------------------------------------
    // ATUALIZAR INTERFACE
    // -------------------------------------------------------

    const update = () => {

      const items =
        getAll();

      const unread =
        items.filter(
          n => !n.read
        ).length;

      const badge =
        button.querySelector(
          '.notification-badge'
        );

      if (badge) {

        badge.textContent =
          unread > 99
            ? '99+'
            : unread;

        badge.classList.toggle(
          'show',
          unread > 0
        );
      }

      const preview =
        pop.querySelector(
          '.notification-preview-list'
        );

      if (!preview) {
        return;
      }

      if (!items.length) {

        preview.innerHTML = `
          <div class="notification-preview-empty">
            Nenhuma notificação
          </div>
        `;

      } else {

        preview.innerHTML =
          items
            .slice(0, 4)
            .map(n => `
              <div
                class="notification-preview-item ${n.read ? '' : 'unread'}"
                data-notification-id="${escapeHtml(n.id)}"
              >

                <i class="ti ti-bell"></i>

                <div class="notification-preview-item-text">

                  <strong>
                    ${escapeHtml(n.title)}
                  </strong>

                  <span>
                    ${escapeHtml(n.message)}
                  </span>

                </div>

                <button
                  type="button"
                  class="notification-preview-delete"
                  data-notification-delete="${escapeHtml(n.id)}"
                  aria-label="Excluir notificação"
                  title="Excluir notificação"
                >
                  <i class="ti ti-x"></i>
                </button>

              </div>
            `)
            .join('');
      }

      renderPageList();
    };

    // -------------------------------------------------------
    // ABRIR / FECHAR
    // -------------------------------------------------------

    button.addEventListener(
      'click',
      async event => {

        event.stopPropagation();

        const opened =
          pop.classList.toggle(
            'open'
          );

        /*
         * NÃO marcamos como lida automaticamente
         * ao abrir o sino.
         *
         * O usuário pode visualizar a notificação
         * e decidir depois marcar como lida.
         */

        if (opened) {
          await loadServerNotifications(false);
        }
      }
    );

    pop.addEventListener(
      'click',
      event => {
        event.stopPropagation();
      }
    );

    document.addEventListener(
      'click',
      () => {
        pop.classList.remove('open');
      }
    );

    window.addEventListener(
      'noctopus:notifications-changed',
      update
    );

    update();
  }

  // =========================================================
  // API PÚBLICA
  // =========================================================

  window.NoctopusNotifications = {

    getAll,

    add: addLocal,

    markAllRead,

    markOneRead,

    remove: removeNotification,

    clearAll,

    requestPermission,

    reload: loadServerNotifications

  };

  // =========================================================
  // INICIALIZAÇÃO
  // =========================================================

  document.addEventListener(
    'DOMContentLoaded',
    async () => {

      console.log(
        '[notificações] Inicializando central...'
      );

      ensureServiceWorker();

      mountBell();

      renderPageList();

      /*
       * Primeira busca no banco.
       */
      await loadServerNotifications(false);

      /*
       * Verifica novas notificações a cada 10 segundos.
       *
       * Antes estava em 30 segundos.
       */
      setInterval(
        () => {
          loadServerNotifications(true);
        },
        10000
      );

      // -----------------------------------------------------
      // MARCAR TODAS COMO LIDAS
      // -----------------------------------------------------

      document
        .querySelector(
          '[data-notification-read-all]'
        )
        ?.addEventListener(
          'click',
          markAllRead
        );

      // -----------------------------------------------------
      // LIMPAR
      // -----------------------------------------------------

      document
        .querySelector(
          '[data-notification-clear]'
        )
        ?.addEventListener(
          'click',
          clearAll
        );

      // -----------------------------------------------------
      // PERMISSÃO DO NAVEGADOR
      // -----------------------------------------------------

      document
        .querySelector(
          '[data-notification-permission]'
        )
        ?.addEventListener(
          'click',
          async event => {

            const result =
              await requestPermission();

            if (result === 'granted') {

              event.currentTarget.textContent =
                'Notificações do dispositivo ativadas';

              /*
               * Depois de conceder a permissão,
               * testamos a notificação.
               */

              await showDeviceNotification(
                'Notificações ativadas',
                'Você receberá avisos importantes do Noctopus.'
              );

            } else if (result === 'denied') {

              event.currentTarget.textContent =
                'Permissão bloqueada no navegador';

            } else {

              event.currentTarget.textContent =
                'Notificações indisponíveis';
            }
          }
        );

    }
  );

})();