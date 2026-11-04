const logger = require('../src/services/loggerService');

describe('Structured Logger Service (Issue #33)', () => {
  let consoleLogSpy;
  let consoleWarnSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should output valid JSON with a timestamp, level and event', () => {
    logger.info('test.event', 'Test message', { userId: 'user_123' });

    const output = consoleLogSpy.mock.calls[0][0];
    const entry = JSON.parse(output);

    expect(entry.timestamp).toBeDefined();
    expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false);
    expect(entry.level).toBe('info');
    expect(entry.event).toBe('test.event');
    expect(entry.message).toBe('Test message');
    expect(entry.service).toBe('chat-app');
    expect(entry.metadata.userId).toBe('user_123');
  });

  it('should write warning and error logs at the correct levels', () => {
    logger.warn('test.warning', 'Warning message');
    logger.error('test.error', 'Error message');

    expect(JSON.parse(consoleWarnSpy.mock.calls[0][0]).level).toBe('warn');
    expect(JSON.parse(consoleErrorSpy.mock.calls[0][0]).level).toBe('error');
  });

  it('should redact sensitive fields recursively', () => {
    logger.info('auth.test', 'Authentication event', {
      password: 'plain_password',
      password_hash: 'password_hash_value',
      access_token: 'access_token_value',
      refreshToken: 'refresh_token_value',
      apiKey: 'api_key_value',
      authorization: 'Bearer secret_token',
      nested: {
        session_id: 'session_secret',
        safeMessage: 'Normal message',
      },
    });

    const output = consoleLogSpy.mock.calls[0][0];
    const entry = JSON.parse(output);
    const serialized = JSON.stringify(entry);

    expect(serialized).not.toContain('plain_password');
    expect(serialized).not.toContain('password_hash_value');
    expect(serialized).not.toContain('access_token_value');
    expect(serialized).not.toContain('refresh_token_value');
    expect(serialized).not.toContain('api_key_value');
    expect(serialized).not.toContain('secret_token');
    expect(serialized).not.toContain('session_secret');

    expect(entry.metadata.password).toBe('[REDACTED]');
    expect(entry.metadata.nested.safeMessage).toBe('Normal message');
  });

  it('should redact bearer tokens embedded in strings', () => {
    logger.info(
      'auth.header',
      'Authorization: Bearer abc123.secret456',
    );

    const output = consoleLogSpy.mock.calls[0][0];

    expect(output).not.toContain('abc123.secret456');
    expect(output).toContain('Bearer [REDACTED]');
  });

  it('should sanitize sensitive fields inside error objects', () => {
    const error = new Error('Request failed with token=secret123');

    logger.error('test.failure', 'Operation failed', {
      error,
      token: 'secret123',
    });

    const entry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

    expect(JSON.stringify(entry)).not.toContain('secret123');
    expect(entry.metadata.token).toBe('[REDACTED]');
    expect(entry.metadata.error.message).toContain('[REDACTED]');
  });


  it('should redact additional API key and payment-card fields', () => {
    logger.info('security.test', 'Sensitive data test', {
      'x-api-key': 'x_api_secret',
      credit_card: '4111111111111111',
      cardNumber: '5555555555554444',
      payment_token: 'payment_secret',
    });

    const output = consoleLogSpy.mock.calls[0][0];
    const entry = JSON.parse(output);
    const serialized = JSON.stringify(entry);

    expect(serialized).not.toContain('x_api_secret');
    expect(serialized).not.toContain('4111111111111111');
    expect(serialized).not.toContain('5555555555554444');
    expect(serialized).not.toContain('payment_secret');
  });
});
