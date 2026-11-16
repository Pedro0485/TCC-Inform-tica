'use strict';

// Configuração única de conexão com o MySQL (usada pela API e pelos scripts).
// Lê tudo do backend/.env — nenhuma credencial fica no código.
//
// Variáveis:
//   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME  -> dados do servidor MySQL (Aiven)
//   DB_SSL=true|false                                -> usa conexão criptografada (obrigatória na Aiven)
//   DB_SSL_CA=certs/ca.pem                           -> (opcional) certificado CA baixado do painel da Aiven;
//                                                       com ele, o certificado do servidor é verificado.

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

function montarSsl() {
  const sslAtivo = String(process.env.DB_SSL).toLowerCase() === 'true';
  if (process.env.NODE_ENV === 'production' && !sslAtivo) {
    throw new Error('DB_SSL=true e obrigatorio em producao.');
  }
  if (!sslAtivo) return undefined;

  const caPath = process.env.DB_SSL_CA;
  if (caPath) {
    const absoluto = path.isAbsolute(caPath) ? caPath : path.join(__dirname, '..', '..', caPath);
    return { ca: fs.readFileSync(absoluto, 'utf8'), rejectUnauthorized: true };
  }
  // Valida a cadeia de certificados do servidor usando as CAs confiáveis do Node.
  // Se o provedor usar uma CA privada, configure DB_SSL_CA com o certificado baixado no painel.
  return { rejectUnauthorized: true };
}

function obterConfigBanco(extra = {}) {
  const obrigatorias = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const faltando = obrigatorias.filter((nome) => !process.env[nome]);
  if (faltando.length) {
    throw new Error(`Variáveis ausentes no backend/.env: ${faltando.join(', ')}`);
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: montarSsl(),
    charset: 'utf8mb4',
    ...extra,
  };
}

module.exports = { obterConfigBanco };
