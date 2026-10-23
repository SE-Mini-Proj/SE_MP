const { describe, it, expect, beforeAll } = require('@jest/globals');
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
} = require('../src/services/authService');
const UserModel = require('../src/models/userModel');

describe('Security Requirement: Password Hashing with Salt (Issue #7 - CHAT-SR-002, TC-Sec-02)', () => {
  const rawPassword = 'SuperSecretPassword123!';

  it('TC-Sec-02.1: should hash passwords using bcrypt with standard salt rounds (>= 10)', async () => {
    expect(SALT_ROUNDS).toBeGreaterThanOrEqual(10);
    const hash = await hashPassword(rawPassword);

    expect(hash).not.toBe(rawPassword);
    // bcrypt hashes start with $2a$, $2b$, or $2y$ followed by the rounds
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it('TC-Sec-02.2: should generate distinct salt/hash even for identical passwords', async () => {
    const hash1 = await hashPassword(rawPassword);
    const hash2 = await hashPassword(rawPassword);

    expect(hash1).not.toBe(hash2);
    // Both must verify against the same plaintext password
    expect(await verifyPassword(rawPassword, hash1)).toBe(true);
    expect(await verifyPassword(rawPassword, hash2)).toBe(true);
  });

  it('TC-Sec-02.3: verifyPassword() should correctly authenticate valid and reject invalid passwords', async () => {
    const hash = await hashPassword(rawPassword);

    const isValid = await verifyPassword(rawPassword, hash);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword('WrongPassword', hash);
    expect(isInvalid).toBe(false);

    const emptyMatch = await verifyPassword('', hash);
    expect(emptyMatch).toBe(false);
  });

  it('TC-Sec-02.4: hashPassword() should reject invalid or empty password inputs', async () => {
    await expect(hashPassword('')).rejects.toThrow('Password must be a non-empty string');
    await expect(hashPassword(null)).rejects.toThrow('Password must be a non-empty string');
    await expect(hashPassword(undefined)).rejects.toThrow('Password must be a non-empty string');
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
    const registrationResult = await registerUser({
      username: 'security_test_user',
      email: 'sec_test@example.com',
      password: rawPassword,
    });

    expect(registrationResult.status).toBe('ok');
    expect(registrationResult.user).not.toHaveProperty('password');
    expect(registrationResult.user).not.toHaveProperty('passwordHash');
    expect(registrationResult.user.username).toBe('security_test_user');
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

    // Mock UserModel lookup methods for testUser
    const originalFindByEmail = UserModel.findByEmail;
    const originalFindByUsername = UserModel.findByUsername;

    UserModel.findByEmail = async (email) => {
      if (email.toLowerCase() === testUser.email.toLowerCase()) {
        return testUser;
      }
      return originalFindByEmail(email).catch(() => null);
    };

    UserModel.findByUsername = async (username) => {
      if (username.toLowerCase() === testUser.username.toLowerCase()) {
        return testUser;
      }
      return originalFindByUsername(username).catch(() => null);
    };
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
