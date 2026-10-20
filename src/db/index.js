const pool = require('./pool');

module.exports = {
  pool: pool.getPool,
  query: pool.query,
  getClient: pool.getClient,
  checkConnection: pool.checkConnection,
  closePool: pool.closePool,
};
