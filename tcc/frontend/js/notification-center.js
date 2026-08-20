(() => {
  const LOCAL_KEY = 'noctopus_notifications_local_v1';
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

      serverItems = items
        .map(n => normalizeNotification(n, 'server'))
        .filter(Boolean);

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
  // LIMPAR NOTIFICAÇÕES LOCAIS
  // =========================================================

  function clearLocal() {
    saveLocal([]);
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
              >

                <i class="ti ti-bell"></i>

                <div>

                  <strong>
                    ${escapeHtml(n.title)}
                  </strong>

                  <span>
                    ${escapeHtml(n.message)}
                  </span>

                </div>

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

    clearAll: clearLocal,

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
          clearLocal
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