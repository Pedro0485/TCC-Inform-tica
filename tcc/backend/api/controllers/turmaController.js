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

// O código da turma funciona como uma senha: letras, números e símbolos,
// sem espaços, de 4 a 20 caracteres. Maiúsculas e minúsculas são diferentes.
function validarCodigo(codigo) {
  const c = String(codigo).trim();
  if (c.length < 4 || c.length > 20) return 'O código deve ter de 4 a 20 caracteres';
  if (/\s/.test(c)) return 'O código não pode ter espaços';
  return null;
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

    const erroCodigo = validarCodigo(codigo);
    if (erroCodigo) {
      return res.status(400).json({ error: erroCodigo });
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

// funcao publica: lista os nomes de cursos que possuem turma (usada no select do login)
async function listarCursosPublico(req, res) {
  try {
    const [rows] = await pool.query(`SELECT DISTINCT nome FROM turmas ORDER BY nome`);
    return res.json(rows.map((r) => r.nome));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao listar cursos' });
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

// funcao que lista as aulas gravadas de todas as turmas (somente coordenadora):
// é a fonte da grade exibida/editada pela coordenação
async function listarHorariosTurmas(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT turma_id, dia_semana, TIME_FORMAT(hora_inicio, '%H:%i') AS hora_inicio,
              TIME_FORMAT(hora_fim, '%H:%i') AS hora_fim, materia
         FROM aulas
        ORDER BY turma_id, hora_inicio, dia_semana`
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao listar horários das turmas' });
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
      const erroCodigo = validarCodigo(codigo);
      if (erroCodigo) {
        return res.status(400).json({ error: erroCodigo });
      }
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

// funcao para renomear uma matéria em todas as aulas já salvas (somente coordenadora)
// body: { de: 'Nome antigo', para: 'Nome novo' }
async function renomearMateria(req, res) {
  try {
    const de = String(req.body.de || '').trim();
    const para = String(req.body.para || '').trim();

    if (!de || !para) {
      return res.status(400).json({ error: 'Informe o nome atual e o novo nome da matéria' });
    }
    if (para.length > 150) {
      return res.status(400).json({ error: 'O nome da matéria pode ter no máximo 150 caracteres' });
    }

    const [result] = await pool.query(`UPDATE aulas SET materia = ? WHERE materia = ?`, [para, de]);

    // leva junto os professores atribuídos à matéria (ignora professores que já estejam no novo nome)
    await pool.query(`UPDATE IGNORE materias_professores SET materia = ? WHERE materia = ?`, [para, de]);
    await pool.query(`DELETE FROM materias_professores WHERE materia = ?`, [de]);

    return res.json({ atualizadas: result.affectedRows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao renomear matéria' });
  }
}

// funcao que lista os professores atribuídos a cada matéria (somente coordenadora)
// resposta: { "Matemática": [ { id, nome }, ... ], ... }
async function listarProfessoresMaterias(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT mp.materia, p.id, p.nome
         FROM materias_professores mp
         JOIN professores p ON p.id = mp.professor_id
        ORDER BY mp.materia, p.nome`
    );

    const mapa = {};
    rows.forEach((r) => {
      if (!mapa[r.materia]) mapa[r.materia] = [];
      mapa[r.materia].push({ id: r.id, nome: r.nome });
    });
    return res.json(mapa);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao listar professores das matérias' });
  }
}

// Recria os vínculos aulas_professores das aulas de uma matéria a partir de materias_professores
async function sincronizarAulasDaMateria(conn, materia) {
  await conn.query(
    `DELETE ap FROM aulas_professores ap JOIN aulas a ON a.id = ap.aula_id WHERE a.materia = ?`,
    [materia]
  );
  await conn.query(
    `INSERT IGNORE INTO aulas_professores (aula_id, professor_id)
     SELECT a.id, mp.professor_id
       FROM aulas a JOIN materias_professores mp ON mp.materia = a.materia
      WHERE a.materia = ?`,
    [materia]
  );
}

// funcao que define (substitui) os professores de uma matéria (somente coordenadora)
// body: { materia: 'Matemática', professores: [1, 2] }  (lista vazia remove todos)
async function definirProfessoresMateria(req, res) {
  const materia = String(req.body.materia || '').trim();
  const { professores } = req.body;

  if (!materia) {
    return res.status(400).json({ error: 'Informe a matéria' });
  }
  if (materia.length > 150) {
    return res.status(400).json({ error: 'O nome da matéria pode ter no máximo 150 caracteres' });
  }
  if (!Array.isArray(professores)) {
    return res.status(400).json({ error: 'Envie a lista de professores em "professores"' });
  }

  const ids = [...new Set(professores.map(Number))];
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    return res.status(400).json({ error: 'Lista de professores inválida' });
  }
  if (ids.length > 1) {
    return res.status(400).json({ error: 'Cada matéria pode ter apenas um professor' });
  }

  const conn = await pool.getConnection();
  try {
    // só aceita professores que realmente existem (e não a coordenadora, que não leciona)
    if (ids.length > 0) {
      const [validos] = await conn.query(
        `SELECT id FROM professores WHERE admin = 0 AND id IN (?)`,
        [ids]
      );
      if (validos.length !== ids.length) {
        return res.status(400).json({ error: 'Um ou mais professores não foram encontrados' });
      }
    }

    await conn.beginTransaction();
    await conn.query(`DELETE FROM materias_professores WHERE materia = ?`, [materia]);
    if (ids.length > 0) {
      await conn.query(
        `INSERT INTO materias_professores (materia, professor_id) VALUES ?`,
        [ids.map((id) => [materia, id])]
      );
    }
    // aplica a mudança nas aulas dessa matéria que já estão salvas
    await sincronizarAulasDaMateria(conn, materia);
    await conn.commit();

    return res.json({ materia, professores: ids });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ error: 'Erro ao atribuir professores à matéria' });
  } finally {
    conn.release();
  }
}

// funcao que remove os professores atribuídos a uma matéria excluída (somente coordenadora)
// body: { materia: 'Matemática' }
async function removerProfessoresMateria(req, res) {
  const materia = String(req.body.materia || '').trim();
  if (!materia) {
    return res.status(400).json({ error: 'Informe a matéria' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM materias_professores WHERE materia = ?`, [materia]);
    await sincronizarAulasDaMateria(conn, materia);
    await conn.commit();
    return res.status(204).send();
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ error: 'Erro ao remover professores da matéria' });
  } finally {
    conn.release();
  }
}

// funcao que lista as aulas da turma autenticada (login do aluno), com o professor de cada aula
async function minhasAulasTurma(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.dia_semana, a.hora_inicio, a.hora_fim, a.materia,
              t.nome AS turma_nome, t.ano AS turma_ano,
              GROUP_CONCAT(DISTINCT p.nome ORDER BY p.nome SEPARATOR ', ') AS professor
         FROM aulas a
         JOIN turmas t ON t.id = a.turma_id
         LEFT JOIN aulas_professores ap ON ap.aula_id = a.id
         LEFT JOIN professores p ON p.id = ap.professor_id
        WHERE a.turma_id = ?
        GROUP BY a.id
        ORDER BY a.hora_inicio, a.dia_semana`,
      [req.usuario.id]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao buscar horários de aulas' });
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
      `SELECT id, nome, ano, codigo, turno FROM turmas WHERE nome = ? AND ano = ? AND BINARY codigo = ? LIMIT 1`,
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

    // um único registro por dia + horário (vale o último enviado)
    const unicos = new Map();
    for (const h of horarios) {
      unicos.set(`${String(h && h.dia_semana).toLowerCase()}|${String(h && h.hora_inicio).slice(0, 5)}`, h);
    }

    for (const h of unicos.values()) {
      const { dia_semana, hora_inicio, hora_fim, materia } = h;

      if (!dia_semana || !hora_inicio || !hora_fim || !materia) {
        throw new Error('Cada horário precisa de dia_semana, hora_inicio, hora_fim e materia');
      }
      if (!DIAS_VALIDOS.includes(String(dia_semana).toLowerCase())) {
        throw new Error(`dia_semana inválido: ${dia_semana}`);
      }

      const [ins] = await conn.query(
        `INSERT INTO aulas (turma_id, dia_semana, hora_inicio, hora_fim, materia) VALUES (?, ?, ?, ?, ?)`,
        [id, String(dia_semana).toLowerCase(), hora_inicio, hora_fim, String(materia).trim()]
      );

      // já vincula à aula os professores atribuídos a essa matéria
      await conn.query(
        `INSERT IGNORE INTO aulas_professores (aula_id, professor_id)
         SELECT ?, professor_id FROM materias_professores WHERE materia = ?`,
        [ins.insertId, String(materia).trim()]
      );
    }

    await conn.commit();
    return res.json({ mensagem: 'Horários da turma salvos', total_aulas: unicos.size });
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

    // reenviar o horário de uma turma substitui o anterior (evita aulas duplicadas)
    const turmasDoLote = [...new Set(horarios.map((h) => Number(h && h.turma_id)).filter(Boolean))];
    if (turmasDoLote.length > 0) {
      await conn.query('DELETE FROM aulas WHERE turma_id IN (?)', [turmasDoLote]);
    }

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
      } else {
        // sem professores no PDF: usa os atribuídos à matéria
        await conn.query(
          `INSERT IGNORE INTO aulas_professores (aula_id, professor_id)
           SELECT ?, professor_id FROM materias_professores WHERE materia = ?`,
          [aulaId, String(materia).trim()]
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
  minhasAulasTurma,
  renomearMateria,
  listarProfessoresMaterias,
  definirProfessoresMateria,
  removerProfessoresMateria,
  listarCursosPublico,
  criarTurma,
  listarTurmas,
  listarHorariosTurmas,
  buscarTurma,
  atualizarTurma,
  deletarTurma,
  loginTurma,
  uploadHorarios,
  salvarHorariosLidos,
  salvarHorariosTurma
};