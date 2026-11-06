'use strict';

// Confere se o banco configurado no .env tem as tabelas e colunas que o sistema usa
// (útil quando o banco foi criado/importado por outro caminho e ficou diferente do esperado).
//
// Uso:  npm run db:check

const mysql = require('mysql2/promise');
const { obterConfigBanco } = require('../api/config/dbConfig');

const ESPERADO = {
  professores: ['id', 'nome', 'email', 'senha', 'admin'],
  turmas: ['id', 'nome', 'ano', 'codigo', 'turno'],
  aulas: ['id', 'turma_id', 'dia_semana', 'hora_inicio', 'hora_fim', 'materia', 'importacao_id'],
  aulas_professores: ['aula_id', 'professor_id'],
  notificacoes: ['id', 'titulo', 'mensagem', 'tipo', 'destino_tipo', 'destino_id', 'criado_por'],
  notificacoes_destinos: ['id', 'notificacao_id', 'destino_tipo', 'destino_id'],
  notificacoes_lidas: ['id', 'notificacao_id', 'destinatario_tipo', 'destinatario_id'],
  materias_professores: ['materia', 'professor_id'],
  eventos: ['id', 'titulo', 'data_evento', 'notificacao_id', 'criado_por_tipo', 'criado_por_id'],
  importacoes_horarios: ['id', 'criado_por', 'nome_original', 'arquivo_sha256', 'status', 'dados_json', 'snapshot_anterior', 'resultado_json'],
  schema_migrations: ['id'],
};

async function main() {
  const conn = await mysql.createConnection(obterConfigBanco());
  let problemas = 0;
  try {
    const [linhas] = await conn.query(
      'SELECT TABLE_NAME t, COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()');
    const atual = {};
    linhas.forEach((l) => { (atual[l.t] = atual[l.t] || new Set()).add(l.c); });

    for (const [tabela, colunas] of Object.entries(ESPERADO)) {
      if (!atual[tabela]) { console.log(`FALTA tabela: ${tabela}`); problemas++; continue; }
      const faltando = colunas.filter((c) => !atual[tabela].has(c));
      if (faltando.length) { console.log(`FALTAM colunas em ${tabela}: ${faltando.join(', ')}`); problemas++; }
    }
    console.log(problemas ? `\n${problemas} problema(s) encontrado(s).` : 'Banco OK: todas as tabelas e colunas esperadas existem.');
  } finally {
    await conn.end();
  }
  process.exitCode = problemas ? 1 : 0;
}

main().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
