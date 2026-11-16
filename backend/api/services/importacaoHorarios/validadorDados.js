// Validação em duas fases:
//   1) validarSaidaPython: confere a ESTRUTURA do que o Python devolveu (nada é gravado sem isso);
//   2) montarPlano: aplica as correções da coordenadora sobre a leitura guardada no servidor
//      e valida o conjunto. Se houver qualquer bloqueio, NADA é gravado.
const { ErroImportacao, ETAPAS } = require('./erros');
const { chaveNome, formatarNome } = require('./texto');

const DIAS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const TURNOS = ['matutino', 'integral', 'vespertino', 'noturno'];
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const LIM = { turmas: 300, aulasPorTurma: 120, materia: 150, nomeTurma: 100, nomeProf: 150, profPorAula: 6 };

// Nomes e textos entram no banco e depois são exibidos pelos outros painéis: nada de HTML/controle.
const RE_NOME_PESSOA = /^\p{L}[\p{L} .'’-]*$/u;
const RE_TEXTO_SEGURO = /^[^<>\u0000-\u001f\u007f]*$/;
const nomePessoaOk = (n) => typeof n === 'string' && RE_NOME_PESSOA.test(n.trim()) && chaveNome(n).length >= 3;

const ehObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ehStr = (v, max) => typeof v === 'string' && v.length <= max;
const ehInt = (v) => Number.isInteger(v);

function falha(msg, codigo = 'ESTRUTURA_INVALIDA') {
  return new ErroImportacao(msg, { etapa: ETAPAS.VALIDACAO, codigo, status: 422 });
}

// ------------------------------------------------------------------ fase 1
function validarSaidaPython(d) {
  if (!ehObj(d) || d.versao_esquema !== 1) throw falha('Versão de dados do leitor de PDFs não reconhecida.');
  if (!ehObj(d.arquivo) || !/^[0-9a-f]{64}$/.test(d.arquivo.sha256 || '')) throw falha('Identificação do arquivo ausente.');
  if (!Array.isArray(d.turmas) || d.turmas.length === 0 || d.turmas.length > LIM.turmas) {
    throw falha('Nenhuma turma foi encontrada no PDF.', 'SEM_TURMAS');
  }
  const paginas = new Set();
  d.turmas.forEach((t, i) => {
    const onde = `turma #${i + 1}`;
    if (!ehObj(t) || !ehInt(t.pagina) || paginas.has(t.pagina)) throw falha(`${onde}: página inválida ou repetida.`);
    paginas.add(t.pagina);
    if (!ehStr(t.titulo_original, 200)) throw falha(`${onde}: título inválido.`);
    if (t.ano !== null && ![1, 2, 3].includes(t.ano)) throw falha(`${onde}: ano inválido.`);
    if (t.nome !== null && !ehStr(t.nome, LIM.nomeTurma)) throw falha(`${onde}: nome inválido.`);
    if (t.turno_sugerido !== null && !TURNOS.includes(t.turno_sugerido)) throw falha(`${onde}: turno inválido.`);
    if (!Array.isArray(t.aulas) || t.aulas.length > LIM.aulasPorTurma) throw falha(`${onde}: lista de aulas inválida.`);
    if (!Array.isArray(t.alertas) || !Array.isArray(t.periodos_bloqueados)) throw falha(`${onde}: estrutura incompleta.`);
    t.aulas.forEach((a, j) => {
      const e = `${onde}, aula #${j + 1}`;
      if (!ehObj(a) || !DIAS.includes(a.dia_semana)) throw falha(`${e}: dia da semana inválido.`);
      if (!RE_HORA.test(a.hora_inicio) || !RE_HORA.test(a.hora_fim)) throw falha(`${e}: horário inválido.`);
      if (!ehStr(a.materia, 500)) throw falha(`${e}: disciplina inválida.`);
      if (!Array.isArray(a.professores) || a.professores.length > LIM.profPorAula ||
          !a.professores.every((p) => ehStr(p, LIM.nomeProf))) throw falha(`${e}: professores inválidos.`);
      if (!ehObj(a.origem) || !ehInt(a.origem.linha) || !ehInt(a.origem.coluna)) throw falha(`${e}: origem ausente.`);
      if (typeof a.requer_revisao !== 'boolean') throw falha(`${e}: indicador de revisão ausente.`);
    });
  });
  if (!Array.isArray(d.professores) || !Array.isArray(d.alertas) || !ehObj(d.resumo)) throw falha('Estrutura incompleta.');
  return d;
}

// ------------------------------------------------------------------ fase 2
// Alertas do Python que são RECALCULADOS aqui depois das correções (não bloqueiam por si).
const RECALCULADOS = new Set(['AULA_DUPLICADA', 'MATERIA_AUSENTE', 'MATERIA_LONGA', 'HORARIO_INVALIDO',
  'TITULO_ILEGIVEL', 'HORARIOS_PARA_CONFERIR']);

function chaveAula(o) { return `${o.pagina}:${o.linha}:${o.coluna}`; }

// dados: leitura guardada | cor: correções da coordenadora | ctx: { turmasBanco, criarNovas }
// Devolve { plano, bloqueios, ignoradas }. Nunca grava nada.
function montarPlano(dados, cor = {}, ctx = {}) {
  const bloqueios = [];
  const bloquear = (codigo, mensagem, extra = {}) => bloqueios.push({ codigo, mensagem, ...extra });
  const corTurmas = new Map((Array.isArray(cor.turmas) ? cor.turmas : []).filter(ehObj).map((t) => [t.pagina, t]));
  const corAulas = new Map((Array.isArray(cor.aulas) ? cor.aulas : []).filter(ehObj).map((a) => [chaveAula(a), a]));
  const renomear = new Map();
  for (const p of (Array.isArray(cor.professores) ? cor.professores : []).filter(ehObj)) {
    if (!ehStr(p.nome_extraido, LIM.nomeProf)) continue;
    if (p.nome_final === undefined) continue;
    if (!ehStr(p.nome_final, LIM.nomeProf) || !nomePessoaOk(p.nome_final)) {
      bloquear('NOME_PROFESSOR_INVALIDO', `Nome inválido para o professor "${p.nome_extraido}".`);
      continue;
    }
    renomear.set(chaveNome(p.nome_extraido), formatarNome(p.nome_final));
  }

  const plano = [];
  const ignoradas = [];
  for (const t of dados.turmas) {
    const c = corTurmas.get(t.pagina) || {};
    if (c.ignorar === true) { ignoradas.push(t.pagina); continue; }
    // Disciplina sem correspondência no gabarito não vira registro de aula. Pode ser corrigida
    // na pré-visualização; se todas as aulas da turma forem assim, a página fica só no histórico.
    const correcoesMateria = new Set([...corAulas.entries()]
      .filter(([k, v]) => k.startsWith(`${t.pagina}:`) && v.materia !== undefined).map(([k]) => k));
    const aulasSeguras = t.aulas.filter((a) => !(a.identificacao_gabarito &&
      a.identificacao_gabarito.disciplina && a.identificacao_gabarito.disciplina.status !== 'identificado' &&
      !correcoesMateria.has(chaveAula({ pagina: t.pagina, ...a.origem }))));
    if (t.aulas.length && aulasSeguras.length === 0) { ignoradas.push(t.pagina); continue; }
    const rotulo = `${t.titulo_original || `página ${t.pagina}`}`;
    const nome = ehStr(c.nome, LIM.nomeTurma) && c.nome.trim() ? c.nome.trim() : t.nome;
    const ano = c.ano !== undefined ? c.ano : t.ano;
    const turno = c.turno !== undefined ? c.turno : t.turno_sugerido;
    if (nome && !RE_TEXTO_SEGURO.test(nome)) { bloquear('TURMA_SEM_NOME_OU_ANO', `"${rotulo}": o nome da turma contém caracteres não permitidos.`, { pagina: t.pagina }); continue; }
    if (!nome || ![1, 2, 3].includes(Number(ano))) { bloquear('TURMA_SEM_NOME_OU_ANO', `"${rotulo}": informe o ano e o nome da turma (ou ignore esta página).`, { pagina: t.pagina }); continue; }
    if (turno !== null && turno !== undefined && !TURNOS.includes(turno)) { bloquear('TURNO_INVALIDO', `"${rotulo}": turno inválido.`, { pagina: t.pagina }); continue; }
    for (const al of t.alertas) {
      if (al.nivel === 'erro' && !RECALCULADOS.has(al.codigo)) {
        bloquear('ERRO_NA_LEITURA', `"${rotulo}": ${al.mensagem}`, { pagina: t.pagina, codigo_origem: al.codigo });
      }
    }
    // tabela de horários por linha (corrigível)
    const horaDaLinha = new Map();
    for (const l of Array.isArray(c.linhas_horario) ? c.linhas_horario : []) {
      if (!ehObj(l)) continue;
      if (!RE_HORA.test(l.hora_inicio) || !RE_HORA.test(l.hora_fim) || l.hora_inicio >= l.hora_fim) {
        bloquear('HORARIO_INVALIDO', `"${rotulo}": horário inválido na linha ${Number(l.linha) + 1}.`, { pagina: t.pagina }); continue;
      }
      horaDaLinha.set(l.linha, l);
    }
    const alterouHorario = horaDaLinha.size > 0;
    if (t.horarios_para_conferir && c.horarios_conferidos !== true && !alterouHorario) {
      bloquear('HORARIOS_NAO_CONFERIDOS', `"${rotulo}": confira a tabela de horários desta turma (alguns foram deduzidos da grade).`, { pagina: t.pagina });
    }

    const aulas = [];
    const vistos = new Set();
    const pendentes = [];
    for (const a of t.aulas) {
      const ca = corAulas.get(chaveAula({ pagina: t.pagina, ...a.origem })) || {};
      if (ca.excluir === true) continue;
      if (a.identificacao_gabarito && a.identificacao_gabarito.disciplina &&
          a.identificacao_gabarito.disciplina.status !== 'identificado' && ca.materia === undefined) continue;
      const hl = horaDaLinha.get(a.origem.linha);
      const final = {
        dia_semana: a.dia_semana,
        hora_inicio: hl ? hl.hora_inicio : a.hora_inicio,
        hora_fim: hl ? hl.hora_fim : a.hora_fim,
        materia: (ca.materia !== undefined ? String(ca.materia) : a.materia).trim().replace(/\s+/g, ' '),
        professores: [],
      };
      let nomes = Array.isArray(ca.professores) ? ca.professores : a.professores;
      const editou = ca.materia !== undefined || Array.isArray(ca.professores);
      if (!nomes.every((n) => ehStr(n, LIM.nomeProf)) || nomes.length > LIM.profPorAula) {
        bloquear('PROFESSORES_INVALIDOS', `"${rotulo}": professores inválidos em ${a.dia_semana} ${a.hora_inicio}.`, { pagina: t.pagina }); continue;
      }
      const vistosProf = new Set();
      for (const n of nomes) {
        const k = chaveNome(n);
        if (!nomePessoaOk(n)) { bloquear('NOME_PROFESSOR_INVALIDO', `"${rotulo}": nome de professor inválido em ${a.dia_semana} ${a.hora_inicio}.`, { pagina: t.pagina }); continue; }
        const nomeFinal = renomear.get(k) || (ca.professores ? formatarNome(n) : n);
        if (!vistosProf.has(chaveNome(nomeFinal))) { vistosProf.add(chaveNome(nomeFinal)); final.professores.push(nomeFinal); }
      }
      if (!RE_TEXTO_SEGURO.test(final.materia)) { bloquear('MATERIA_INVALIDA', `"${rotulo}": a disciplina contém caracteres não permitidos.`, { pagina: t.pagina }); continue; }
      if (!final.materia || final.materia.length > LIM.materia) { bloquear('MATERIA_INVALIDA', `"${rotulo}": disciplina vazia ou com mais de ${LIM.materia} caracteres em ${a.dia_semana} ${a.hora_inicio}.`, { pagina: t.pagina }); continue; }
      if (!RE_HORA.test(final.hora_inicio) || !RE_HORA.test(final.hora_fim) || final.hora_inicio >= final.hora_fim) { bloquear('HORARIO_INVALIDO', `"${rotulo}": horário inválido em ${a.dia_semana}.`, { pagina: t.pagina }); continue; }
      const k = `${final.dia_semana}|${final.hora_inicio}`;
      if (vistos.has(k)) { bloquear('AULA_DUPLICADA', `"${rotulo}": duas aulas em ${final.dia_semana} às ${final.hora_inicio}.`, { pagina: t.pagina }); continue; }
      vistos.add(k);
      if (a.requer_revisao && !editou && ca.conferido !== true) pendentes.push(`${a.dia_semana} ${a.hora_inicio}`);
      aulas.push(final);
    }
    if (pendentes.length) {
      bloquear('REVISAO_PENDENTE', `"${rotulo}": ${pendentes.length} aula(s) marcadas para revisão ainda não foram conferidas (${pendentes.slice(0, 4).join(', ')}${pendentes.length > 4 ? '…' : ''}).`, { pagina: t.pagina });
    }
    if (aulas.length === 0) { bloquear('TURMA_SEM_AULAS', `"${rotulo}": nenhuma aula para importar (ignore esta página se for o caso).`, { pagina: t.pagina }); continue; }

    // turma de destino
    let destino = null;
    if (c.turma_id !== undefined && c.turma_id !== null) {
      destino = (ctx.turmasPorId || new Map()).get(Number(c.turma_id));
      if (!destino) { bloquear('TURMA_NAO_ENCONTRADA', `"${rotulo}": a turma escolhida não existe.`, { pagina: t.pagina }); continue; }
    } else {
      destino = (ctx.turmasPorChave || new Map()).get(ctx.chaveTurma(nome, ano)) || null;
    }
    if (!destino) {
      if (!ctx.criarNovas) { bloquear('TURMA_NAO_CADASTRADA', `"${rotulo}": a turma ainda não está cadastrada. Escolha uma turma existente ou autorize criar as turmas novas.`, { pagina: t.pagina }); continue; }
      if (!turno) { bloquear('TURNO_AUSENTE', `"${rotulo}": informe o turno para criar a turma.`, { pagina: t.pagina }); continue; }
    }
    plano.push({ pagina: t.pagina, rotulo, destino_id: destino ? destino.id : null,
      nova: destino ? null : { nome: nome.trim(), ano: Number(ano), turno }, aulas });
  }

  // duas páginas não podem escrever na mesma turma
  const alvo = new Map();
  for (const p of plano) {
    const k = p.destino_id ? `id:${p.destino_id}` : `novo:${p.nova.ano}|${p.nova.nome}`;
    if (alvo.has(k)) bloquear('TURMA_REPETIDA', `As páginas ${alvo.get(k)} e ${p.pagina} apontam para a mesma turma.`, { pagina: p.pagina });
    alvo.set(k, p.pagina);
  }
  if (plano.length === 0 && bloqueios.length === 0) bloquear('NADA_PARA_IMPORTAR', 'Nenhuma turma foi selecionada para importação.');
  return { plano, bloqueios, ignoradas };
}

module.exports = { validarSaidaPython, montarPlano, DIAS, TURNOS, RE_HORA };

