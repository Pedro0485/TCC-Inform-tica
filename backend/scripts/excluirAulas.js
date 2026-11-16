'use strict';

// Exclui todas as aulas e todas as turmas. Professores/coordenadoras permanecem.
// Uso: node scripts/excluirAulas.js [--confirmar]
// Com --confirmar, exige digitar EXCLUIR antes de executar.

const readline = require('readline');
const pool = require('../api/config/db');

function perguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(texto, (r) => { rl.close(); resolve(r); }));
}

async function main() {
  const confirmar = process.argv.includes('--confirmar');
  const [[{ aulas }]] = await pool.query('SELECT COUNT(*) AS aulas FROM aulas');
  const [[{ turmas }]] = await pool.query('SELECT COUNT(*) AS turmas FROM turmas');
  const [[{ vinculos }]] = await pool.query('SELECT COUNT(*) AS vinculos FROM aulas_professores');

  console.log('');
  console.log(`Aulas que serão excluídas         : ${aulas}`);
  console.log(`Turmas que também serão excluídas : ${turmas}`);
  console.log(`Vínculos aula-professor removidos : ${vinculos}`);
  console.log('Professores e coordenadoras serão preservados.');
  console.log('');

  if (!confirmar) {
    console.log('Nada foi apagado (modo simulação).');
    console.log('Para executar, rode: npm run excluir:aulas -- --confirmar');
    return;
  }

  const resposta = await perguntar('Digite EXCLUIR para apagar todas as aulas e turmas: ');
  if (resposta.trim() !== 'EXCLUIR') {
    console.log('Cancelado. Nada foi apagado.');
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rAulas] = await conn.query('DELETE FROM aulas');
    const [rTurmas] = await conn.query('DELETE FROM turmas');
    await conn.commit();
    console.log(`Pronto: ${rAulas.affectedRows} aula(s) e ${rTurmas.affectedRows} turma(s) excluída(s).`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

main()
  .catch((err) => { console.error('Erro:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
