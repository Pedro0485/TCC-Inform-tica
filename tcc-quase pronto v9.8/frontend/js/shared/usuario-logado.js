// Mostra o NOME de quem logou (coordenadora ou professor) no topo da barra lateral,
// no lugar do texto fixo "Coordenador" / "Professor".
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

  function aplicar(nome) {
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
    try { localStorage.setItem('usuarioNome', limpo); } catch {}
  }

  window.atualizarNomeSidebar = aplicar;

  const payload = lerToken();
  if (!payload || payload.tipo !== 'professor') return; // aluno (turma) continua como está

  // 1) mostra já o nome guardado/do token (sem esperar a rede)
  aplicar(localStorage.getItem('usuarioNome') || payload.nome);

  // 2) confirma com o servidor (pega nome alterado em Configurações)
  fetch('/professor/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
    .then((r) => (r.ok ? r.json() : null))
    .then((p) => { if (p && p.nome) aplicar(p.nome); })
    .catch(() => {});
})();
