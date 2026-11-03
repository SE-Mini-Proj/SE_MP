const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const maxUploadSizeBytes = Number(process.env.MAX_UPLOAD_SIZE_BYTES || 10 * 1024 * 1024);
if (!Number.isSafeInteger(maxUploadSizeBytes) || maxUploadSizeBytes < 1) {
  throw new Error('MAX_UPLOAD_SIZE_BYTES must be a positive safe integer');
}

const objectStorageEndpoint = process.env.OBJECT_STORAGE_ENDPOINT || '';

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
  media: {
    maxFileSizeBytes: maxUploadSizeBytes,
  },
  objectStorage: {
    endpoint: objectStorageEndpoint,
    bucket: process.env.OBJECT_STORAGE_BUCKET || '',
    region: process.env.OBJECT_STORAGE_REGION || 'us-east-1',
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
    sessionToken: process.env.OBJECT_STORAGE_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN || '',
    forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true'
      || (Boolean(objectStorageEndpoint) && process.env.OBJECT_STORAGE_FORCE_PATH_STYLE !== 'false'),
  },
  tls: {
    enforce: process.env.ENFORCE_TLS === 'true' || process.env.NODE_ENV === 'production',
    hstsMaxAge: parseInt(process.env.HSTS_MAX_AGE, 10) || 31536000,
  },
};

module.exports = config;
