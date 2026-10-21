const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || '*',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_jwt_secret_key_antigravity',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  database: {
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'chat_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    maxPoolSize: parseInt(process.env.DB_POOL_MAX, 10) || 20,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT, 10) || 5000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },
  tls: {
    enforce: process.env.ENFORCE_TLS === 'true' || process.env.NODE_ENV === 'production',
    hstsMaxAge: parseInt(process.env.HSTS_MAX_AGE, 10) || 31536000,
  },
};

module.exports = config;
