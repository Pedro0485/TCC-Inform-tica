const notificarAulas = require('../notificarAulas');
// Orquestra o fluxo em etapas:
//   envio_arquivo -> leitura_pdf (Python) -> validacao_dados -> [pré-visualização]
//   -> (confirmação da coordenadora) -> validacao_dados -> gravacao_banco
const pool = require('../../config/db');
const cfg = require('../../config/importacaoConfig');
const repo = require('./repositorio');
const arquivoPdf = require('./arquivoPdf');
const { executarLeitura, diagnosticar } = require('./pythonRunner');
const { validarSaidaPython, montarPlano } = require('./validadorDados');
const { chaveNome, chaveTurma, similaridade, nomeParcial } = require('./texto');
const { ErroImportacao, ETAPAS } = require('./erros');

let emProcessamento = 0;

function comoErro(err, etapa, codigo = 'ERRO_INESPERADO') {
  if (err instanceof ErroImportacao) return err;
  console.error(`[importacao] ${codigo}:`, err && (err.code || err.message));
  return new ErroImportacao('Falha inesperada no processamento.', { etapa, codigo, status: 500 });
}

// Recebe o PDF, cria o registro e dispara o processamento em segundo plano.
async function iniciar({ buffer, nomeOriginal, usuarioId }) {
  if (emProcessamento >= cfg.MAX_PROCESSAMENTOS_SIMULTANEOS) {
    throw new ErroImportacao('Já existe uma importação sendo processada. Aguarde ela terminar.',
      { etapa: ETAPAS.ENVIO, codigo: 'OCUPADO', status: 429 });
  }
  const arq = arquivoPdf.validarEGuardar(buffer);
  let id;
  try {
    id = await repo.criar(pool, { criadoPor: usuarioId, nomeOriginal, sha256: arq.sha256, tamanho: arq.tamanho });
  } catch (err) {
    arquivoPdf.apagar(arq.caminho);
    throw comoErro(err, ETAPAS.GRAVACAO, 'ERRO_BANCO');
  }
  emProcessamento++;
  setImmediate(() => processar(id, arq).catch((e) => console.error('[importacao] processar:', e.message)));
  return { id };
}

async function processar(id, arq) {
  try {
    const dados = await executarLeitura(arq.caminho, (p) => {
      repo.atualizarProgresso(pool, id, p).catch(() => {});
    });
    validarSaidaPython(dados);
    if (dados.arquivo.sha256 !== arq.sha256) {
      throw new ErroImportacao('O arquivo lido não corresponde ao arquivo enviado.',
        { etapa: ETAPAS.COMUNICACAO, codigo: 'ARQUIVO_DIVERGENTE', status: 502 });
    }
    await repo.marcarPronta(pool, id, dados);
  } catch (err) {
    const e = comoErro(err, ETAPAS.LEITURA);
    await repo.marcarFalha(pool, id, { etapa: e.etapa, codigo: e.codigo, mensagem: e.message })
      .catch((x) => console.error('[importacao] não consegui registrar a falha:', x.message));
  } finally {
    arquivoPdf.apagar(arq.caminho); // política: o PDF não é guardado depois de lido
    emProcessamento--;
  }
}

async function obterStatus(id) {
  const s = await repo.obterStatus(pool, id);
  if (!s) throw new ErroImportacao('Importação não encontrada.', { codigo: 'NAO_ENCONTRADA', status: 404 });
  return s;
}

async function listar() {
  return repo.listarHistorico(pool, 20);
}

// Dados da pré-visualização: a leitura + o que o sistema já conhece (turmas e professores).
async function obterPreview(id) {
  const imp = await repo.obterComDados(pool, id);
  if (!imp) throw new ErroImportacao('Importação não encontrada.', { codigo: 'NAO_ENCONTRADA', status: 404 });
  if (imp.status !== 'pronta') {
    throw new ErroImportacao('Esta importação não está disponível para pré-visualização.',
      { codigo: 'STATUS_INVALIDO', status: 409, detalhes: { status: imp.status } });
  }
  const { turmas, professores } = await repo.carregarCadastros(pool);
  const aulasPorTurma = await repo.contarAulasPorTurma(pool);
  const turmaPorChave = new Map(turmas.map((t) => [chaveTurma(t.nome, t.ano), t]));
  const profPorChave = new Map(professores.map((p) => [chaveNome(p.nome), p]));

  const turmasInfo = {};
  for (const t of imp.dados.turmas) {
    const ex = t.nome && t.ano ? turmaPorChave.get(chaveTurma(t.nome, t.ano)) : null;
    turmasInfo[t.pagina] = ex
      ? { existente: { id: ex.id, nome: ex.nome, ano: ex.ano, turno: ex.turno }, aulas_atuais: aulasPorTurma.get(ex.id) || 0 }
      : { existente: null, aulas_atuais: 0 };
  }
  const profInfo = {};
  for (const p of imp.dados.professores) {
    const ex = profPorChave.get(chaveNome(p.nome));
    const parecidos = ex ? [] : professores
      .map((q) => ({ id: q.id, nome: q.nome, sim: similaridade(p.nome, q.nome) }))
      .filter((q) => q.sim >= 0.8 || nomeParcial(p.nome, q.nome)).sort((a, b) => b.sim - a.sim).slice(0, 3)
      .map((q) => ({ id: q.id, nome: q.nome }));
    profInfo[p.nome] = { existente: ex ? { id: ex.id, nome: ex.nome, tem_acesso: !!ex.email } : null, parecidos };
  }
  const anterior = await repo.jaImportadoAntes(pool, imp.arquivo_sha256);
  const { id: _i, criado_por, ...resto } = imp;
  return {
    importacao: { id: imp.id, nome_original: imp.nome_original, status: imp.status, criado_em: imp.criado_em },
    dados: imp.dados,
    cadastros: { turmas: turmas.map((t) => ({ id: t.id, nome: t.nome, ano: t.ano, turno: t.turno })) },
    existentes: { turmas: turmasInfo, professores: profInfo },
    ja_importado_antes: anterior ? { id: anterior.id, confirmada_em: anterior.confirmada_em } : null,
  };
}

async function confirmar(id, correcoes) {
  const imp = await repo.obterComDados(pool, id);
  if (!imp) throw new ErroImportacao('Importação não encontrada.', { codigo: 'NAO_ENCONTRADA', status: 404 });
  if (imp.status === 'confirmada') {
    throw new ErroImportacao('Esta importação já foi concluída. Nada foi gravado novamente.',
      { etapa: ETAPAS.GRAVACAO, codigo: 'JA_CONFIRMADA', status: 409 });
  }
  if (imp.status !== 'pronta') {
    throw new ErroImportacao('Esta importação não está pronta para ser confirmada.',
      { etapa: ETAPAS.GRAVACAO, codigo: 'STATUS_INVALIDO', status: 409 });
  }
  if (correcoes === null || typeof correcoes !== 'object' || Array.isArray(correcoes)) {
    throw new ErroImportacao('Corpo da requisição inválido.', { codigo: 'CORPO_INVALIDO', status: 400 });
  }
  const criarNovas = correcoes.criar_turmas_novas === true || correcoes.criar_turmas_novas === 'true';
  const { turmas } = await repo.carregarCadastros(pool);
  const ctx = {
    criarNovas, chaveTurma,
    turmasPorId: new Map(turmas.map((t) => [t.id, t])),
    turmasPorChave: new Map(turmas.map((t) => [chaveTurma(t.nome, t.ano), t])),
  };
  const { plano, bloqueios } = montarPlano(imp.dados, correcoes, ctx);
  if (bloqueios.length) {
    throw new ErroImportacao('A importação não foi concluída: há itens a corrigir. Nada foi gravado.',
      { etapa: ETAPAS.VALIDACAO, codigo: 'BLOQUEIOS', status: 422, detalhes: bloqueios.slice(0, 100) });
  }
  try {
    const turmasAntes = [...new Set(plano.map((t) => Number(t.destino_id)).filter(Boolean))];
    const fotoAntes = await notificarAulas.capturar(pool, turmasAntes);
    const resultado = await repo.gravar(pool, id, plano, { criarTurmas: criarNovas });
    // Notifica professores apenas nas turmas deste PDF, evitando varrer todo o banco.
    resultado.notificacoes_professores = await notificarAulas.notificar(pool, fotoAntes, imp.criado_por, resultado.turmas_afetadas);
    resultado.notificacao_coordenadora = await notificarAulas.registrarImportacao(pool, imp.criado_por, resultado);
    return resultado;
  } catch (err) {
    if (err instanceof ErroImportacao && err.codigo !== 'JA_CONFIRMADA' && err.codigo !== 'STATUS_INVALIDO') {
      await repo.registrarErroGravacao(pool, id, { codigo: err.codigo, mensagem: err.message }).catch(() => {});
    }
    throw err;
  }
}

async function cancelar(id) {
  const ok = await repo.cancelar(pool, id);
  if (!ok) throw new ErroImportacao('Só é possível cancelar importações em andamento ou aguardando confirmação.',
    { codigo: 'STATUS_INVALIDO', status: 409 });
}

// Chamado na subida do servidor.
async function ambiente() {
  return diagnosticar();
}

async function aoIniciar() {
  arquivoPdf.limparTemporariosAntigos();
  diagnosticar().then((d) => {            // avisa já na subida se o computador não está pronto para ler PDFs
    if (d.problemas.length) {
      console.error('[importacao] ATENÇÃO: o leitor de PDFs NÃO está pronto neste computador:');
      d.problemas.forEach((p) => console.error(`  - ${p.mensagem}`));
    } else {
      console.log(`[importacao] leitor de PDFs pronto (Python ${d.python}, Tesseract OK).`);
    }
  });
  try {
    await repo.marcarTravadasComoFalhas(pool);
  } catch (err) {
    console.error('[importacao] AVISO: tabelas de importação ausentes? Rode "npm run db:migrate". (' + (err.code || err.message) + ')');
  }
}

module.exports = { ambiente, iniciar, obterStatus, listar, obterPreview, confirmar, cancelar, aoIniciar };


