'use strict';

// Cria as tabelas do sistema no banco configurado no .env (Aiven MySQL).
// As definições estão em scripts/schema.js.
//
// Uso:  npm run db:schema

const mysql = require('mysql2/promise');
const { obterConfigBanco } = require('../api/config/dbConfig');
const comandos = require('./schema');

async function main() {
  const conexao = await mysql.createConnection(obterConfigBanco());

  try {
    for (const comando of comandos) {
      await conexao.query(comando);
    }
    console.log(`Esquema aplicado com sucesso (${comandos.length} instruções).`);
  } catch (err) {
    console.error('Erro ao criar as tabelas:', err.message);
    process.exitCode = 1;
  } finally {
    await conexao.end();
  }
}

main();
