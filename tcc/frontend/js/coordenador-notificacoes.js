(() => {
  const form = document.querySelector('[data-create-notification-form]');

  if (!form) return;


  // ==========================================================
  // ELEMENTOS DO FORMULÁRIO
  // ==========================================================

  const submit = form.querySelector('button[type="submit"]');

  // checkboxes: todos / professores / turmas / professor / turma
  const typeBoxes = Array.from(
    form.querySelectorAll('input[name="destino_tipo"]')
  );

  const summary = form.querySelector('[data-recipient-summary]');

  const SPECIFIC = {
    professor: {
      endpoint: '/professor',
      label: 'professor',
      panel: form.querySelector('[data-specific-panel="professor"]'),
      list: form.querySelector('[data-specific-list="professor"]'),
      loaded: false
    },
    turma: {
      endpoint: '/turmas',
      label: 'turma',
      panel: form.querySelector('[data-specific-panel="turma"]'),
      list: form.querySelector('[data-specific-list="turma"]'),
      loaded: false
    }
  };

  const box = value => typeBoxes.find(b => b.value === value);


  // ==========================================================
  // TOKEN / REQUISIÇÃO GET
  // ==========================================================

  function getToken() {
    return localStorage.getItem('token') || '';
  }

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

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(
        data?.error || data?.message || `Erro HTTP ${res.status}`
      );
    }

    return data;
  }


  // ==========================================================
  // ALERTA (SweetAlert se existir)
  // ==========================================================

  async function aviso(title, text) {

    if (window.Swal) {
      await Swal.fire({ icon: 'warning', title, text });
    } else {
      alert(text);
    }
  }


  // ==========================================================
  // CARREGAR LISTA DE PROFESSORES / TURMAS
  // ==========================================================

  function extrairLista(response) {

    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.professores)) return response.professores;
    if (Array.isArray(response?.turmas)) return response.turmas;

    return [];
  }

  function rotulo(type, item) {

    if (type === 'professor') {
      return (item.nome || `Professor ${item.id}`) +
        (item.admin ? ' (Coordenador)' : '');
    }

    return `${item.nome || 'Turma'}${item.ano ? ` - ${item.ano}º ano` : ''}`;
  }

  async function carregarLista(type) {

    const cfg = SPECIFIC[type];

    if (cfg.loaded) return;

    cfg.list.innerHTML =
      '<span class="recipient-empty">Carregando...</span>';

    try {

      const list = extrairLista(await api(cfg.endpoint));

      if (!list.length) {
        cfg.list.innerHTML =
          '<span class="recipient-empty">Nenhum destinatário encontrado</span>';
        return;
      }

      cfg.list.innerHTML = '';

      list.forEach(item => {

        const label = document.createElement('label');
        label.className = 'recipient-item';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = String(item.id);
        input.dataset.specificItem = type;

        const text = document.createElement('span');
        text.textContent = rotulo(type, item);

        label.append(input, text);
        cfg.list.appendChild(label);
      });

      cfg.loaded = true;

    } catch (err) {

      console.error('[notificações] Erro ao carregar destinatários:', err);

      cfg.list.innerHTML =
        '<span class="recipient-empty">Erro ao carregar</span>';
    }
  }

  function itensMarcados(type) {
    return Array.from(
      SPECIFIC[type].list.querySelectorAll('input[data-specific-item]:checked')
    );
  }


  // ==========================================================
  // ATUALIZAR TELA CONFORME A SELEÇÃO
  // ==========================================================

  function atualizarResumo() {

    const todos = box('todos').checked;
    const partes = [];

    if (todos) {
      partes.push('todos os usuários');
    } else {

      if (box('professores').checked) partes.push('todos os professores');
      if (box('turmas').checked) partes.push('todas as turmas');

      if (box('professor').checked) {
        const n = itensMarcados('professor').length;
        if (n) partes.push(`${n} professor${n > 1 ? 'es' : ''}`);
      }

      if (box('turma').checked) {
        const n = itensMarcados('turma').length;
        if (n) partes.push(`${n} turma${n > 1 ? 's' : ''}`);
      }
    }

    summary.textContent = partes.length
      ? `Será enviada para: ${partes.join(', ')}.`
      : 'Nenhum destinatário selecionado.';
  }

  function atualizarFormulario() {

    const todos = box('todos').checked;

    // "Todos" já inclui qualquer outro destino
    typeBoxes.forEach(b => {
      if (b.value === 'todos') return;

      if (todos) b.checked = false;
      b.disabled = todos;
    });

    Object.keys(SPECIFIC).forEach(type => {

      const ativo = box(type).checked;

      SPECIFIC[type].panel.hidden = !ativo;

      if (ativo) carregarLista(type);
    });

    atualizarResumo();
  }

  typeBoxes.forEach(b => b.addEventListener('change', atualizarFormulario));

  // marcar/desmarcar um professor ou turma individual
  form.addEventListener('change', event => {
    if (event.target.matches('input[data-specific-item]')) {
      atualizarResumo();
    }
  });

  // botões "Marcar todos" / "Limpar"
  form.addEventListener('click', event => {

    const btn = event.target.closest('[data-select-all], [data-select-none]');

    if (!btn) return;

    const type = btn.dataset.selectAll || btn.dataset.selectNone;
    const marcar = btn.hasAttribute('data-select-all');

    SPECIFIC[type].list
      .querySelectorAll('input[data-specific-item]')
      .forEach(i => { i.checked = marcar; });

    atualizarResumo();
  });


  // ==========================================================
  // MONTAR LISTA DE DESTINOS PARA O ENVIO
  // ==========================================================

  /*
   * Retorna { destinos } ou { erro: { title, text } }
   *
   * Exemplo de destinos:
   *   [
   *     { destino_tipo: 'professores' },
   *     { destino_tipo: 'professor', destino_id: 3 },
   *     { destino_tipo: 'professor', destino_id: 7 },
   *     { destino_tipo: 'turma', destino_id: 2 }
   *   ]
   */
  function montarDestinos() {

    if (box('todos').checked) {
      return { destinos: [{ destino_tipo: 'todos' }] };
    }

    const destinos = [];

    ['professores', 'turmas'].forEach(tipo => {
      if (box(tipo).checked) destinos.push({ destino_tipo: tipo });
    });

    for (const type of ['professor', 'turma']) {

      if (!box(type).checked) continue;

      const marcados = itensMarcados(type);

      if (!marcados.length) {
        return {
          erro: {
            title: 'Destinatário não selecionado',
            text: type === 'professor'
              ? 'Marque ao menos um professor ou desmarque "Professores específicos".'
              : 'Marque ao menos uma turma ou desmarque "Turmas específicas".'
          }
        };
      }

      marcados.forEach(i => {
        destinos.push({
          destino_tipo: type,
          destino_id: Number(i.value)
        });
      });
    }

    if (!destinos.length) {
      return {
        erro: {
          title: 'Destinatário não selecionado',
          text: 'Selecione ao menos um destinatário.'
        }
      };
    }

    return { destinos };
  }


  // ==========================================================
  // ENVIO DA NOTIFICAÇÃO
  // ==========================================================

  form.addEventListener('submit', async event => {

    event.preventDefault();

    // evitar duplo envio
    if (submit.disabled) return;

    const formData = new FormData(form);

    const titulo = String(formData.get('titulo') || '').trim();
    const mensagem = String(formData.get('mensagem') || '').trim();

    if (!titulo) {
      return aviso('Título obrigatório', 'Informe o título da notificação.');
    }

    if (!mensagem) {
      return aviso('Mensagem obrigatória', 'Informe a mensagem da notificação.');
    }

    const { destinos, erro } = montarDestinos();

    if (erro) {
      return aviso(erro.title, erro.text);
    }

    const body = {
      titulo,
      mensagem,
      tipo: 'info',
      destinos
    };

    submit.disabled = true;

    const originalHTML = submit.innerHTML;

    submit.textContent = 'Enviando...';

    try {

      const token = getToken();

      const headers = { 'Content-Type': 'application/json' };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      console.log('[notificações] Enviando:', body);

      const response = await fetch('/notificacoes', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        cache: 'no-store'
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error || data?.message || `Erro HTTP ${response.status}`
        );
      }

      console.log('[notificações] Criada com sucesso:', data);

      // limpar formulário
      form.reset();

      Object.values(SPECIFIC).forEach(cfg => {
        cfg.list
          .querySelectorAll('input[data-specific-item]')
          .forEach(i => { i.checked = false; });
      });

      atualizarFormulario();

      // atualizar central de notificações
      if (
        window.NoctopusNotifications &&
        typeof window.NoctopusNotifications.reload === 'function'
      ) {
        await window.NoctopusNotifications.reload(false);
      }

      if (window.Swal) {

        await Swal.fire({
          icon: 'success',
          title: 'Notificação enviada!',
          text: 'A notificação foi salva e será exibida aos destinatários.',
          timer: 1800,
          showConfirmButton: false
        });

      } else {
        alert('Notificação enviada com sucesso!');
      }

    } catch (err) {

      console.error('[notificações] Erro ao enviar:', err);

      const text = err.message || 'Não foi possível enviar a notificação.';

      if (window.Swal) {
        Swal.fire({ icon: 'error', title: 'Erro', text });
      } else {
        alert(text);
      }

    } finally {

      submit.disabled = false;
      submit.innerHTML = originalHTML;
    }
  });


  // ==========================================================
  // INICIALIZAÇÃO
  // ==========================================================

  atualizarFormulario();

})();
