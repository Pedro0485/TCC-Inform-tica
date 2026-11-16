// Mostra o nome do professor/coordenador ou a turma do aluno no topo da barra lateral.
(function () {
  function lerToken() {
    try {
      const parte = (localStorage.getItem('token') || '').split('.')[1];
      if (!parte) return null;
      const b64 = parte.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(atob(b64).split('').map((c) =>
        '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
      return JSON.parse(json);
    } catch { return null; }
  }

  function aplicar(nome, guardar = true) {
    const limpo = String(nome || '').trim();
    if (!limpo) return;
    document.querySelectorAll('.sidebar .logo span').forEach((span) => {
      span.textContent = limpo;
      span.title = limpo;
      span.style.overflow = 'hidden';
      span.style.textOverflow = 'ellipsis';
      span.style.whiteSpace = 'nowrap';
      span.style.minWidth = '0';
    });
    document.querySelectorAll('.sidebar .logo').forEach((l) => { l.style.minWidth = '0'; });
    if (guardar) {
      try { localStorage.setItem('usuarioNome', limpo); } catch {}
    }
  }

  window.atualizarNomeSidebar = aplicar;

  const payload = lerToken();
  if (!payload) return;

  if (payload.tipo === 'turma') {
    let info = {};
    try { info = JSON.parse(localStorage.getItem('turmaInfo') || '{}'); } catch {}
    const nome = String(payload.nome || info.turma || '').trim();
    const slug = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const nomesTurma = {
      info: 'Inform\u00e1tica', informatica: 'Inform\u00e1tica', info_t: 'Inform\u00e1tica',
      edf: 'Edifica\u00e7\u00f5es', edificacoes: 'Edifica\u00e7\u00f5es', edf_t: 'Edifica\u00e7\u00f5es',
      meca: 'Mecatr\u00f4nica', mecatronica: 'Mecatr\u00f4nica', meca_t: 'Mecatr\u00f4nica',
      adm: 'Administra\u00e7\u00e3o', administracao: 'Administra\u00e7\u00e3o', adm_t: 'Administra\u00e7\u00e3o',
      dse: 'Desenvolvimento de Sistemas', desenvolvimento_de_sistemas: 'Desenvolvimento de Sistemas', dse_t: 'Desenvolvimento de Sistemas', des_sistemas_t: 'Desenvolvimento de Sistemas', des_sist_t: 'Desenvolvimento de Sistemas',
      mkt: 'Marketing', marketing: 'Marketing', mkt_t: 'Marketing',
      mecanica: 'Mec\u00e2nica', recursos_humanos: 'Recursos Humanos',
    };
    const curso = nomesTurma[slug] || nome.replace(/_/g, ' ').replace(/^./, (letra) => letra.toLocaleUpperCase('pt-BR'));
    const ano = Number(payload.ano || info.ano);
    aplicar(ano ? `${ano}\u00ba ${curso}` : curso, false);
    return;
  }

  if (payload.tipo !== 'professor') return;

  // 1) mostra já o nome guardado/do token (sem esperar a rede)
  aplicar(localStorage.getItem('usuarioNome') || payload.nome);

  // 2) confirma com o servidor (pega nome alterado em Configurações)
  fetch('/professor/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
    .then((r) => (r.ok ? r.json() : null))
    .then((p) => { if (p && p.nome) aplicar(p.nome); })
    .catch(() => {});
})();
