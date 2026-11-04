const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'passwd',
  'token',
  'accesstoken',
  'refreshtoken',
  'sessionid',
  'authorization',
  'cookie',
  'setcookie',
  'jwt',
  'secret',
  'clientsecret',
  'apikey',
  'xapikey',
  'creditcard',
  'cardnumber',
  'paymenttoken',
  'credential',
  'privatekey',
]);

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sanitizeString(value) {
  return value
    .replace(
      /(authorization\s*[:=]\s*)Bearer\s+[^\s"',}]+/gi,
      '$1Bearer [REDACTED]'
    )
    .replace(
      /((?:password|passwd|token|access_token|refresh_token|session_id|api_key|apikey|secret|cookie)\s*[:=]\s*)["']?[^&\s"',}]+/gi,
      '$1[REDACTED]'
    )
    .replace(
      /(authorization\s*[:=]\s*)(?!Bearer\b)["']?[^&\s"',}]+/gi,
      '$1[REDACTED]'
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
}

function sanitizeValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      code: value.code,
    };
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === 'object') {
    const sanitized = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(normalizeKey(key))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeValue(nestedValue);
      }
    }

    return sanitized;
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  return value;
}

function writeLog(level, event, message, metadata = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    message: sanitizeString(String(message)),
    service: 'chat-app',
    metadata: sanitizeValue(metadata),
  };

  const output = JSON.stringify(entry);

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }

  return entry;
}

function info(event, message, metadata = {}) {
  return writeLog('info', event, message, metadata);
}

function warn(event, message, metadata = {}) {
  return writeLog('warn', event, message, metadata);
}

function error(event, message, metadata = {}) {
  return writeLog('error', event, message, metadata);
}

module.exports = {
  info,
  warn,
  error,
  sanitizeValue,
};
