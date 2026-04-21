const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Runs a single SQL query against the pool.
 * @param {string} text - SQL statement
 * @param {Array} params - bind parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Acquires a dedicated client for multi-statement transactions.
 * Caller is responsible for calling client.release().
 * @returns {Promise<import('pg').PoolClient>}
 */
function getClient() {
  return pool.connect();
}

module.exports = { pool, query, getClient };
