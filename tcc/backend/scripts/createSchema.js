// Script para criar as tabelas do banco (professores, turmas, aulas, aulas_professores)
// lendo o arquivo scripts/schema.sql e executando via mysql2, usando os mesmos
// dados de conexão do .env que o resto do projeto já usa.
//
// Uso:
//   npm run db:schema

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3307,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true // necessário pra rodar todos os CREATE TABLE de uma vez
  });

  try {
    await connection.query(sql);
    console.log('Tabelas criadas/verificadas com sucesso, incluindo notificacoes e notificacoes_lidas.');
  } catch (err) {
    console.error('Erro ao criar as tabelas:', err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main();
