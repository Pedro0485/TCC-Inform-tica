(() => {
  const form = document.querySelector(
    '[data-create-notification-form]'
  );

  if (!form) return;


  // ==========================================================
  // ELEMENTOS DO FORMULÁRIO
  // ==========================================================

  const target = form.querySelector(
    '[name="destino_tipo"]'
  );

  const specificWrap = form.querySelector(
    '[data-specific-target-wrap]'
  );

  const specific = form.querySelector(
    '[name="destino_id"]'
  );

  const submit = form.querySelector(
    'button[type="submit"]'
  );


  // ==========================================================
  // TOKEN
  // ==========================================================

  function getToken() {
    return localStorage.getItem('token') || '';
  }


  // ==========================================================
  // REQUISIÇÃO GET
  // ==========================================================

  async function api(url) {

    const token = getToken();

    const headers = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      cache: 'no-store'
    });


    const data =
      await res.json().catch(() => null);


    if (!res.ok) {

      throw new Error(
        data?.error ||
        data?.message ||
        `Erro HTTP ${res.status}`
      );

    }


    return data;
  }


  // ==========================================================
  // ATUALIZAR DESTINATÁRIO ESPECÍFICO
  // ==========================================================

  async function updateSpecific() {

    const type = target.value;


    // --------------------------------------------------------
    // TODOS / PROFESSORES / TURMAS
    // --------------------------------------------------------

    if (
      !['professor', 'turma'].includes(type)
    ) {

      specificWrap.hidden = true;

      specific.required = false;

      specific.innerHTML = '';

      return;
    }


    // --------------------------------------------------------
    // DESTINATÁRIO ESPECÍFICO
    // --------------------------------------------------------

    specificWrap.hidden = false;

    specific.required = true;

    specific.innerHTML = `
      <option value="">
        Carregando...
      </option>
    `;


    try {

      const endpoint =
        type === 'professor'
          ? '/professor'
          : '/turmas';


      const response =
        await api(endpoint);


      /*
       * A API pode retornar diretamente um array
       * ou um objeto contendo os dados.
       */

      let list = [];

      if (Array.isArray(response)) {

        list = response;

      } else if (
        Array.isArray(response?.data)
      ) {

        list = response.data;

      } else if (
        Array.isArray(response?.professores)
      ) {

        list = response.professores;

      } else if (
        Array.isArray(response?.turmas)
      ) {

        list = response.turmas;
      }


      // ------------------------------------------------------
      // SELECT
      // ------------------------------------------------------

      if (!list.length) {

        specific.innerHTML = `
          <option value="">
            Nenhum destinatário encontrado
          </option>
        `;

        return;
      }


      specific.innerHTML = `
        <option value="">
          Selecione...
        </option>
      `;


      list.forEach(item => {

        const option =
          document.createElement('option');


        option.value =
          String(item.id);


        if (type === 'professor') {

          option.textContent =
            (item.nome || `Professor ${item.id}`) +
            (item.admin ? ' (Coordenador)' : '');

        } else {

          option.textContent =
            `${item.nome || 'Turma'}${
              item.ano
                ? ` - ${item.ano}º ano`
                : ''
            }`;
        }


        specific.appendChild(option);

      });


    } catch (err) {

      console.error(
        '[notificações] Erro ao carregar destinatários:',
        err
      );


      specific.innerHTML = `
        <option value="">
          Erro ao carregar
        </option>
      `;
    }
  }


  // ==========================================================
  // ALTERAÇÃO DO DESTINO
  // ==========================================================

  target.addEventListener(
    'change',
    updateSpecific
  );


  // ==========================================================
  // ENVIO DA NOTIFICAÇÃO
  // ==========================================================

  form.addEventListener(
    'submit',
    async event => {

      event.preventDefault();


      // ------------------------------------------------------
      // EVITAR DUPLO ENVIO
      // ------------------------------------------------------

      if (submit.disabled) {
        return;
      }


      // ------------------------------------------------------
      // FORM DATA
      // ------------------------------------------------------

      const formData =
        new FormData(form);


      const body =
        Object.fromEntries(
          formData.entries()
        );


      // ------------------------------------------------------
      // LIMPAR DADOS
      // ------------------------------------------------------

      body.titulo =
        String(body.titulo || '').trim();

      body.mensagem =
        String(body.mensagem || '').trim();

      body.destino_tipo =
        String(body.destino_tipo || '').trim();

      body.tipo =
        String(body.tipo || 'info').trim();


      // ------------------------------------------------------
      // DESTINO ESPECÍFICO
      // ------------------------------------------------------

      if (
        ['professor', 'turma'].includes(
          body.destino_tipo
        )
      ) {

        if (!body.destino_id) {

          const mensagem =
            'Selecione o destinatário específico.';

          if (window.Swal) {

            await Swal.fire({
              icon: 'warning',
              title: 'Destinatário não selecionado',
              text: mensagem
            });

          } else {

            alert(mensagem);

          }

          return;
        }


        /*
         * Envia como número para o backend.
         */

        body.destino_id =
          Number(body.destino_id);


      } else {

        /*
         * Para "todos", "professores" ou "turmas",
         * não precisamos enviar destino_id.
         */

        delete body.destino_id;
      }


      // ------------------------------------------------------
      // VALIDAÇÃO
      // ------------------------------------------------------

      if (!body.titulo) {

        const mensagem =
          'Informe o título da notificação.';

        if (window.Swal) {

          await Swal.fire({
            icon: 'warning',
            title: 'Título obrigatório',
            text: mensagem
          });

        } else {

          alert(mensagem);

        }

        return;
      }


      if (!body.mensagem) {

        const mensagem =
          'Informe a mensagem da notificação.';

        if (window.Swal) {

          await Swal.fire({
            icon: 'warning',
            title: 'Mensagem obrigatória',
            text: mensagem
          });

        } else {

          alert(mensagem);

        }

        return;
      }


      // ------------------------------------------------------
      // BOTÃO
      // ------------------------------------------------------

      submit.disabled = true;

      const originalText =
        submit.textContent;

      submit.textContent =
        'Enviando...';


      try {

        // ====================================================
        // POST
        // ====================================================

        const token =
          getToken();


        const headers = {
          'Content-Type':
            'application/json'
        };


        if (token) {

          headers.Authorization =
            `Bearer ${token}`;

        }


        console.log(
          '[notificações] Enviando:',
          body
        );


        const response =
          await fetch(
            '/notificacoes',
            {
              method: 'POST',

              headers,

              body:
                JSON.stringify(body),

              cache: 'no-store'
            }
          );


        const data =
          await response
            .json()
            .catch(() => null);


        // ====================================================
        // ERRO
        // ====================================================

        if (!response.ok) {

          throw new Error(
            data?.error ||
            data?.message ||
            `Erro HTTP ${response.status}`
          );
        }


        console.log(
          '[notificações] Criada com sucesso:',
          data
        );


        // ====================================================
        // LIMPAR FORMULÁRIO
        // ====================================================

        form.reset();

        await updateSpecific();


        // ====================================================
        // ATUALIZAR CENTRAL
        // ====================================================

        if (
          window.NoctopusNotifications &&
          typeof window.NoctopusNotifications.reload ===
            'function'
        ) {

          await window.NoctopusNotifications.reload(
            false
          );
        }


        // ====================================================
        // FEEDBACK
        // ====================================================

        if (window.Swal) {

          await Swal.fire({

            icon: 'success',

            title:
              'Notificação enviada!',

            text:
              'A notificação foi salva e será exibida aos destinatários.',

            timer: 1800,

            showConfirmButton: false

          });

        } else {

          alert(
            'Notificação enviada com sucesso!'
          );

        }


      } catch (err) {

        console.error(
          '[notificações] Erro ao enviar:',
          err
        );


        if (window.Swal) {

          Swal.fire({

            icon: 'error',

            title: 'Erro',

            text:
              err.message ||
              'Não foi possível enviar a notificação.'

          });

        } else {

          alert(
            err.message ||
            'Não foi possível enviar a notificação.'
          );

        }


      } finally {

        submit.disabled = false;

        submit.textContent =
          originalText ||
          'Enviar notificação';

      }

    }
  );


  // ==========================================================
  // INICIALIZAÇÃO
  // ==========================================================

  updateSpecific();

})();