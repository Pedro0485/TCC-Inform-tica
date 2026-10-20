const path = require('path');
const { spawn } = require('child_process');

const pool = require('../config/db');
const { gerarTokenTurma } = require('../utils/jwt');

// Caminho do script Python responsável por ler o PDF de horários
const PYTHON_SCRIPT = path.join(__dirname, '..', '..', 'python', 'read_pdf.py');
// Permite trocar o executável (ex: "python", "python3", ou caminho de uma venv) via .env
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

const TURNOS_VALIDOS = ['matutino', 'integral', 'vespertino', 'noturno'];

//funcao para validar o ano da turm
function validarAno(ano) {
  const n = Number(ano);
  return Number.isInteger(n) && n >= 1 && n <= 3;
}

// funcao para criar uma nova turma (somente coordenadora)
async function criarTurma(req, res) {
  try {
    const { nome, ano, codigo, turno } = req.body;

    if (!nome || !ano || !codigo || !turno) {
      return res.status(400).json({ error: 'Preencha todos os campos' });
    }

    if (!validarAno(ano)) {
      return res.status(400).json({ error: 'Ano deve ser 1, 2 ou 3' });
    }

    if (!TURNOS_VALIDOS.includes(String(turno).toLowerCase())) {
      return res.status(400).json({ error: `Turno deve ser um de: ${TURNOS_VALIDOS.join(', ')}` });
    }

    const nomeNorm = String(nome).trim().toLowerCase();
    const codigoNorm = String(codigo).trim();

    const [exists] = await pool.query(
      `SELECT id FROM turmas WHERE (nome = ? AND ano = ?) OR codigo = ? LIMIT 1`,
      [nomeNorm, ano, codigoNorm]
    );

    if (exists.length > 0) {
      return res.status(400).json({ error: 'Já existe uma turma com esse nome/ano ou código' });
    }

    const [result] = await pool.query(
      `INSERT INTO turmas (nome, ano, codigo, turno) VALUES (?, ?, ?, ?)`,
      [nomeNorm, ano, codigoNorm, String(turno).toLowerCase()]
    );

    return res.status(201).json({
      id: result.insertId,
      nome: nomeNorm,
      ano: Number(ano),
      codigo: codigoNorm,
      turno: String(turno).toLowerCase()
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Já existe uma turma com esse nome/ano ou código' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Erro ao cadastrar turma' });
  }
}

// funcao para listar todas as turmas (somente coordenadora)
async function listarTurmas(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, nome, ano, codigo, turno, created_at, updated_at FROM turmas ORDER BY nome, ano`
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao listar turmas' });
  }
}

// funcao para buscar uma turma por id (somente coordenadora)
async function buscarTurma(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT id, nome, ano, codigo, turno, created_at, updated_at FROM turmas WHERE id = ? LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Turma não encontrada' });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao buscar turma' });
  }
}

// funcao para atualizar uma turma por id (somente coordenadora)
async function atualizarTurma(req, res) {
  try {
    const { id } = req.params;
    const { nome, ano, codigo, turno } = req.body;

    const [rows] = await pool.query(`SELECT id FROM turmas WHERE id = ? LIMIT 1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Turma não encontrada' });
    }

    const campos = [];
    const valores = [];

    if (nome !== undefined) {
      campos.push('nome = ?');
      valores.push(String(nome).trim().toLowerCase());
    }

    if (ano !== undefined) {
      if (!validarAno(ano)) {
        return res.status(400).json({ error: 'Ano deve ser 1, 2 ou 3' });
      }
      campos.push('ano = ?');
      valores.push(ano);
    }

    if (codigo !== undefined) {
      campos.push('codigo = ?');
      valores.push(String(codigo).trim());
    }

    if (turno !== undefined) {
      if (!TURNOS_VALIDOS.includes(String(turno).toLowerCase())) {
        return res.status(400).json({ error: `Turno deve ser um de: ${TURNOS_VALIDOS.join(', ')}` });
      }
      campos.push('turno = ?');
      valores.push(String(turno).toLowerCase());
    }

    if (campos.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    valores.push(id);

    await pool.query(`UPDATE turmas SET ${campos.join(', ')} WHERE id = ?`, valores);

    const [atualizado] = await pool.query(
      `SELECT id, nome, ano, codigo, turno, created_at, updated_at FROM turmas WHERE id = ?`,
      [id]
    );

    return res.json(atualizado[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Já existe uma turma com esse nome/ano ou código' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Erro ao atualizar turma' });
  }
}

// funcao para deletar uma turma por id (somente coordenadora)
async function deletarTurma(req, res) {
  try {
    const { id } = req.params;

    const [result] = await pool.query(`DELETE FROM turmas WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Turma não encontrada' });
    }

    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao excluir turma' });
  }
}

// funcao para login de turma (somente coordenadora)
async function loginTurma(req, res) {
  try {
    const { turma, ano, codigoTurma } = req.body;

    if (!turma || !ano || !codigoTurma) {
      return res.status(400).json({ message: 'Preencha todos os campos' });
    }

    const nomeNorm = String(turma).trim().toLowerCase();
    const codigoNorm = String(codigoTurma).trim();

    const [rows] = await pool.query(
      `SELECT id, nome, ano, codigo, turno FROM turmas WHERE nome = ? AND ano = ? AND codigo = ? LIMIT 1`,
      [nomeNorm, ano, codigoNorm]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Código da turma inválido!' });
    }

    const turmaEncontrada = rows[0];
    const token = gerarTokenTurma(turmaEncontrada);

    return res.json({
      token,
      turma: turmaEncontrada
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao acessar turma' });
  }
}

// Executa backend/python/read_pdf.py em um processo separado, passando o
// caminho do arquivo salvo e o id da turma. O script le o PDF, extrai as
// aulas e ele mesmo envia o resultado pra rota interna POST /turmas/horarios-lidos.
// Aqui a gente so acompanha a saida do processo pra devolver status pro front.
function executarLeituraPdf(caminhoArquivo, turmaId) {
  return new Promise((resolve, reject) => {
    const processo = spawn(PYTHON_BIN, [PYTHON_SCRIPT, caminhoArquivo, String(turmaId)]);

    let saida = '';
    let erro = '';

    processo.stdout.on('data', (chunk) => { saida += chunk.toString(); });
    processo.stderr.on('data', (chunk) => { erro += chunk.toString(); });

    processo.on('error', (err) => {
      // ex: python3 não encontrado no PATH do servidor
      reject(new Error(`Não foi possível iniciar o script Python: ${err.message}`));
    });

    processo.on('close', (codigo) => {
      let resultado = null;
      try {
        // o script sempre imprime uma linha de JSON no stdout (mesmo em erro)
        resultado = JSON.parse(saida.trim().split('\n').pop());
      } catch (parseErr) {
        return reject(new Error(erro || saida || 'Saída inválida do script de leitura do PDF'));
      }

      if (codigo !== 0 || resultado.erro) {
        return reject(new Error(resultado.erro || erro || 'Falha ao processar o PDF de horários'));
      }

      return resolve(resultado);
    });
  });
}

// funcao para receber o upload do arquivo de horarios (PDF/XLS/XLSX/CSV)
// o arquivo ja chega salvo em disco (uploads/horarios) pelo multer antes desta funcao rodar
async function uploadHorarios(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const { turma_id } = req.body;

    if (!turma_id) {
      return res.status(400).json({ error: 'Informe o turma_id da turma dona desse horário' });
    }

    const [turmaExiste] = await pool.query('SELECT id FROM turmas WHERE id = ? LIMIT 1', [turma_id]);
    if (turmaExiste.length === 0) {
      return res.status(404).json({ error: 'Turma não encontrada' });
    }

    // Somente PDF passa pelo script Python por enquanto (extração de XLS/XLSX/CSV
    // pode ser adicionada depois em read_pdf.py ou em um script equivalente).
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.pdf') {
      return res.status(201).json({
        mensagem: 'Arquivo recebido, mas apenas PDF é processado automaticamente no momento',
        arquivo: req.file.filename,
        caminho: req.file.path
      });
    }

    try {
      const resultado = await executarLeituraPdf(req.file.path, turma_id);
      return res.status(201).json({
        mensagem: 'Arquivo processado e horários cadastrados com sucesso',
        arquivo: req.file.filename,
        total_aulas: resultado.total_aulas
      });
    } catch (erroLeitura) {
      // o arquivo já foi salvo em disco; o erro é só na extração/gravação dos horários
      console.error('Erro ao ler PDF de horários:', erroLeitura.message);
      return res.status(422).json({
        error: 'Arquivo salvo, mas não foi possível extrair os horários automaticamente',
        detalhe: erroLeitura.message,
        arquivo: req.file.filename
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao salvar o arquivo de horários' });
  }
}

const DIAS_VALIDOS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

// funcao que substitui TODOS os horarios (aulas) de uma turma pelos enviados
// body: { horarios: [ { dia_semana, hora_inicio, hora_fim, materia } ] }  (lista pode ser vazia)
async function salvarHorariosTurma(req, res) {
  const { id } = req.params;
  const { horarios } = req.body;

  if (!Array.isArray(horarios)) {
    return res.status(400).json({ error: 'Envie a lista de horários em "horarios"' });
  }

  const conn = await pool.getConnection();
  try {
    const [turma] = await conn.query('SELECT id FROM turmas WHERE id = ? LIMIT 1', [id]);
    if (turma.length === 0) {
      return res.status(404).json({ error: 'Turma não encontrada' });
    }

    await conn.beginTransaction();
    await conn.query('DELETE FROM aulas WHERE turma_id = ?', [id]);

    for (const h of horarios) {
      const { dia_semana, hora_inicio, hora_fim, materia } = h;

      if (!dia_semana || !hora_inicio || !hora_fim || !materia) {
        throw new Error('Cada horário precisa de dia_semana, hora_inicio, hora_fim e materia');
      }
      if (!DIAS_VALIDOS.includes(String(dia_semana).toLowerCase())) {
        throw new Error(`dia_semana inválido: ${dia_semana}`);
      }

      await conn.query(
        `INSERT INTO aulas (turma_id, dia_semana, hora_inicio, hora_fim, materia) VALUES (?, ?, ?, ?, ?)`,
        [id, String(dia_semana).toLowerCase(), hora_inicio, hora_fim, String(materia).trim()]
      );
    }

    await conn.commit();
    return res.json({ mensagem: 'Horários da turma salvos', total_aulas: horarios.length });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(400).json({ error: err.message || 'Erro ao salvar horários da turma' });
  } finally {
    conn.release();
  }
}

// funcao que recebe o JSON ja processado (pelo script Python) e grava na tabela `aulas`
// formato esperado no body: um array de objetos, ex:
// [
//   { turma_id: 1, dia_semana: 'segunda', hora_inicio: '07:00', hora_fim: '07:50',
//     materia: 'Matemática', professores: [2, 3] }  // professores é opcional
// ]
async function salvarHorariosLidos(req, res) {
  const horarios = req.body;

  if (!Array.isArray(horarios) || horarios.length === 0) {
    return res.status(400).json({ error: 'Envie um array de horários' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const inseridos = [];

    for (const h of horarios) {
      const { turma_id, dia_semana, hora_inicio, hora_fim, materia, professores } = h;

      if (!turma_id || !dia_semana || !hora_inicio || !hora_fim || !materia) {
        throw new Error('Cada horário precisa de turma_id, dia_semana, hora_inicio, hora_fim e materia');
      }

      if (!DIAS_VALIDOS.includes(String(dia_semana).toLowerCase())) {
        throw new Error(`dia_semana inválido: ${dia_semana}`);
      }

      const [result] = await conn.query(
        `INSERT INTO aulas (turma_id, dia_semana, hora_inicio, hora_fim, materia) VALUES (?, ?, ?, ?, ?)`,
        [turma_id, String(dia_semana).toLowerCase(), hora_inicio, hora_fim, materia]
      );

      const aulaId = result.insertId;

      if (Array.isArray(professores) && professores.length > 0) {
        const valores = professores.map((profId) => [aulaId, profId]);
        await conn.query(
          `INSERT INTO aulas_professores (aula_id, professor_id) VALUES ?`,
          [valores]
        );
      }

      inseridos.push(aulaId);
    }

    await conn.commit();
    return res.status(201).json({ mensagem: 'Horários salvos no banco com sucesso', ids: inseridos });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(400).json({ error: err.message || 'Erro ao salvar horários no banco' });
  } finally {
    conn.release();
  }
}

module.exports = {
  criarTurma,
  listarTurmas,
  buscarTurma,
  atualizarTurma,
  deletarTurma,
  loginTurma,
  uploadHorarios,
  salvarHorariosLidos,
  salvarHorariosTurma
};