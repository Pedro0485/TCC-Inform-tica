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

module.exports = pool;
