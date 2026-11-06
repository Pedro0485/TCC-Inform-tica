// Aplica as migrações de database/migrations/*.js que ainda não foram aplicadas.
// É seguro rodar quantas vezes quiser (cada migração é idempotente e fica registrada
// na tabela schema_migrations).
//
// Uso:  npm run db:migrate
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { obterConfigBanco } = require('../api/config/dbConfig');

async function main() {
  const conn = await mysql.createConnection(obterConfigBanco());
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(100) PRIMARY KEY,
      aplicada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    const pasta = path.join(__dirname, '..', 'database', 'migrations');
    const arquivos = fs.readdirSync(pasta).filter((f) => f.endsWith('.js')).sort();
    const [feitas] = await conn.query('SELECT id FROM schema_migrations');
    const jaAplicadas = new Set(feitas.map((r) => r.id));

    let aplicou = 0;
    for (const arq of arquivos) {
      const mig = require(path.join(pasta, arq));
      if (jaAplicadas.has(mig.id)) continue;
      console.log(`Aplicando ${mig.id}: ${mig.descricao}`);
      await mig.up(conn);
      await conn.query('INSERT INTO schema_migrations (id) VALUES (?)', [mig.id]);
      aplicou++;
    }
    console.log(aplicou ? `${aplicou} migração(ões) aplicada(s).` : 'Banco já está atualizado.');
  } catch (err) {
    console.error('Erro na migração:', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
