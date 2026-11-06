'use strict';

// Exclui TODOS os professores (admin = 0). Coordenadoras (admin = 1) NÃO são tocadas.
//
// Colocar este arquivo em:  backend/scripts/excluirProfessores.js
//
// Uso (dentro da pasta backend):
//   node scripts/excluirProfessores.js              -> só MOSTRA o que seria excluído (não apaga nada)
//   node scripts/excluirProfessores.js --confirmar  -> pede para digitar EXCLUIR e então apaga
//
// O que acontece ao excluir um professor (pelas regras do banco):
//   - some o login dele;
//   - saem os vínculos dele com as aulas (aulas_professores) e com as matérias (materias_professores);
//   - as AULAS e as TURMAS continuam existindo, só ficam sem professor.

const readline = require('readline');
const pool = require('../api/config/db');

function perguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(texto, (r) => { rl.close(); resolve(r); }));
}

async function main() {
  const confirmar = process.argv.includes('--confirmar');

  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM professores WHERE admin = 0');
  const [[{ admins }]] = await pool.query('SELECT COUNT(*) AS admins FROM professores WHERE admin = 1');
  const [[{ vinculos }]] = await pool.query(
    `SELECT COUNT(*) AS vinculos FROM aulas_professores ap
       JOIN professores p ON p.id = ap.professor_id WHERE p.admin = 0`);

  console.log('');
  console.log(`Professores que serão excluídos : ${total}`);
  console.log(`Vínculos com aulas removidos    : ${vinculos}`);
  console.log(`Coordenadoras preservadas       : ${admins}`);
  console.log('');

  if (total === 0) {
    console.log('Não há professores para excluir.');
    return;
  }

  if (!confirmar) {
    console.log('Nada foi apagado (modo simulação).');
    console.log('Para apagar de verdade, rode:  node scripts/excluirProfessores.js --confirmar');
    return;
  }

  const resposta = await perguntar('Digite EXCLUIR para apagar todos os professores: ');
  if (resposta.trim() !== 'EXCLUIR') {
    console.log('Cancelado. Nada foi apagado.');
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query('DELETE FROM professores WHERE admin = 0');
    await conn.commit();
    console.log(`Pronto: ${r.affectedRows} professor(es) excluído(s).`);
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
