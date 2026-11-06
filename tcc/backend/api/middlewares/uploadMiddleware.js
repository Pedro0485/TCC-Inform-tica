const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Pasta específica do projeto onde os arquivos de horários ficam salvos
// (backend/uploads/horarios)
const PASTA_HORARIOS = path.join(__dirname, '..', '..', 'uploads', 'horarios');

if (!fs.existsSync(PASTA_HORARIOS)) {
  fs.mkdirSync(PASTA_HORARIOS, { recursive: true });
}

const EXTENSOES_PERMITIDAS = ['.pdf', '.xls', '.xlsx', '.csv'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PASTA_HORARIOS),
  filename: (req, file, cb) => {
    // timestamp + nome original, pra nunca sobrescrever um arquivo já enviado
    const nomeSeguro = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}-${nomeSeguro}`);
  }
});

const uploadHorarios = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!EXTENSOES_PERMITIDAS.includes(ext)) {
      return cb(new Error('Tipo de arquivo não permitido. Envie PDF, XLS, XLSX ou CSV.'));
    }
    cb(null, true);
  }
});

module.exports = { uploadHorarios, PASTA_HORARIOS };