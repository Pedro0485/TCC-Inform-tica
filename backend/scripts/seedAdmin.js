// Script para criar a primeira coordenadora (admin = 1) no banco de dados.
// Necessário porque todo o CRUD de /professor é protegido e só uma coordenadora
// já existente pode criar outros professores — então a primeira precisa ser
// inserida manualmente.
//
// Uso:
//   node scripts/seedAdmin.js "Nome da Coordenadora" "email@exemplo.com" "senha123"

const bcrypt = require('bcrypt');
const pool = require('../api/config/db');

async function main() {
  const [nome, email, senha] = process.argv.slice(2);

  if (!nome || !email || !senha) {
    console.log('Uso: node scripts/seedAdmin.js "Nome" "email@exemplo.com" "senha123"');
    process.exit(1);
  }

  if (senha.length < 6) {
    console.error('A senha deve ter pelo menos 6 caracteres.');
    process.exit(1);
  }

  const emailNorm = email.trim().toLowerCase();
  const nomeNorm = nome.trim();

  try {
    const [exists] = await pool.query(
      'SELECT id FROM professores WHERE email = ? OR nome = ? LIMIT 1',
      [emailNorm, nomeNorm]
    );

    if (exists.length > 0) {
      console.error('Já existe um professor com esse nome ou email.');
      process.exit(1);
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const [result] = await pool.query(
      'INSERT INTO professores (nome, email, senha, admin) VALUES (?, ?, ?, 1)',
      [nomeNorm, emailNorm, senhaHash]
    );

    console.log(`Coordenadora criada com sucesso! id=${result.insertId}, email=${emailNorm}`);
  } catch (err) {
    console.error('Erro ao criar coordenadora:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
