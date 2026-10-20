const fs = require('fs');
const path = require('path');
const { getClient, closePool } = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      version VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function getAppliedMigrations(client) {
  const res = await client.query('SELECT version FROM schema_migrations ORDER BY id ASC;');
  return res.rows.map((row) => row.version);
}

async function runUp() {
  const client = await getClient();
  try {
    console.log('[Migrate] Starting database migrations (UP)...');
    await ensureMigrationTable(client);
    const applied = await getAppliedMigrations(client);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.up.sql'))
      .sort();

    if (files.length === 0) {
      console.log('[Migrate] No migration files found.');
      return;
    }

    let count = 0;
    for (const file of files) {
      const version = file.split('_')[0];
      if (applied.includes(version)) {
        console.log(`[Migrate] Skipping already applied: ${file}`);
        continue;
      }

      console.log(`[Migrate] Applying migration: ${file}...`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2);', [
          version,
          file,
        ]);
        await client.query('COMMIT');
        console.log(`[Migrate] Successfully applied: ${file}`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migrate Error] Failed applying ${file}:`, err.message);
        throw err;
      }
    }

    console.log(`[Migrate] UP completed. Total newly applied migrations: ${count}`);
  } finally {
    client.release();
    await closePool();
  }
}

async function runDown() {
  const client = await getClient();
  try {
    console.log('[Migrate] Rolling back database migration (DOWN)...');
    await ensureMigrationTable(client);
    const applied = await getAppliedMigrations(client);

    if (applied.length === 0) {
      console.log('[Migrate] No applied migrations to revert.');
      return;
    }

    const latestVersion = applied[applied.length - 1];
    const downFile = fs
      .readdirSync(MIGRATIONS_DIR)
      .find((file) => file.startsWith(latestVersion) && file.endsWith('.down.sql'));

    if (!downFile) {
      throw new Error(`[Migrate Error] No matching .down.sql found for version: ${latestVersion}`);
    }

    console.log(`[Migrate] Reverting migration: ${downFile}...`);
    const filePath = path.join(MIGRATIONS_DIR, downFile);
    const sql = fs.readFileSync(filePath, 'utf-8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('DELETE FROM schema_migrations WHERE version = $1;', [latestVersion]);
      await client.query('COMMIT');
      console.log(`[Migrate] Successfully reverted: ${downFile}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Migrate Error] Failed reverting ${downFile}:`, err.message);
      throw err;
    }
  } finally {
    client.release();
    await closePool();
  }
}

async function main() {
  const command = process.argv[2] || 'up';
  try {
    if (command === 'up') {
      await runUp();
    } else if (command === 'down') {
      await runDown();
    } else {
      console.error(`[Migrate] Unknown command: "${command}". Use "up" or "down".`);
      process.exit(1);
    }
  } catch (err) {
    console.error('[Migrate Fatal Error]:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runUp,
  runDown,
  ensureMigrationTable,
};
