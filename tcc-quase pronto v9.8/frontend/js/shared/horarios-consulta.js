// Consulta (somente leitura) dos horários gravados. Usado por aluno, professor e coordenadora.
// Todo texto vem do banco (originado de OCR de PDF): entra na página só por textContent.
(function () {
  const DIAS = { segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado' };
  const ORDEM = Object.keys(DIAS);

  function el(tag, cls, texto) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }
  async function buscar(rota) {
    const res = await fetch(rota, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    if (res.status === 401) { window.location.href = '/index.html'; throw new Error('auth'); }
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(corpo.error || 'Não foi possível carregar os horários');
    return corpo;
  }

  // modo "turma": mostra o(s) professor(es); modo "professor": mostra a turma
  function grade(aulas, modo) {
    const dias = ORDEM.filter((d, i) => i < 5 || aulas.some((a) => a.dia_semana === d));
    const faixas = [...new Set(aulas.map((a) => `${a.hora_inicio}|${a.hora_fim}`))].sort();
    const tab = el('table', 'hc-grade');
    const cab = el('tr'); cab.append(el('th', '', 'Horário'));
    dias.forEach((d) => cab.append(el('th', '', DIAS[d])));
    const cabecalho = el('thead'); cabecalho.append(cab); tab.append(cabecalho);
    const corpo = el('tbody');
    faixas.forEach((f) => {
      const [ini, fim] = f.split('|');
      const tr = el('tr'); tr.append(el('th', 'hc-hora', `${ini} – ${fim}`));
      dias.forEach((d) => {
        const doDia = aulas.filter((a) => a.dia_semana === d && a.hora_inicio === ini && a.hora_fim === fim);
        const td = el('td', doDia.length ? 'hc-aula' : 'hc-vazia');
        doDia.forEach((a) => {
          const bloco = el('div', 'hc-bloco');
          bloco.append(el('div', 'hc-mat', a.materia));
          bloco.append(el('div', 'hc-sub', modo === 'professor' ? `${a.turma_ano}º ${a.turma_nome}` : (a.professores.map((p) => p.nome).join(', ') || 'sem professor')));
          td.append(bloco);
        });
        tr.append(td);
      });
      corpo.append(tr);
    });
    tab.append(corpo);
    const wrap = el('div', 'hc-wrap'); wrap.append(tab); return wrap;
  }

  async function montar({ alvo, rota, modo }) {
    const raiz = typeof alvo === 'string' ? document.querySelector(alvo) : alvo;
    raiz.replaceChildren(el('p', 'hc-msg', 'Carregando horários…'));
    try {
      let d;
      try {
        d = await buscar(rota);
        const p = JSON.parse(atob((localStorage.getItem('token') || '').split('.')[1] || 'e30'));
        localStorage.setItem(`noctopus_grade_${p.tipo}_${p.id}`, JSON.stringify({ data: d, salvaEm: Date.now() }));
      } catch (onlineError) {
        const p = JSON.parse(atob((localStorage.getItem('token') || '').split('.')[1] || 'e30'));
        const saved = localStorage.getItem(`noctopus_grade_${p.tipo}_${p.id}`);
        if (!saved) throw onlineError;
        d = JSON.parse(saved).data;
        raiz.append(el('p', 'hc-msg', 'Sem conexão: exibindo o último horário salvo neste aparelho.'));
      }
      raiz.replaceChildren();
      const titulo = d.turma ? `${d.turma.ano}º ${d.turma.nome} (${d.turma.turno})` : d.professor.nome;
      raiz.append(el('h3', 'hc-titulo', titulo));
      if (!d.aulas.length) { const v = el('div', 'hc-vazio'); v.append(el('i', 'ti ti-calendar-off'), el('span', '', 'Nenhum horário cadastrado ainda.')); raiz.append(v); return; }
      raiz.append(grade(d.aulas, modo));
    } catch (err) {
      if (err.message !== 'auth') raiz.replaceChildren(el('p', 'hc-msg erro', err.message));
    }
  }
  window.HorariosConsulta = { montar };
})();
