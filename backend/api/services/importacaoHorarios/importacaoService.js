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
const { aplicarNomesCurtos } = require('./nomesCurtos');
const log = require('./log');

let emProcessamento = 0;

function comoErro(err, etapa, codigo = 'ERRO_INESPERADO') {
  if (err instanceof ErroImportacao) return err;
  console.error(`[importacao] ${codigo}:`, err && (err.code || err.message));
  return new ErroImportacao('Falha inesperada no processamento.', { etapa, codigo, status: 500 });
}

// Recebe o PDF, cria o registro e dispara o processamento em segundo plano.
async function iniciar({ buffer, nomeOriginal, usuarioId }) {
  if (emProcessamento >= cfg.MAX_PROCESSAMENTOS_SIMULTANEOS) {
    log.registrar('envio_recusado_limite', { em_processamento: emProcessamento, limite: cfg.MAX_PROCESSAMENTOS_SIMULTANEOS }, 'warn');
    throw new ErroImportacao('Já existe uma importação sendo processada. Aguarde ela terminar.',
      { etapa: ETAPAS.ENVIO, codigo: 'OCUPADO', status: 429 });
  }
  emProcessamento++; // Reserva síncrona antes do primeiro await.
  let arq;
  let slot;
  let etapaAtual = ETAPAS.ENVIO;
  try {
    etapaAtual = ETAPAS.GRAVACAO;
    const inicioSlot = Date.now();
    slot = await repo.adquirirSlotProcessamento(pool, cfg.MAX_PROCESSAMENTOS_SIMULTANEOS);
    if (!slot) throw new ErroImportacao('Já existe uma leitura de PDF em andamento. Aguarde ela terminar.',
      { etapa: ETAPAS.ENVIO, codigo: 'OCUPADO', status: 429 });
    etapaAtual = ETAPAS.ENVIO;
    arq = arquivoPdf.validarEGuardar(buffer);
    etapaAtual = ETAPAS.GRAVACAO;
    const inicioBanco = Date.now();
    const id = await repo.criar(pool, { criadoPor: usuarioId, nomeOriginal, sha256: arq.sha256, tamanho: arq.tamanho });
    log.registrar('importacao_recebida', { importacao_id: id, usuario_id: usuarioId, tamanho_bytes: arq.tamanho,
      slot_ocr: slot.nome, duracao_aquisicao_slot_ms: Date.now() - inicioSlot,
      duracao_criacao_historico_ms: Date.now() - inicioBanco, em_processamento: emProcessamento,
      limite: cfg.MAX_PROCESSAMENTOS_SIMULTANEOS, timeout_python_ms: cfg.TIMEOUT_PYTHON_MS,
      limite_pdf_bytes: cfg.TAMANHO_MAX_BYTES, limite_saida_python_bytes: cfg.MAX_SAIDA_PYTHON_BYTES,
      rss_node_bytes: process.memoryUsage().rss });
    const slotProcessamento = slot;
    setImmediate(() => processar(id, arq, slotProcessamento).catch((e) => log.registrar('processamento_nao_tratado', { importacao_id: id, ...log.resumoErro(e) }, 'error')));
    slot = null;
    return { id };
  } catch (err) {
    if (arq) arquivoPdf.apagar(arq.caminho);
    if (slot) await repo.liberarSlotProcessamento(slot).catch((x) => log.registrar('falha_liberar_slot_ocr', log.resumoErro(x), 'error'));
    emProcessamento--;
    const e = comoErro(err, etapaAtual, etapaAtual === ETAPAS.GRAVACAO ? 'ERRO_BANCO' : 'ERRO_ENVIO');
    log.registrar('falha_ao_iniciar', { usuario_id: usuarioId, ...log.resumoErro(err), etapa: e.etapa, codigo: e.codigo }, 'error');
    throw e;
  }
}

async function processar(id, arq, slot) {
  const inicio = Date.now();
  log.registrar('processamento_iniciado', { importacao_id: id, tamanho_bytes: arq.tamanho,
    rss_node_bytes: process.memoryUsage().rss, cpu: process.cpuUsage() });
  try {
    const gabarito = await repo.carregarGabarito(pool);
    log.registrar('gabarito_carregado', { importacao_id: id, professores: gabarito.professores.length,
      disciplinas: gabarito.disciplinas.length, variacoes_professores: gabarito.professores.reduce((n, e) => n + e.variacoes.length, 0),
      variacoes_disciplinas: gabarito.disciplinas.reduce((n, e) => n + e.variacoes.length, 0) });
    const dados = await executarLeitura(arq.caminho, (p) => {
      repo.atualizarProgresso(pool, id, p).catch((err) => log.registrar('falha_atualizar_progresso', { importacao_id: id, ...log.resumoErro(err) }, 'error'));
    }, { importacaoId: id, tamanhoBytes: arq.tamanho, gabarito });
    validarSaidaPython(dados);
    if (dados.arquivo.sha256 !== arq.sha256) {
      throw new ErroImportacao('O arquivo lido não corresponde ao arquivo enviado.',
        { etapa: ETAPAS.COMUNICACAO, codigo: 'ARQUIVO_DIVERGENTE', status: 502 });
    }
    // turmas novas recebem o nome curto do curso (ADM, MECA...); turmas já cadastradas continuam as mesmas
    aplicarNomesCurtos(dados, (await repo.carregarCadastros(pool)).turmas);
    const salvarInicio = Date.now();
    await repo.marcarPronta(pool, id, dados, gabarito);
    log.registrar('leitura_pronta', { importacao_id: id, paginas: dados.resumo && dados.resumo.paginas,
      turmas: dados.turmas.length, aulas: dados.turmas.reduce((s, t) => s + t.aulas.length, 0),
      duracao_salvar_resultado_ms: Date.now() - salvarInicio, duracao_total_ms: Date.now() - inicio,
      rss_node_bytes: process.memoryUsage().rss });
  } catch (err) {
    const e = comoErro(err, ETAPAS.LEITURA);
    log.registrar('importacao_falhou', { importacao_id: id, etapa: e.etapa, codigo: e.codigo,
      duracao_total_ms: Date.now() - inicio, rss_node_bytes: process.memoryUsage().rss,
      ...log.resumoErro(err) }, 'error');
    await repo.marcarFalha(pool, id, { etapa: e.etapa, codigo: e.codigo, mensagem: e.message })
      .catch((x) => console.error('[importacao] não consegui registrar a falha:', x.message));
  } finally {
    arquivoPdf.apagar(arq.caminho); // política: o PDF não é guardado depois de lido
    emProcessamento--;
    await repo.liberarSlotProcessamento(slot).catch((err) => log.registrar('falha_liberar_slot_ocr', { importacao_id: id, ...log.resumoErro(err) }, 'error'));
    log.registrar('processamento_encerrado', { importacao_id: id, em_processamento: emProcessamento,
      duracao_total_ms: Date.now() - inicio, rss_node_bytes: process.memoryUsage().rss });
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
    const resultado = await repo.gravar(pool, id, plano, { criarTurmas: criarNovas,
      identificacoesPendentes: Number(imp.dados.resumo && imp.dados.resumo.identificacoes_pendentes) || 0 });
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
  try {
    const [[db]] = await pool.query(`SELECT 1 AS ok, @@global.time_zone AS timezone_global,
      @@session.time_zone AS timezone_sessao, @@wait_timeout AS wait_timeout_segundos,
      UTC_TIMESTAMP() AS mysql_utc, NOW() AS mysql_local`);
    log.registrar('diagnostico_mysql_inicial', { ...db, servidor_node_tz: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
      servidor_node_utc: new Date().toISOString() });
  } catch (err) {
    log.registrar('diagnostico_mysql_falhou', log.resumoErro(err), 'error');
  }
  diagnosticar().then((d) => {            // avisa já na subida se o computador não está pronto para ler PDFs
    if (d.problemas.length) {
      console.error('[importacao] ATENÇÃO: o leitor de PDFs NÃO está pronto neste computador:');
      d.problemas.forEach((p) => console.error(`  - ${p.mensagem}`));
    } else {
      console.log(`[importacao] leitor de PDFs pronto (Python ${d.python}, Tesseract OK).`);
    }
  });
  // O histórico e o gabarito são necessários para importar sem perder estado.
  // Não aceite tráfego se as migrações não foram aplicadas: isso deixa telas e
  // gravações parcialmente funcionais e pode esconder a causa real do erro.
  await repo.marcarTravadasComoFalhas(pool);
  await repo.carregarGabarito(pool);
}

module.exports = { ambiente, iniciar, obterStatus, listar, obterPreview, confirmar, cancelar, aoIniciar };


