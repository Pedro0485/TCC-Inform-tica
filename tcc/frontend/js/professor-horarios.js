(function () {
  const DIAS = [
    ['segunda', 'Segunda-feira'], ['terca', 'Terça-feira'], ['quarta', 'Quarta-feira'],
    ['quinta', 'Quinta-feira'], ['sexta', 'Sexta-feira'],
  ];
  const box = document.getElementById('horarios-semana');

  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hm = (t) => String(t || '').slice(0, 5);
  const nomeTurma = (a) => `${a.turma_ano}º ${String(a.turma_nome || '').replace(/_/g, ' ')
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase())}`;

  function render(aulas) {
    box.innerHTML = DIAS.map(([chave, rotulo]) => {
      const lista = aulas.filter((a) => a.dia_semana === chave);
      const itens = lista.length
        ? lista.map((a) => `
          <div class="horarios-aula">
            <span class="horarios-hora">${hm(a.hora_inicio)} - ${hm(a.hora_fim)}</span>
            <strong>${esc(a.materia)}</strong>
            <span class="horarios-meta">Turma: ${esc(nomeTurma(a))}</span><br>
            <span class="horarios-meta">Sala: ${esc(nomeTurma(a))}</span>
          </div>`).join('')
        : '<div class="horarios-vazio">Sem aulas</div>';
      return `<div class="horarios-dia"><h3>${rotulo}</h3>${itens}</div>`;
    }).join('');
  }

  async function carregar() {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '/index.html'; return; }
    try {
      const res = await fetch('/professor/me/aulas', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401 || res.status === 403) { window.location.href = '/index.html'; return; }
      if (!res.ok) throw new Error();
      render(await res.json());
    } catch {
      if (!box.querySelector('.horarios-dia')) {
        box.innerHTML = '<div class="horarios-vazio">Não foi possível carregar os horários.</div>';
      }
    }
  }

  carregar();
  // reflete alterações feitas pela coordenação sem precisar recarregar a página
  setInterval(carregar, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); });
  window.addEventListener('focus', carregar);
})();
