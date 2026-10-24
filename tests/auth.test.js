const { describe, it, expect, beforeAll, beforeEach, afterEach } = require('@jest/globals');
const request = require('supertest');
const app = require('../src/app');
const {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  SALT_ROUNDS,
  registerUser,
  loginUser,
  lockoutService,
} = require('../src/services/authService');
const UserModel = require('../src/models/userModel');

describe('Security Requirement: Password Hashing with Salt (Issue #7 - CHAT-SR-002, TC-Sec-02)', () => {
  const rawPassword = 'SuperSecretPassword123!';

  it('TC-Sec-02.1: should hash passwords using bcrypt with standard salt rounds (>= 10)', async () => {
    expect(SALT_ROUNDS).toBeGreaterThanOrEqual(10);

    const hash = await hashPassword(rawPassword);

    expect(hash).not.toBe(rawPassword);
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it('TC-Sec-02.2: should generate distinct salt/hash even for identical passwords', async () => {
    const hash1 = await hashPassword(rawPassword);
    const hash2 = await hashPassword(rawPassword);

    expect(hash1).not.toBe(hash2);
    expect(await verifyPassword(rawPassword, hash1)).toBe(true);
    expect(await verifyPassword(rawPassword, hash2)).toBe(true);
  });

  it('TC-Sec-02.3: verifyPassword() should correctly authenticate valid and reject invalid passwords', async () => {
    const hash = await hashPassword(rawPassword);

    expect(await verifyPassword(rawPassword, hash)).toBe(true);
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('TC-Sec-02.4: hashPassword() should reject invalid or empty password inputs', async () => {
    await expect(hashPassword('')).rejects.toThrow(
      'Password must be a non-empty string'
    );
    await expect(hashPassword(null)).rejects.toThrow(
      'Password must be a non-empty string'
    );
    await expect(hashPassword(undefined)).rejects.toThrow(
      'Password must be a non-empty string'
    );
  });

  it('TC-Sec-02.5: UserModel toJSON() should never expose password hash or plaintext password', () => {
    const user = new UserModel({
      id: 'uuid-1234',
      username: 'johndoe',
      email: 'john@example.com',
      password_hash: '$2b$12$e80bS6vC.mockHashStringForTestingPurposes',
      created_at: new Date(),
    });

    const json = user.toJSON();

    expect(json).toHaveProperty('id');
    expect(json).toHaveProperty('username');
    expect(json).toHaveProperty('email');
    expect(json).not.toHaveProperty('password');
    expect(json).not.toHaveProperty('passwordHash');
    expect(json).not.toHaveProperty('password_hash');
  });

  it('TC-Sec-02.6: registerUser() should store hashed password rather than plaintext', async () => {
    const findEmailSpy = jest
      .spyOn(UserModel, 'findByEmail')
      .mockResolvedValue(null);

    const findUsernameSpy = jest
      .spyOn(UserModel, 'findByUsername')
      .mockResolvedValue(null);

    const createSpy = jest
      .spyOn(UserModel, 'create')
      .mockImplementation(async ({ username, email, passwordHash }) => ({
        toJSON: () => ({
          id: 'test-user-id',
          username,
          email,
          createdAt: new Date(),
        }),
        passwordHash,
      }));

    try {
      const registrationResult = await registerUser({
        username: 'security_test_user',
        email: 'sec_test@example.com',
        password: rawPassword,
      });

      expect(registrationResult.status).toBe('ok');
      expect(registrationResult.user).not.toHaveProperty('password');
      expect(registrationResult.user).not.toHaveProperty('passwordHash');
      expect(registrationResult.user.username).toBe('security_test_user');

      const createArgument = createSpy.mock.calls[0][0];

      expect(createArgument.passwordHash).not.toBe(rawPassword);

      await expect(
        verifyPassword(rawPassword, createArgument.passwordHash)
      ).resolves.toBe(true);
    } finally {
      findEmailSpy.mockRestore();
      findUsernameSpy.mockRestore();
      createSpy.mockRestore();
    }
  });
});

describe('Functional Requirement: User Authentication & JWT Session Token (Issue #12 - CHAT-F-002, TC-Auth-02)', () => {
  const validPassword = 'UserAuthPassword123!';
  let testUser;

  beforeAll(async () => {
    const passwordHash = await hashPassword(validPassword);
    testUser = new UserModel({
      id: 'uuid-user-auth-12',
      username: 'authuser12',
      email: 'auth12@example.com',
      password_hash: passwordHash,
      created_at: new Date(),
    });
  });

  beforeEach(() => {
    jest.spyOn(UserModel, 'findByEmail').mockImplementation(async (email) => {
      if (email && email.toLowerCase() === testUser.email.toLowerCase()) {
        return testUser;
      }
      return null;
    });

    jest.spyOn(UserModel, 'findByUsername').mockImplementation(async (username) => {
      if (username && username.toLowerCase() === testUser.username.toLowerCase()) {
        return testUser;
      }
      return null;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    lockoutService.clearAllLockouts();
  });

  it('TC-Auth-02.1: generateToken() creates a valid verifiable JWT with expected user claims', () => {
    const { token, expiresIn } = generateToken(testUser);

    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // Header.Payload.Signature
    expect(expiresIn).toBeGreaterThan(0);

    const decoded = verifyToken(token);
    expect(decoded.sub).toBe(testUser.id);
    expect(decoded.id).toBe(testUser.id);
    expect(decoded.email).toBe(testUser.email);
    expect(decoded.username).toBe(testUser.username);
  });

  it('TC-Auth-02.2: loginUser() successfully authenticates via email and password', async () => {
    const result = await loginUser({
      email: testUser.email,
      password: validPassword,
    });

    expect(result.status).toBe('ok');
    expect(result.token).toBeTruthy();
    expect(result.expiresIn).toBeDefined();
    expect(result.user.email).toBe(testUser.email);
    expect(result.user.username).toBe(testUser.username);
    expect(result.user).not.toHaveProperty('passwordHash');

    // Verify the returned token is valid
    const decoded = verifyToken(result.token);
    expect(decoded.email).toBe(testUser.email);
  });

  it('TC-Auth-02.3: loginUser() successfully authenticates via username and password', async () => {
    const result = await loginUser({
      username: testUser.username,
      password: validPassword,
    });

    expect(result.status).toBe('ok');
    expect(result.token).toBeTruthy();
    expect(result.user.username).toBe(testUser.username);
  });

  it('TC-Auth-02.4: loginUser() rejects incorrect password with 401 Invalid credentials', async () => {
    await expect(
      loginUser({
        email: testUser.email,
        password: 'WrongPassword123!',
      })
    ).rejects.toMatchObject({
      status: 401,
      message: 'Invalid credentials',
    });
  });

  it('TC-Auth-02.5: loginUser() rejects non-existent user with 401 Invalid credentials', async () => {
    await expect(
      loginUser({
        email: 'does_not_exist@example.com',
        password: validPassword,
      })
    ).rejects.toMatchObject({
      status: 401,
      message: 'Invalid credentials',
    });
  });

  it('TC-Auth-02.6: loginUser() rejects missing input credentials with 400', async () => {
    await expect(
      loginUser({ email: '', password: '' })
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  describe('REST API POST /api/auth/login integration', () => {
    it('TC-Auth-02.7: POST /api/auth/login returns 200 and JWT on correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: validPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.token).toBeTruthy();
      expect(res.body.user.email).toBe(testUser.email);
    });

    it('TC-Auth-02.8: POST /api/auth/login returns 401 on incorrect credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'IncorrectPassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('TC-Auth-02.9: POST /api/auth/login returns 400 on missing credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });
});

describe('Functional Requirement: Account Lockout after Repeated Failed Logins (Issue #13 - CHAT-F-003, TC-Auth-03)', () => {
  const targetEmail = 'lockout_victim@example.com';
  const correctPassword = 'StrongPassword123!';
  let victimUser;

  beforeAll(async () => {
    const passwordHash = await hashPassword(correctPassword);
    victimUser = new UserModel({
      id: 'uuid-victim-13',
      username: 'lockout_victim',
      email: targetEmail,
      password_hash: passwordHash,
      created_at: new Date(),
    });

    const originalFindByEmail = UserModel.findByEmail;
    UserModel.findByEmail = async (email) => {
      if (email.toLowerCase() === targetEmail.toLowerCase()) {
        return victimUser;
      }
      return originalFindByEmail(email).catch(() => null);
    };
  });

  beforeEach(() => {
    lockoutService.clearAllLockouts();
  });

  it('TC-Auth-03.1: first 5 consecutive failed attempts return 401 Invalid credentials', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(
        loginUser({ email: targetEmail, password: 'WrongPassword' })
      ).rejects.toMatchObject({
        status: 401,
        message: 'Invalid credentials',
      });

      const status = lockoutService.getLockoutStatus(targetEmail);
      expect(status.failedAttempts).toBe(attempt);
    }
  });

  it('TC-Auth-03.2: 6th consecutive failure returns 429 Account Locked', async () => {
    // Perform 5 failures
    for (let i = 0; i < 5; i++) {
      try {
        await loginUser({ email: targetEmail, password: 'BadPassword' });
      } catch (err) {
        expect(err.status).toBe(401);
      }
    }

    // 6th attempt must be rejected with 429
    await expect(
      loginUser({ email: targetEmail, password: 'BadPassword' })
    ).rejects.toMatchObject({
      status: 429,
      code: 'ACCOUNT_LOCKED',
      message: expect.stringContaining('Too many attempts'),
    });
  });

  it('TC-Auth-03.3: records audit log entry when account lockout occurs', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Perform 5 failures to trigger lockout
    for (let i = 0; i < 5; i++) {
      try {
        await loginUser({ email: targetEmail, password: 'BadPassword' });
      } catch {
        // Expected 401
      }
    }

    // Expect console.warn to have logged ACCOUNT_LOCKED audit event
    const auditLogs = warnSpy.mock.calls
      .map((call) => call.join(' '))
      .filter((msg) => msg.includes('ACCOUNT_LOCKED'));

    expect(auditLogs.length).toBeGreaterThan(0);
    warnSpy.mockRestore();
  });

  it('TC-Auth-03.4: successful login resets the failed attempts counter', async () => {
    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      try {
        await loginUser({ email: targetEmail, password: 'BadPassword' });
      } catch {
        // Expected
      }
    }
    expect(lockoutService.getLockoutStatus(targetEmail).failedAttempts).toBe(3);

    // Login successfully with correct password
    const result = await loginUser({ email: targetEmail, password: correctPassword });
    expect(result.status).toBe('ok');

    // Counter must be reset to 0
    expect(lockoutService.getLockoutStatus(targetEmail).failedAttempts).toBe(0);
  });

  it('TC-Auth-03.5: lockout automatically expires after 5 minutes', async () => {
    // Trigger lockout
    for (let i = 0; i < 5; i++) {
      try {
        await loginUser({ email: targetEmail, password: 'BadPassword' });
      } catch {
        // Expected
      }
    }
    expect(lockoutService.getLockoutStatus(targetEmail).isLocked).toBe(true);

    // Advance time past 5 minutes (5 min + 1 second)
    const realDateNow = Date.now;
    const futureTime = Date.now() + 5 * 60 * 1000 + 1000;
    Date.now = () => futureTime;

    try {
      // Login attempt should now be allowed (not 429)
      const loginAttempt = await loginUser({ email: targetEmail, password: correctPassword });
      expect(loginAttempt.status).toBe('ok');
    } finally {
      Date.now = realDateNow;
    }
  });

  it('TC-Auth-03.6: REST API POST /api/auth/login returns 429 on 6th failed attempt', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: targetEmail, password: 'WrongPassword' });
      expect(res.status).toBe(401);
    }

    // 6th attempt via HTTP returns 429 Too Many Requests
    const lockedRes = await request(app)
      .post('/api/auth/login')
      .send({ email: targetEmail, password: 'WrongPassword' });

    expect(lockedRes.status).toBe(429);
    expect(lockedRes.body.code).toBe('ACCOUNT_LOCKED');
    expect(lockedRes.body.message).toContain('Too many attempts');
  });
});
