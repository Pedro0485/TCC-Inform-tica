// ============================================================
// NOCTOPUS - SERVICE WORKER
// ============================================================

// ------------------------------------------------------------
// INSTALAÇÃO
// ------------------------------------------------------------

self.addEventListener('install', event => {
  console.log('[SW] Service Worker instalado');

  self.skipWaiting();
});


// ------------------------------------------------------------
// ATIVAÇÃO
// ------------------------------------------------------------

self.addEventListener('activate', event => {
  console.log('[SW] Service Worker ativado');

  event.waitUntil(
    self.clients.claim()
  );
});


// ------------------------------------------------------------
// RECEBER PUSH
// ------------------------------------------------------------

self.addEventListener('push', event => {

  console.log('[SW] Push recebido');


  let data = {};


  // ----------------------------------------------------------
  // Tentar interpretar os dados enviados pelo servidor
  // ----------------------------------------------------------

  try {

    if (event.data) {
      data = event.data.json();
    }

  } catch (error) {

    console.warn(
      '[SW] Push não estava em JSON. Tentando texto...'
    );

    try {

      data = {
        title: 'Nova notificação',
        message: event.data?.text() || ''
      };

    } catch (_) {

      data = {
        title: 'Nova notificação',
        message: ''
      };

    }
  }


  // ----------------------------------------------------------
  // Dados da notificação
  // ----------------------------------------------------------

  const title =
    data.title ||
    data.titulo ||
    'Nova notificação';


  const message =
    data.message ||
    data.mensagem ||
    'Você recebeu uma nova notificação.';


  const url =
    data.url ||
    data.link ||
    '/';


  // ----------------------------------------------------------
  // Opções
  // ----------------------------------------------------------

  const options = {

    body: message,

    icon:
      data.icon ||
      '/assets/images/logo.png',

    badge:
      data.badge ||
      '/assets/images/logo.png',

    tag:
      data.tag ||
      `noctopus-${Date.now()}`,

    renotify: true,

    data: {
      url: url
    }

  };


  // ----------------------------------------------------------
  // Mostrar notificação
  // ----------------------------------------------------------

  event.waitUntil(

    self.registration.showNotification(
      title,
      options
    )

  );

});


// ------------------------------------------------------------
// CLIQUE NA NOTIFICAÇÃO
// ------------------------------------------------------------

self.addEventListener(
  'notificationclick',
  event => {

    event.notification.close();


    const url =
      event.notification?.data?.url ||
      '/';


    event.waitUntil(

      clients
        .matchAll({
          type: 'window',
          includeUncontrolled: true
        })
        .then(clientList => {

          // --------------------------------------------------
          // Procurar uma janela do site já aberta
          // --------------------------------------------------

          for (const client of clientList) {

            if (
              'focus' in client
            ) {

              /*
               * Se tivermos uma URL específica,
               * tentamos navegar para ela.
               */

              if (
                url &&
                url !== '/' &&
                'navigate' in client
              ) {

                return client
                  .navigate(url)
                  .then(() => client.focus());

              }

              return client.focus();
            }
          }


          // --------------------------------------------------
          // Nenhuma janela aberta
          // --------------------------------------------------

          if (
            clients.openWindow
          ) {

            return clients.openWindow(url);

          }

        })

    );

  }
);


// ------------------------------------------------------------
// FECHAR / RECEBER NOTIFICAÇÃO
// ------------------------------------------------------------

self.addEventListener(
  'notificationclose',
  event => {

    console.log(
      '[SW] Notificação fechada'
    );

  }
);