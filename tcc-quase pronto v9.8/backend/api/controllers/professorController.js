const bcrypt = require("bcrypt");
const pool = require("../config/db");
const { gerarTokenProfessor } = require("../utils/jwt");
const { normalizarEntradaLogin, usaSenhaProvisoria } = require("../utils/loginProfessor");

// valida se o email e valido
function validarEmail(email) {
  return (
    typeof email === "string" && email.includes("@") && email.trim().length >= 5
  );
}

// funcao para logar o usuario
async function login(req, res) {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: "Preencha todos os campos" });
    }

    const emailNorm = normalizarEntradaLogin(email);

    const [rows] = await pool.query(
      `SELECT id, nome, email, senha, admin FROM professores WHERE email = ? LIMIT 1`,
      [emailNorm],
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Email ou senha inválidos!" });
    }

    const professor = rows[0];
    const senhaOk = professor.senha ? await bcrypt.compare(String(senha), professor.senha) : false;

    if (!senhaOk) {
      return res.status(401).json({ message: "Email ou senha inválidos!" });
    }

    const token = gerarTokenProfessor(professor);

    return res.json({
      token,
      professor: {
        id: professor.id,
        nome: professor.nome,
        email: professor.email,
        admin: !!professor.admin,
        deveTrocarSenha: usaSenhaProvisoria(professor.email, senha),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao efetuar login" });
  }
}

// funcao para criar um novo professor(somente coordenadora)
async function criarProfessor(req, res) {
  try {
    const { nome, email, senha, admin } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: "Preencha todos os campos" });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const nomeNorm = String(nome).trim();

    if (!validarEmail(emailNorm)) {
      return res.status(400).json({ error: "email inválido" });
    }

    if (String(senha).length < 6) {
      return res
        .status(400)
        .json({ error: "senha deve ter pelo menos 6 caracteres" });
    }

    const [exists] = await pool.query(
      `SELECT id FROM professores WHERE email = ? OR nome = ? LIMIT 1`,
      [emailNorm, nomeNorm],
    );

    if (exists.length > 0) {
      return res.status(400).json({ error: "Nome ou email já cadastrado" });
    }

    const senhaHash = await bcrypt.hash(String(senha), 10);
    const isAdmin = admin ? 1 : 0;

    const [result] = await pool.query(
      `INSERT INTO professores (nome, email, senha, admin) VALUES (?, ?, ?, ?)`,
      [nomeNorm, emailNorm, senhaHash, isAdmin],
    );

    return res.status(201).json({
      id: result.insertId,
      nome: nomeNorm,
      email: emailNorm,
      admin: !!isAdmin,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao cadastrar professor" });
  }
}

// funcao para o usuário logado (professor ou coordenadora) ver seus próprios dados
async function meuPerfil(req, res) {
  try {
    const id = req.usuario.id;

    const [rows] = await pool.query(
      `SELECT id, nome, email, admin, created_at, updated_at FROM professores WHERE id = ? LIMIT 1`,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao buscar perfil" });
  }
}

// funcao que lista as aulas do professor autenticado (turma = sala), lidas do banco
async function minhasAulas(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.dia_semana, a.hora_inicio, a.hora_fim, a.materia,
              t.id AS turma_id, t.nome AS turma_nome, t.ano AS turma_ano, t.turno
         FROM aulas a
         JOIN aulas_professores ap ON ap.aula_id = a.id
         JOIN turmas t ON t.id = a.turma_id
        WHERE ap.professor_id = ?
        ORDER BY a.hora_inicio, a.dia_semana`,
      [req.usuario.id],
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao buscar horários de aulas" });
  }
}

// funcao para o usuário logado (professor ou coordenadora) atualizar seus próprios
// dados (nome, email, senha) — nunca o campo "admin", pra ninguém se autopromover
async function atualizarMeuPerfil(req, res) {
  try {
    const id = req.usuario.id;
    const { nome, email, senha } = req.body;

    const campos = [];
    const valores = [];

    if (nome !== undefined) {
      const nomeNorm = String(nome).trim();
      if (!nomeNorm) {
        return res.status(400).json({ error: "nome não pode ficar vazio" });
      }
      campos.push("nome = ?");
      valores.push(nomeNorm);
    }

    if (email !== undefined) {
      const emailNorm = String(email).trim().toLowerCase();
      if (!validarEmail(emailNorm)) {
        return res.status(400).json({ error: "email inválido" });
      }
      campos.push("email = ?");
      valores.push(emailNorm);
    }

    if (senha !== undefined && String(senha).length > 0) {
      if (String(senha).length < 6) {
        return res
          .status(400)
          .json({ error: "senha deve ter pelo menos 6 caracteres" });
      }
      const senhaHash = await bcrypt.hash(String(senha), 10);
      campos.push("senha = ?");
      valores.push(senhaHash);
    }

    if (campos.length === 0) {
      return res.status(400).json({ error: "Nenhum campo para atualizar" });
    }

    valores.push(id);

    await pool.query(
      `UPDATE professores SET ${campos.join(", ")} WHERE id = ?`,
      valores,
    );

    const [atualizado] = await pool.query(
      `SELECT id, nome, email, admin, created_at, updated_at FROM professores WHERE id = ?`,
      [id],
    );

    return res.json(atualizado[0]);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Nome ou email já cadastrado" });
    }
    console.error(err);
    return res.status(500).json({ error: "Erro ao atualizar perfil" });
  }
}

// funcao para listar todos os professores (somente coordenadora)
async function listarProfessores(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, nome, email, admin, created_at, updated_at FROM professores ORDER BY nome`,
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao listar professores" });
  }
}

// funcao para buscar um professor por id (somente coordenadora)
async function buscarProfessor(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT id, nome, email, admin, created_at, updated_at FROM professores WHERE id = ? LIMIT 1`,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Professor não encontrado" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao buscar professor" });
  }
}

// funcao para atualizar um professor por id (somente coordenadora)
async function atualizarProfessor(req, res) {
  try {
    const { id } = req.params;
    const { nome, email, senha, admin } = req.body;

    const [rows] = await pool.query(
      `SELECT id FROM professores WHERE id = ? LIMIT 1`,
      [id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Professor não encontrado" });
    }

    const campos = [];
    const valores = [];

    if (nome !== undefined) {
      campos.push("nome = ?");
      valores.push(String(nome).trim());
    }

    if (email !== undefined) {
      const emailNorm = String(email).trim().toLowerCase();
      if (!validarEmail(emailNorm)) {
        return res.status(400).json({ error: "email inválido" });
      }
      campos.push("email = ?");
      valores.push(emailNorm);
    }

    if (senha !== undefined) {
      if (String(senha).length < 6) {
        return res
          .status(400)
          .json({ error: "senha deve ter pelo menos 6 caracteres" });
      }
      const senhaHash = await bcrypt.hash(String(senha), 10);
      campos.push("senha = ?");
      valores.push(senhaHash);
    }

    if (admin !== undefined) {
      campos.push("admin = ?");
      valores.push(admin ? 1 : 0);
    }

    if (campos.length === 0) {
      return res.status(400).json({ error: "Nenhum campo para atualizar" });
    }

    valores.push(id);

    await pool.query(
      `UPDATE professores SET ${campos.join(", ")} WHERE id = ?`,
      valores,
    );

    const [atualizado] = await pool.query(
      `SELECT id, nome, email, admin, created_at, updated_at FROM professores WHERE id = ?`,
      [id],
    );

    return res.json(atualizado[0]);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Nome ou email já cadastrado" });
    }
    console.error(err);
    return res.status(500).json({ error: "Erro ao atualizar professor" });
  }
}

// funcao para deletar um professor por id (somente coordenadora)
async function deletarProfessor(req, res) {
  try {
    const { id } = req.params;

    if (req.usuario && String(req.usuario.id) === String(id)) {
      return res
        .status(400)
        .json({ error: "Você não pode excluir seu próprio usuário" });
    }

    const [result] = await pool.query(`DELETE FROM professores WHERE id = ?`, [
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Professor não encontrado" });
    }

    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao excluir professor" });
  }
}

module.exports = {
  login,
  meuPerfil,
  minhasAulas,
  atualizarMeuPerfil,
  criarProfessor,
  listarProfessores,
  buscarProfessor,
  atualizarProfessor,
  deletarProfessor,
};
