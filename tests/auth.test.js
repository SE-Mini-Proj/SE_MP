import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, SALT_ROUNDS, registerUser } from '../src/services/authService';
import UserModel from '../src/models/userModel';

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
