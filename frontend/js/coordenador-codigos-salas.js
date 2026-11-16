(() => {
  const API_URL = '/turmas';
  const token = localStorage.getItem('token') || '';
  const corpo = document.getElementById('codes-table-body');
  const status = document.getElementById('codes-status');
  const busca = document.getElementById('codes-search-input');
  let turmas = [];

  function setStatus(texto, erro = false) {
    status.textContent = texto;
    status.classList.toggle('is-error', erro);
  }

  function nomeTurno(turno) {
    return ({ matutino: 'Matutino', integral: 'Integral', vespertino: 'Vespertino', noturno: 'Noturno' })[turno] || turno;
  }

  function criarCelula(texto, classe) {
    const td = document.createElement('td');
    if (classe) td.className = classe;
    td.textContent = texto == null ? '' : String(texto);
    return td;
  }

  async function copiarCodigo(codigo, botao) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(codigo);
      } else {
        const input = document.createElement('textarea');
        input.value = codigo;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const copiou = document.execCommand('copy');
        input.remove();
        if (!copiou) throw new Error('Cópia não disponível neste navegador.');
      }
      const textoOriginal = botao.innerHTML;
      botao.innerHTML = '<i class="ti ti-check"></i><span>Copiado</span>';
      window.setTimeout(() => { botao.innerHTML = textoOriginal; }, 1300);
    } catch (err) {
      if (window.Swal) {
        await Swal.fire({ icon: 'info', title: 'Código da turma', text: codigo, confirmButtonText: 'Fechar' });
      } else {
        window.prompt('Copie o código da turma:', codigo);
      }
    }
  }

  function renderizar() {
    const termo = busca.value.trim().toLocaleLowerCase('pt-BR');
    const filtradas = turmas.filter((turma) => {
      const campos = [turma.nome, `${turma.ano} ano`, nomeTurno(turma.turno), turma.codigo];
      return campos.some((campo) => String(campo || '').toLocaleLowerCase('pt-BR').includes(termo));
    });
    corpo.replaceChildren();

    for (const turma of filtradas) {
      const tr = document.createElement('tr');
      tr.appendChild(criarCelula(turma.nome, 'codes-turma'));
      tr.appendChild(criarCelula(`${turma.ano}º ano`));
      tr.appendChild(criarCelula(nomeTurno(turma.turno)));

      const codigoCell = document.createElement('td');
      const wrap = document.createElement('div');
      wrap.className = 'codes-code-cell';
      const codigo = document.createElement('code');
      codigo.textContent = String(turma.codigo || '');
      const copiar = document.createElement('button');
      copiar.type = 'button';
      copiar.className = 'codes-copy';
      copiar.setAttribute('aria-label', `Copiar código da turma ${turma.nome}, ${turma.ano}º ano`);
      copiar.innerHTML = '<i class="ti ti-copy"></i><span>Copiar</span>';
      copiar.addEventListener('click', () => copiarCodigo(String(turma.codigo || ''), copiar));
      wrap.append(codigo, copiar);
      codigoCell.appendChild(wrap);
      tr.appendChild(codigoCell);
      corpo.appendChild(tr);
    }

    setStatus(filtradas.length === turmas.length
      ? `${turmas.length} ${turmas.length === 1 ? 'turma cadastrada' : 'turmas cadastradas'}.`
      : `${filtradas.length} de ${turmas.length} turmas encontradas.`);
    if (filtradas.length === 0) setStatus(turmas.length ? 'Nenhuma turma corresponde à busca.' : 'Nenhuma turma cadastrada.');
  }

  async function carregarTurmas() {
    if (!token) {
      window.location.replace('/index.html');
      return;
    }
    try {
      const resposta = await fetch(API_URL, { headers: { Authorization: `Bearer ${token}` } });
      if (resposta.status === 401 || resposta.status === 403) {
        localStorage.removeItem('token');
        window.location.replace('/index.html');
        return;
      }
      if (!resposta.ok) throw new Error('Não foi possível carregar os códigos das salas.');
      const dados = await resposta.json();
      turmas = Array.isArray(dados) ? dados : [];
      renderizar();
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Erro ao carregar os códigos das salas.', true);
    }
  }

  busca.addEventListener('input', renderizar);
  carregarTurmas();
})();
