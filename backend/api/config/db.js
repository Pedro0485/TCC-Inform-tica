'use strict';

const mysql = require('mysql2/promise');
const { obterConfigBanco } = require('./dbConfig');

const pool = mysql.createPool(
  obterConfigBanco({
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    connectTimeout: 20000,
  })
);

const dbLog = require('../services/importacaoHorarios/log');
pool.on('connection', (conn) => {
  conn.on('error', (err) => dbLog.registrar('mysql_conexao_com_erro', {
    codigo: err.code || err.errno || err.name, fatal: !!err.fatal,
  }, 'error'));
});

module.exports = pool;
