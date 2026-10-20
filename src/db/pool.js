const { Pool } = require('pg');
const config = require('../config');

let poolInstance = null;

function createPoolConfig() {
  const dbConfig = config.database;

  if (dbConfig.connectionString) {
    return {
      connectionString: dbConfig.connectionString,
      ssl: dbConfig.ssl,
      max: dbConfig.maxPoolSize,
      idleTimeoutMillis: dbConfig.idleTimeoutMillis,
      connectionTimeoutMillis: dbConfig.connectionTimeoutMillis,
    };
  }

  return {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.name,
    user: dbConfig.user,
    password: dbConfig.password,
    max: dbConfig.maxPoolSize,
    idleTimeoutMillis: dbConfig.idleTimeoutMillis,
    connectionTimeoutMillis: dbConfig.connectionTimeoutMillis,
    ssl: dbConfig.ssl,
  };
}

function getPool() {
  if (!poolInstance) {
    poolInstance = new Pool(createPoolConfig());

    poolInstance.on('error', (err) => {
      console.error('[PostgreSQL Pool Error] Unexpected idle client error:', err);
    });
  }
  return poolInstance;
}

/**
 * Execute a parameterized SQL query against the connection pool
 * @param {string} text - SQL query text
 * @param {Array} [params] - Query parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  const pool = getPool();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (config.nodeEnv === 'development' && process.env.DEBUG_SQL === 'true') {
      console.log(`[SQL Query] duration=${duration}ms rows=${res.rowCount}`);
    }
    return res;
  } catch (err) {
    console.error(`[SQL Error] Failed to execute query: "${text.substring(0, 80)}..."`, err.message);
    throw err;
  }
}

/**
 * Acquire a dedicated client from the pool (e.g. for transactions)
 */
async function getClient() {
  const pool = getPool();
  return await pool.connect();
}

/**
 * Verify database connectivity
 */
async function checkConnection() {
  try {
    const res = await query('SELECT NOW() AS current_time, 1 AS health_check');
    return {
      connected: true,
      time: res.rows[0].current_time,
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message,
    };
  }
}

/**
 * Gracefully close the connection pool
 */
async function closePool() {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

module.exports = {
  getPool,
  query,
  getClient,
  checkConnection,
  closePool,
};
