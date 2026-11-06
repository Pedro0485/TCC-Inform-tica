// Painel de importação de horários (coordenadora).
// Fluxo: enviar PDF -> acompanhar a leitura -> CONFERIR (pré-visualização) -> confirmar.
// Todo texto vindo do PDF é dado NÃO confiável (OCR de documento externo): só entra na
// página por textContent (função el), nunca por innerHTML.
const API = '/importacoes/horarios';
const DIAS = { segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado' };
const ETAPAS_ROTULO = {
  envio_arquivo: 'Envio do arquivo', leitura_pdf: 'Leitura do PDF', comunicacao_servicos: 'Comunicação entre os serviços',
  validacao_dados: 'Validação dos dados', gravacao_banco: 'Gravação no banco de dados',
};
const MOTIVOS = {
  TEXTO_CORTADO_NA_ORIGEM: 'O texto está cortado no próprio PDF; a leitura pode estar incompleta.',
  BAIXA_CONFIANCA: 'A leitura do texto teve baixa confiança.',
  TEXTO_SUSPEITO: 'O nome da disciplina parece ter caracteres perdidos.',
  MARCADOR_GRUPO_SUSPEITO: 'O marcador de grupo (TA / TB) não ficou legível.',
  PROFESSOR_NAO_LIDO: 'Não foi possível ler o professor desta aula.',
};
const AVISOS = {
  HORARIOS_PARA_CONFERIR: 'Horários deduzidos da grade',
  PROFESSOR_EM_DUAS_TURMAS: 'Professor em duas turmas no mesmo horário',
  POSSIVEL_MESMO_PROFESSOR: 'Possível professor duplicado',
  DIA_NAO_CONFIRMADO_NO_CABECALHO: 'Dia da semana não confirmado',
};

const S = { id: null, dados: null, existentes: null, cadastros: null, criarNovas: false, turmas: {}, aulas: {}, renomes: {}, timer: null, arquivo: null };
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- utilidades
function el(tag, props = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) n.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) n.append(f.nodeType ? f : document.createTextNode(String(f)));
  return n;
}
const token = () => localStorage.getItem('token');
async function api(rota, opcoes = {}) {
  const res = await fetch(API + rota, { ...opcoes, headers: { Authorization: `Bearer ${token()}`, ...(opcoes.json ? { 'Content-Type': 'application/json' } : {}) },
    body: opcoes.json ? JSON.stringify(opcoes.json) : opcoes.body });
  if (res.status === 401 || res.status === 403) {
    await Swal.fire({ title: 'Sessão expirada', text: 'Faça login novamente.', icon: 'warning', heightAuto: false });
    window.location.href = '/index.html';
    throw new Error('auth');
  }
  let corpo = null;
  try { corpo = await res.json(); } catch (_) { /* resposta sem corpo */ }
  if (!res.ok) { const e = new Error((corpo && corpo.error) || 'Erro inesperado'); e.info = corpo || {}; e.status = res.status; throw e; }
  return corpo;
}
function mostrarErro(err) {
  const info = err.info || {};
  const caixa = $('hz-erro'); caixa.replaceChildren();
  caixa.append(el('strong', { text: info.etapa ? `Falha na etapa: ${ETAPAS_ROTULO[info.etapa] || info.etapa}` : 'Não foi possível concluir' }),
    el('p', { text: err.message }));
  if (Array.isArray(info.detalhes)) caixa.append(el('ul', {}, info.detalhes.slice(0, 12).map((d) => el('li', { text: d.mensagem }))));
  caixa.hidden = false; caixa.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
const limparErro = () => { $('hz-erro').hidden = true; };
function setEtapa(atual) {
  const ordem = ['leitura', 'conferencia', 'gravacao'];
  document.querySelectorAll('.hz-etapa').forEach((n) => {
    const i = ordem.indexOf(n.dataset.etapa);
    n.classList.toggle('ativa', i === ordem.indexOf(atual));
    n.classList.toggle('feita', atual === 'fim' || i < ordem.indexOf(atual));
  });
}
function carregando(botao, ligado, texto) {
  botao.disabled = ligado; botao.classList.toggle('carregando', ligado);
  if (texto) botao.querySelector('.hz-btn-txt').textContent = texto;
}
const novoTexto = (s) => String(s || '').trim().replace(/\s+/g, ' ');

// ---------------------------------------------------------------- envio
function escolherArquivo(arq) {
  limparErro();
  if (!arq) return;
  const drop = $('hz-drop');
  if (!/\.pdf$/i.test(arq.name)) { mostrarErro(Object.assign(new Error('Escolha um arquivo com extensão .pdf.'), { info: { etapa: 'envio_arquivo' } })); return; }
  S.arquivo = arq;
  drop.classList.add('com-arquivo');
  $('hz-drop-titulo').textContent = arq.name;
  $('hz-drop-info').textContent = `${(arq.size / 1024 / 1024).toFixed(2)} MB, pronto para ler`;
  $('btn-ler').disabled = false; $('btn-limpar').hidden = false;
}
function resetarEnvio() {
  S.arquivo = null; $('arquivo-pdf').value = ''; $('hz-drop').classList.remove('com-arquivo');
  $('hz-drop-titulo').textContent = 'Escolha o PDF ou arraste-o até aqui';
  $('hz-drop-info').textContent = 'Somente arquivos .pdf (até 20 MB)';
  $('btn-ler').disabled = true; $('btn-limpar').hidden = true; $('hz-progresso').hidden = true; carregando($('btn-ler'), false, 'Ler PDF');
}
async function enviar() {
  limparErro(); carregando($('btn-ler'), true, 'Enviando…');
  const form = new FormData(); form.append('arquivo', S.arquivo);
  try {
    const { id } = await api('', { method: 'POST', body: form });
    S.id = id; sessionStorage.setItem('hz_importacao', id);
    $('hz-progresso').hidden = false; setEtapa('leitura');
    acompanhar();
  } catch (err) { if (err.message !== 'auth') { mostrarErro(err); carregando($('btn-ler'), false, 'Ler PDF'); } }
}
function acompanhar() {
  clearTimeout(S.timer);
  const passo = async () => {
    try {
      const s = await api(`/${S.id}`);
      $('hz-barra').style.width = `${s.progresso || 0}%`; $('hz-msg').textContent = s.mensagem || 'Processando…';
      if (s.status === 'processando') { S.timer = setTimeout(passo, 1500); return; }
      if (s.status === 'pronta') { await abrirConferencia(); return; }
      if (s.status === 'falhou') {
        sessionStorage.removeItem('hz_importacao'); $('hz-progresso').hidden = true; setEtapa(null); carregando($('btn-ler'), false, 'Ler PDF');
        mostrarErro(Object.assign(new Error(s.erro_mensagem || 'A leitura falhou.'), { info: { etapa: s.etapa } })); return;
      }
      sessionStorage.removeItem('hz_importacao'); resetarEnvio();
    } catch (err) {
      if (err.status === 404) { sessionStorage.removeItem('hz_importacao'); resetarEnvio(); return; }
      if (err.message !== 'auth') { mostrarErro(Object.assign(err, { info: { etapa: 'comunicacao_servicos' } })); }
    }
  };
  passo();
}

// ---------------------------------------------------------------- conferência
async function abrirConferencia() {
  const p = await api(`/${S.id}/preview`);
  S.dados = p.dados; S.existentes = p.existentes; S.cadastros = p.cadastros;
  S.turmas = {}; S.aulas = {}; S.renomes = {}; S.criarNovas = true; $('opt-criar-turmas').checked = true;
  $('hz-progresso').hidden = true; $('card-envio').classList.add('recolhido');
  setEtapa('conferencia');
  $('hz-arquivo').textContent = p.importacao.nome_original;
  const rei = $('hz-reimport');
  if (p.ja_importado_antes) { rei.textContent = `Atenção: este mesmo arquivo já foi importado antes (importação nº ${p.ja_importado_antes.id}). As aulas existentes serão preservadas; horários idênticos serão reutilizados.`; rei.hidden = false; } else rei.hidden = true;
  $('card-conferencia').hidden = false; $('card-resultado').hidden = true;
  desenhar();
  $('card-conferencia').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const cTurma = (pagina) => (S.turmas[pagina] = S.turmas[pagina] || { linhas: {} });
const cAula = (t, a) => { const k = `${t.pagina}:${a.origem.linha}:${a.origem.coluna}`; return (S.aulas[k] = S.aulas[k] || {}); };
const nomeProf = (n) => S.renomes[n] || n;
function aulaResolvida(t, a) { const c = cAula(t, a); return !a.requer_revisao || c.conferido || c.excluir || c.materia !== undefined || c.professores !== undefined; }

function pendencias() {
  const itens = [];
  for (const t of S.dados.turmas) {
    const c = cTurma(t.pagina); if (c.ignorar) continue;
    const rot = t.titulo_original || `página ${t.pagina}`;
    if (!(c.nome || t.nome) || !(c.ano || t.ano)) itens.push(`${rot}: informe o ano e o nome da turma`);
    const info = S.existentes.turmas[t.pagina];
    const destino = c.turma_id || (info && info.existente);
    if (!destino && !S.criarNovas) itens.push(`${rot}: turma não cadastrada (escolha uma existente ou marque "criar turmas")`);
    if (!destino && S.criarNovas && !(c.turno || t.turno_sugerido)) itens.push(`${rot}: informe o turno`);
    if (t.horarios_para_conferir && !c.horariosConferidos && !Object.keys(c.linhas).length) itens.push(`${rot}: confira os horários da turma`);
    const n = t.aulas.filter((a) => !aulaResolvida(t, a)).length;
    if (n) itens.push(`${rot}: ${n} aula(s) para conferir`);
    for (const al of t.alertas) if (al.nivel === 'erro' && !['TITULO_ILEGIVEL', 'AULA_DUPLICADA', 'MATERIA_AUSENTE', 'MATERIA_LONGA', 'HORARIO_INVALIDO'].includes(al.codigo)) itens.push(`${rot}: ${al.mensagem} (ignore a página se não for possível corrigir)`);
  }
  return itens;
}
function atualizarPendencias() {
  const itens = pendencias(); const box = $('hz-pendencias');
  box.replaceChildren();
  if (!itens.length) { box.append(el('span', { class: 'hz-ok' }, el('i', { class: 'ti ti-circle-check' }), ' Tudo conferido. Você já pode importar.')); }
  else {
    box.append(el('span', { class: 'hz-pend' }, el('i', { class: 'ti ti-alert-triangle' }), ` ${itens.length} pendência(s) antes de importar`),
      el('ul', {}, itens.slice(0, 5).map((i) => el('li', { text: i })), itens.length > 5 ? el('li', { text: `…e mais ${itens.length - 5}` }) : null));
  }
  $('btn-importar').disabled = itens.length > 0;
  document.querySelectorAll('.hz-turma').forEach((d) => {
    const t = S.dados.turmas.find((x) => String(x.pagina) === d.dataset.pagina);
    const n = t.aulas.filter((a) => !aulaResolvida(t, a)).length;
    const sel = d.querySelector('.hz-turma-pend'); if (sel) { sel.textContent = n ? `${n} para conferir` : 'conferida'; sel.classList.toggle('ok', !n); }
  });
}
function desenhar() {
  desenharResumo(); desenharTurmas(); desenharProfessores(); desenharAvisos(); atualizarPendencias();
}

function desenharResumo() {
  const r = S.dados.resumo; const total = S.dados.turmas.reduce((s, t) => s + t.aulas.length, 0);
  const itens = [['Turmas', S.dados.turmas.length], ['Aulas encontradas', total], ['Aulas para conferir', r.aulas_para_revisao],
    ['Professores', S.dados.professores.length], ['Períodos bloqueados', r.periodos_bloqueados]];
  $('hz-resumo').replaceChildren(...itens.map(([rot, val]) => el('div', { class: 'hz-tile' }, el('strong', { text: val }), el('span', { text: rot }))));
}

function desenharTurmas() {
  const raiz = $('aba-turmas'); raiz.replaceChildren();
  for (const t of S.dados.turmas) raiz.append(blocoTurma(t));
}
function blocoTurma(t) {
  const c = cTurma(t.pagina); const info = S.existentes.turmas[t.pagina];
  const det = el('details', { class: `hz-turma ${c.ignorar ? 'ignorada' : ''}`, 'data-pagina': t.pagina });
  const ignorar = el('input', { type: 'checkbox', checked: !!c.ignorar, onchange: (e) => { c.ignorar = e.target.checked; det.classList.toggle('ignorada', c.ignorar); atualizarPendencias(); } });
  ignorar.addEventListener('click', (e) => e.stopPropagation());
  det.append(el('summary', {}, el('span', { class: 'hz-turma-titulo', text: t.titulo_original || `Página ${t.pagina}` }),
    el('span', { class: `hz-badge ${info && info.existente ? 'ok' : 'novo'}`, text: info && info.existente ? 'turma já cadastrada' : 'turma nova' }),
    el('span', { class: 'hz-badge', text: `${t.aulas.length} aulas` }), el('span', { class: 'hz-turma-pend hz-badge' }),
    el('label', { class: 'hz-ignorar', onclick: (e) => e.stopPropagation() }, ignorar, ' ignorar')));

  const corpo = el('div', { class: 'hz-turma-corpo' });
  // destino
  const sel = el('select', { onchange: (e) => { c.turma_id = e.target.value ? Number(e.target.value) : undefined; atualizarPendencias(); } },
    el('option', { value: '', text: info && info.existente ? `Automático: ${info.existente.nome} (${info.existente.ano}º)` : 'Criar turma nova' }),
    S.cadastros.turmas.map((x) => el('option', { value: x.id, text: `${x.nome} (${x.ano}º, ${x.turno})` })));
  const turnoSel = el('select', { onchange: (e) => { c.turno = e.target.value; atualizarPendencias(); } },
    el('option', { value: '', text: t.turno_sugerido ? `${t.turno_sugerido} (lido do PDF)` : 'escolha…' }),
    ['matutino', 'integral', 'vespertino', 'noturno'].map((x) => el('option', { value: x, text: x })));
  const nomeIn = el('input', { type: 'text', value: c.nome || t.nome || '', maxlength: 100, placeholder: 'nome da turma', onchange: (e) => { c.nome = novoTexto(e.target.value) || undefined; atualizarPendencias(); } });
  const anoSel = el('select', { onchange: (e) => { c.ano = e.target.value ? Number(e.target.value) : undefined; atualizarPendencias(); } },
    el('option', { value: '', text: t.ano ? `${t.ano}º ano` : 'ano…' }), [1, 2, 3].map((a) => el('option', { value: a, text: `${a}º ano` })));
  sel.value = c.turma_id ? String(c.turma_id) : ''; turnoSel.value = c.turno || ''; anoSel.value = c.ano ? String(c.ano) : '';
  corpo.append(el('div', { class: 'hz-linha-campos' },
    el('label', {}, el('span', { text: 'Nome da turma' }), nomeIn), el('label', {}, el('span', { text: 'Ano' }), anoSel),
    el('label', {}, el('span', { text: 'Turma no sistema' }), sel), el('label', {}, el('span', { text: 'Turno (se for nova)' }), turnoSel)));
  if (info && info.existente && info.aulas_atuais) corpo.append(el('p', { class: 'hz-nota-subst' }, el('i', { class: 'ti ti-replace' }), ` Esta turma já tem ${info.aulas_atuais} aula(s). A importação preserva essas aulas e só adiciona horários que ainda não existem. Se houver conflito, nada será gravado e você poderá revisar.`));
  if (t.alertas.some((a) => a.nivel === 'erro' && a.codigo !== 'TITULO_ILEGIVEL')) for (const a of t.alertas.filter((x) => x.nivel === 'erro' && x.codigo !== 'TITULO_ILEGIVEL')) corpo.append(el('p', { class: 'hz-erro-linha', text: a.mensagem }));

  corpo.append(tabelaHorarios(t), grade(t));
  corpo.append(el('div', { class: 'hz-acoes' }, el('button', { class: 'hz-btn hz-btn-sec', onclick: () => { t.aulas.forEach((a) => { if (a.requer_revisao) cAula(t, a).conferido = true; }); desenharTurmas(); abrirDetalhe(t.pagina); atualizarPendencias(); }, text: 'Marcar todas as aulas desta turma como conferidas' })));
  det.append(corpo);
  return det;
}
function abrirDetalhe(pagina) { const d = document.querySelector(`.hz-turma[data-pagina="${pagina}"]`); if (d) d.open = true; }

function tabelaHorarios(t) {
  const c = cTurma(t.pagina);
  const caixa = el('div', { class: `hz-horarios ${t.horarios_para_conferir ? 'atencao' : ''}` });
  if (t.horarios_para_conferir) caixa.append(el('p', { class: 'hz-nota-hor' }, el('i', { class: 'ti ti-alert-triangle' }), ' Alguns horários foram corrigidos ou deduzidos a partir da grade. Confira os horários abaixo (pode editar) e marque como conferidos.'));
  const linha = el('div', { class: 'hz-hor-lista' });
  for (const l of t.linhas_horario) {
    const ed = c.linhas[l.linha] || {};
    const marc = (l.alertas || []).filter((x) => x !== 'HORARIO_CORRIGIDO_PELA_GRADE').length > 0;
    const mk = (campo) => el('input', { type: 'time', value: ed[campo] || l[campo] || '', class: marc ? 'marcado' : '', onchange: (e) => {
      const cur = c.linhas[l.linha] || { hora_inicio: l.hora_inicio, hora_fim: l.hora_fim }; cur[campo] = e.target.value; c.linhas[l.linha] = cur; atualizarPendencias(); } });
    linha.append(el('div', { class: 'hz-hor' }, el('span', { text: `Linha ${l.linha + 1}` }), mk('hora_inicio'), '–', mk('hora_fim')));
  }
  caixa.append(linha);
  if (t.horarios_para_conferir) caixa.append(el('label', { class: 'hz-check' }, el('input', { type: 'checkbox', checked: !!c.horariosConferidos, onchange: (e) => { c.horariosConferidos = e.target.checked; atualizarPendencias(); } }), el('span', { text: 'Conferi os horários desta turma' })));
  return caixa;
}

function grade(t) {
  const dias = [...new Set([...t.aulas.map((a) => a.dia_semana), ...t.periodos_bloqueados.map((b) => b.dia_semana)])];
  const ordem = Object.keys(DIAS); dias.sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));
  const c = cTurma(t.pagina);
  const tab = el('table', { class: 'hz-grade' });
  tab.append(el('thead', {}, el('tr', {}, el('th', { text: 'Horário' }), dias.map((d) => el('th', { text: DIAS[d] })))));
  const corpo = el('tbody');
  for (const l of t.linhas_horario) {
    const ini = (c.linhas[l.linha] && c.linhas[l.linha].hora_inicio) || l.hora_inicio;
    const fim = (c.linhas[l.linha] && c.linhas[l.linha].hora_fim) || l.hora_fim;
    const tr = el('tr', {}, el('th', { text: `${ini || '?'}–${fim || '?'}` }));
    dias.forEach((d) => {
      const a = t.aulas.find((x) => x.origem.linha === l.linha && x.dia_semana === d);
      if (a) tr.append(celulaAula(t, a));
      else if (t.periodos_bloqueados.some((b) => b.dia_semana === d && b.hora_inicio === l.hora_inicio)) tr.append(el('td', { class: 'hz-cel bloqueada', title: 'Período bloqueado (sem aula)', text: 'bloqueado' }));
      else tr.append(el('td', { class: 'hz-cel vazia', text: '' }));
    });
    corpo.append(tr);
  }
  tab.append(corpo);
  return el('div', { class: 'hz-grade-wrap' }, tab);
}
function celulaAula(t, a) {
  const c = cAula(t, a);
  const excl = c.excluir; const mat = c.materia !== undefined ? c.materia : a.materia;
  const profs = (c.professores !== undefined ? c.professores : a.professores).map(nomeProf);
  const pend = !aulaResolvida(t, a);
  const td = el('td', { class: `hz-cel aula ${pend ? 'revisar' : ''} ${excl ? 'excluida' : ''} ${a.requer_revisao && !pend ? 'conferida' : ''}`, tabindex: 0, role: 'button',
    title: pend ? a.motivos_revisao.map((m) => MOTIVOS[m] || m).join(' ') : 'Clique para editar', onclick: () => abrirModal(t, a), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirModal(t, a); } } },
    el('div', { class: 'hz-cel-mat', text: excl ? '(não será importada)' : mat }), el('div', { class: 'hz-cel-prof', text: profs.join(', ') || 'sem professor' }));
  if (pend) td.append(el('div', { class: 'hz-cel-flag' }, el('i', { class: 'ti ti-alert-triangle' }), ' conferir'));
  else if (a.alertas.includes('ASSOCIACAO_PROFESSOR_GRUPO_INDEFINIDA')) td.append(el('div', { class: 'hz-cel-info', title: 'O PDF não diz qual professor leciona para qual grupo (TA/TB). Os dois estão associados à aula.', text: 'grupos TA/TB' }));
  return td;
}

// ---- modal de edição
let modalCtx = null;
function abrirModal(t, a) {
  modalCtx = { t, a };
  const c = cAula(t, a);
  $('hz-modal-ctx').textContent = `${t.titulo_original}, ${DIAS[a.dia_semana]}, ${a.hora_inicio}–${a.hora_fim}`;
  $('hz-modal-motivos').replaceChildren(...(a.requer_revisao ? a.motivos_revisao.map((m) => el('p', { class: 'hz-motivo', text: MOTIVOS[m] || m })) : []),
    ...(a.materia_original ? [el('p', { class: 'hz-motivo info', text: `Leitura original do OCR: "${a.materia_original}"` })] : []));
  $('hz-campo-materia').value = c.materia !== undefined ? c.materia : a.materia;
  $('hz-campo-prof').value = (c.professores !== undefined ? c.professores : a.professores).map(nomeProf).join(', ');
  $('hz-lista-prof').replaceChildren(...S.dados.professores.map((p) => el('option', { value: nomeProf(p.nome) })));
  $('hz-modal').classList.add('aberto'); $('hz-modal').setAttribute('aria-hidden', 'false'); $('hz-campo-materia').focus();
}
function fecharModal() { $('hz-modal').classList.remove('aberto'); $('hz-modal').setAttribute('aria-hidden', 'true'); modalCtx = null; }
function depoisDeEditar() { desenharTurmas(); if (modalCtx === null) { /* mantém aberto o bloco atual */ } atualizarPendencias(); }
function aplicarNaCelula(fn) {
  const { t, a } = modalCtx; fn(cAula(t, a)); const pag = t.pagina; fecharModal(); desenharTurmas(); abrirDetalhe(pag); atualizarPendencias();
}
function salvarModal() {
  const { a } = modalCtx;
  const materia = novoTexto($('hz-campo-materia').value);
  const profs = $('hz-campo-prof').value.split(',').map(novoTexto).filter(Boolean);
  if (!materia) { Swal.fire({ title: 'Informe a disciplina', icon: 'info', heightAuto: false }); return; }
  aplicarNaCelula((c) => { c.excluir = false; c.materia = materia; c.professores = profs; c.conferido = true; });
}

// ---- professores
function desenharProfessores() {
  const raiz = $('aba-professores'); raiz.replaceChildren();
  raiz.append(el('p', { class: 'hz-ajuda', text: 'Corrija aqui a grafia de um nome: a mudança vale para todas as aulas dele. Professores novos são cadastrados sem acesso ao sistema (você pode completar e-mail e senha depois, em Usuários).' }));
  const tab = el('table', { class: 'hz-tabela' }, el('thead', {}, el('tr', {}, ['Nome lido no PDF', 'Nome que será usado', 'No sistema', 'Aulas', ''].map((h) => el('th', { text: h })))));
  const corpo = el('tbody');
  for (const p of S.dados.professores) {
    const info = S.existentes.professores[p.nome] || {};
    const entrada = el('input', { type: 'text', value: nomeProf(p.nome), maxlength: 150, onchange: (e) => {
      const v = novoTexto(e.target.value);
      if (!v || v === p.nome) delete S.renomes[p.nome]; else S.renomes[p.nome] = v;
      desenhar(); } });
    const status = el('td', {});
    if (info.existente) status.append(el('span', { class: 'hz-badge ok', text: 'já cadastrado' }));
    else status.append(el('span', { class: 'hz-badge novo', text: 'novo (sem acesso)' }), ...(info.parecidos || []).map((q) => el('button', { class: 'hz-sugestao', title: 'Usar este nome (já cadastrado)', onclick: () => { S.renomes[p.nome] = q.nome; desenhar(); }, text: `pode ser: ${q.nome}` })));
    const notas = [];
    if (p.alertas.includes('VISTO_UMA_VEZ')) notas.push('visto uma só vez: confira a grafia');
    if (p.alertas.includes('NOME_UMA_PALAVRA')) notas.push('nome com uma palavra só');
    if (p.variantes_corrigidas.length) notas.push(`corrigido de: ${p.variantes_corrigidas.join(', ')}`);
    corpo.append(el('tr', {}, el('td', { text: p.nome }), el('td', {}, entrada), status, el('td', { text: p.aulas }), el('td', { class: 'hz-nota', text: notas.join(' · ') })));
  }
  tab.append(corpo); raiz.append(el('div', { class: 'hz-grade-wrap' }, tab));
}

// ---- avisos / correções automáticas
function desenharAvisos() {
  const raiz = $('aba-avisos'); raiz.replaceChildren();
  const avisos = S.dados.alertas.filter((a) => a.nivel !== 'info' && a.codigo !== 'HORARIOS_PARA_CONFERIR');
  $('cont-avisos').textContent = avisos.length + S.dados.correcoes.length ? `(${avisos.length + S.dados.correcoes.length})` : '';
  raiz.append(el('h4', { text: 'Avisos' }));
  raiz.append(avisos.length ? el('ul', { class: 'hz-lista' }, avisos.map((a) => el('li', { class: a.nivel }, el('strong', { text: `${AVISOS[a.codigo] || a.codigo}: ` }), a.mensagem))) : el('p', { class: 'hz-ajuda', text: 'Nenhum aviso.' }));
  raiz.append(el('h4', { text: 'Correções feitas automaticamente na leitura' }),
    el('p', { class: 'hz-ajuda', text: 'Quando o mesmo nome aparece muitas vezes e uma leitura destoa por pouco, o sistema usa a mais frequente. Veja o que foi trocado:' }));
  const mapa = new Map();
  for (const c of S.dados.correcoes) { const k = `${c.tipo}|${c.de}|${c.para}`; mapa.set(k, (mapa.get(k) || { ...c, n: 0 })); mapa.get(k).n++; }
  raiz.append(mapa.size ? el('ul', { class: 'hz-lista' }, [...mapa.values()].map((c) => el('li', {}, el('span', { class: 'hz-badge', text: c.tipo }), ` "${c.de}" → "${c.para}" (${c.n}×)`))) : el('p', { class: 'hz-ajuda', text: 'Nenhuma.' }));
}

// ---------------------------------------------------------------- confirmação
function montarCorrecoes() {
  const turmas = S.dados.turmas.map((t) => {
    const c = cTurma(t.pagina); const o = { pagina: t.pagina };
    if (c.ignorar) o.ignorar = true;
    if (c.turma_id) o.turma_id = c.turma_id;
    if (c.nome) o.nome = c.nome; if (c.ano) o.ano = c.ano; if (c.turno) o.turno = c.turno;
    if (c.horariosConferidos) o.horarios_conferidos = true;
    const linhas = Object.entries(c.linhas).map(([linha, v]) => ({ linha: Number(linha), hora_inicio: v.hora_inicio, hora_fim: v.hora_fim }));
    if (linhas.length) o.linhas_horario = linhas;
    return o;
  });
  const aulas = Object.entries(S.aulas).filter(([, v]) => Object.keys(v).length).map(([k, v]) => {
    const [pagina, linha, coluna] = k.split(':').map(Number); return { pagina, linha, coluna, ...v };
  });
  const professores = Object.entries(S.renomes).map(([nome_extraido, nome_final]) => ({ nome_extraido, nome_final }));
  return { criar_turmas_novas: S.criarNovas, turmas, aulas, professores };
}
async function importar() {
  const ok = await Swal.fire({ title: 'Importar para o banco?', text: 'As turmas e professores ausentes serão criados automaticamente. As aulas serão gravadas no banco da tela Salas; horários incompatíveis serão informados.', icon: 'question', showCancelButton: true, confirmButtonText: 'Importar', cancelButtonText: 'Voltar', heightAuto: false });
  if (!ok.isConfirmed) return;
  limparErro(); carregando($('btn-importar'), true, 'Gravando…'); setEtapa('gravacao');
  try {
    const { resultado } = await api(`/${S.id}/confirmar`, { method: 'POST', json: montarCorrecoes() });
    const turnosAtualizados = [...new Set([...(resultado.turmas_criadas || []).map((t) => t.turno), ...(S.dados?.turmas || []).map((t) => t.turno)])];
    sessionStorage.removeItem('hz_importacao'); sessionStorage.setItem('horarios_pdf_importados', JSON.stringify(turnosAtualizados));
    localStorage.setItem('salas:importacao-atualizada', JSON.stringify({ em: Date.now(), turnos: turnosAtualizados, aulas: resultado.aulas_importadas || 0 })); setEtapa('fim');
    mostrarResultado(resultado); carregarHistorico(); document.dispatchEvent(new Event('hz-importado'));
  } catch (err) {
    if (err.message === 'auth') return;
    setEtapa('conferencia'); mostrarErro(err); carregando($('btn-importar'), false, 'Importar para o banco');
    if (err.status === 409) { sessionStorage.removeItem('hz_importacao'); carregarHistorico(); }
  }
}
function mostrarResultado(r) {
  $('card-conferencia').hidden = true; const box = $('card-resultado'); box.hidden = false; box.replaceChildren();
  box.append(el('div', { class: 'hz-sucesso' }, el('i', { class: 'ti ti-circle-check' }), el('h2', { text: 'Importação concluída e gravada no banco' })),
    el('div', { class: 'hz-resumo' }, [['Aulas novas gravadas', r.aulas_importadas || 0], ['Turmas', r.turmas_importadas], ['Turmas criadas', (r.turmas_criadas || []).length], ['Professores novos', (r.professores_criados || 0)], ['Aulas idênticas já existentes', r.aulas_reutilizadas || 0], ['Professores notificados', r.notificacoes_professores || 0]].map(([rot, v]) => el('div', { class: 'hz-tile' }, el('strong', { text: v }), el('span', { text: rot })))));
  box.append(el('p', { class: 'hz-ajuda', text: r.notificacao_coordenadora ? 'Uma notificação foi enviada para sua conta. As telas de Salas abertas serão atualizadas.' : 'A importação foi gravada, mas não foi possível criar a notificação. Consulte o histórico de importações.' }));
  if ((r.turmas_criadas || []).length) {
    box.append(el('h3', { text: 'Turmas criadas e seus códigos de acesso' }), el('p', { class: 'hz-ajuda', text: 'Anote os códigos: os alunos usam o código para entrar. Eles também aparecem em Salas.' }),
      el('table', { class: 'hz-tabela' }, el('thead', {}, el('tr', {}, ['Turma', 'Ano', 'Turno', 'Código'].map((h) => el('th', { text: h })))),
        el('tbody', {}, (r.turmas_criadas || []).map((t) => el('tr', {}, el('td', { text: t.nome }), el('td', { text: `${t.ano}º` }), el('td', { text: t.turno }), el('td', { class: 'hz-codigo', text: t.codigo }))))));
  }
  box.append(el('div', { class: 'hz-acoes' }, el('a', { class: 'btn-config hz-btn', href: 'coordenador-salas.html', text: 'Ver turmas e aulas em Salas' }), el('button', { class: 'hz-btn hz-btn-sec', onclick: novaImportacao, text: 'Nova importação' })));
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function cancelar() {
  const ok = await Swal.fire({ title: 'Cancelar esta importação?', text: 'Nada foi gravado; a leitura do PDF será descartada.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Cancelar importação', cancelButtonText: 'Voltar', heightAuto: false });
  if (!ok.isConfirmed) return;
  try { await api(`/${S.id}/cancelar`, { method: 'POST' }); } catch (err) { if (err.message === 'auth') return; }
  novaImportacao(); carregarHistorico();
}
function novaImportacao() {
  sessionStorage.removeItem('hz_importacao'); S.id = null; S.dados = null;
  $('card-conferencia').hidden = true; $('card-resultado').hidden = true; $('card-envio').classList.remove('recolhido');
  setEtapa(null); resetarEnvio(); limparErro(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------------------------------------------------------------- ambiente do servidor
// Antes de enviar o PDF, avisa se o computador não está pronto (Python, bibliotecas, Tesseract).
async function verificarAmbiente() {
  try {
    const r = await fetch('/importacoes/ambiente', { headers: { Authorization: `Bearer ${token()}` } });
    if (!r.ok) return;
    const { problemas } = await r.json();
    const caixa = $('hz-ambiente');
    if (!problemas || !problemas.length) { caixa.hidden = true; return; }
    caixa.replaceChildren(el('strong', { text: 'O servidor ainda não está pronto para ler PDFs:' }),
      el('ul', {}, problemas.map((p) => el('li', { text: p.mensagem }))),
      el('small', { text: 'Depois de corrigir, reinicie o servidor e recarregue esta página.' }));
    caixa.hidden = false;
  } catch (_) { /* a verificação é só um aviso */ }
}

// ---------------------------------------------------------------- histórico
const STATUS_ROTULO = { processando: 'Lendo…', pronta: 'Aguardando conferência', confirmada: 'Concluída', falhou: 'Falhou', cancelada: 'Cancelada' };
async function carregarHistorico() {
  try {
    const lista = await api('');
    const corpo = document.querySelector('#hz-historico tbody'); corpo.replaceChildren();
    $('hz-historico-vazio').hidden = lista.length > 0;
    for (const i of lista) {
      corpo.append(el('tr', {}, el('td', { text: new Date(i.criado_em).toLocaleString('pt-BR') }), el('td', { text: i.nome_original }),
        el('td', {}, el('span', { class: `hz-badge st-${i.status}`, text: STATUS_ROTULO[i.status] || i.status }), i.status === 'falhou' && i.erro_mensagem ? el('div', { class: 'hz-nota', text: `${ETAPAS_ROTULO[i.etapa] || i.etapa}: ${i.erro_mensagem}` }) : null),
        el('td', { text: i.total_aulas_importadas ?? (i.total_aulas_encontradas ?? '') })));
    }
  } catch (_) { /* histórico é opcional */ }
}

// ---------------------------------------------------------------- inicialização
document.addEventListener('DOMContentLoaded', () => {
  const entrada = $('arquivo-pdf'); const drop = $('hz-drop');
  entrada.addEventListener('change', () => escolherArquivo(entrada.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('arrastando'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('arrastando'); }));
  drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) escolherArquivo(e.dataTransfer.files[0]); });
  $('btn-ler').addEventListener('click', enviar); $('btn-limpar').addEventListener('click', resetarEnvio);
  $('btn-importar').addEventListener('click', importar); $('btn-cancelar').addEventListener('click', cancelar);
  $('opt-criar-turmas').addEventListener('change', (e) => { S.criarNovas = e.target.checked; atualizarPendencias(); });
  document.querySelectorAll('.hz-aba').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.hz-aba').forEach((x) => x.classList.toggle('ativa', x === b));
    ['turmas', 'professores', 'avisos'].forEach((n) => { $(`aba-${n}`).hidden = n !== b.dataset.aba; });
  }));
  $('hz-modal-fechar').addEventListener('click', fecharModal);
  $('hz-modal').addEventListener('click', (e) => { if (e.target.id === 'hz-modal') fecharModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalCtx) fecharModal(); });
  $('hz-modal-salvar').addEventListener('click', salvarModal);
  $('hz-modal-conferir').addEventListener('click', () => aplicarNaCelula((c) => { c.conferido = true; c.excluir = false; }));
  $('hz-modal-excluir').addEventListener('click', () => aplicarNaCelula((c) => { c.excluir = true; }));
  carregarHistorico(); verificarAmbiente();
  const retomar = sessionStorage.getItem('hz_importacao');   // recarregou a página no meio do processo
  if (retomar) { S.id = Number(retomar); $('hz-progresso').hidden = false; setEtapa('leitura'); acompanhar(); }
});

// ---------------------------------------------------------------- consulta (turma / professor)
async function iniciarConsulta() {
  const tipo = $('hc-tipo'); const alvo = $('hc-alvo');
  const h = { headers: { Authorization: `Bearer ${token()}` } };
  async function preencher() {
    alvo.replaceChildren(new Option('Carregando…', ''));
    try {
      const rota = tipo.value === 'turma' ? '/turmas' : '/professor';
      const lista = await (await fetch(rota, h)).json();
      alvo.replaceChildren(new Option('Escolha…', ''));
      (Array.isArray(lista) ? lista : []).forEach((x) => alvo.append(new Option(tipo.value === 'turma' ? `${x.ano}º ${x.nome} (${x.turno})` : x.nome, x.id)));
    } catch (_) { alvo.replaceChildren(new Option('Erro ao carregar', '')); }
  }
  tipo.addEventListener('change', () => { preencher(); $('hc-conteudo').replaceChildren(); });
  alvo.addEventListener('change', () => { if (alvo.value) HorariosConsulta.montar({ alvo: '#hc-conteudo', rota: `/horarios/${tipo.value}/${alvo.value}`, modo: tipo.value }); });
  // após uma importação concluída, recarrega a lista (há turmas/professores novos) e a grade aberta
  document.addEventListener('hz-importado', async () => {
    const atual = alvo.value;
    await preencher();
    if (atual) { alvo.value = atual; if (alvo.value) alvo.dispatchEvent(new Event('change')); }
  });
  preencher();
}
document.addEventListener('DOMContentLoaded', iniciarConsulta);









