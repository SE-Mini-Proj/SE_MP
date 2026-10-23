const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../src/models/userModel', () => ({
  findByEmail: jest.fn(),
  findByUsername: jest.fn(),
  create: jest.fn(),
}));

const UserModel = require('../src/models/userModel');
const {
  registerUser,
  verifyPassword,
} = require('../src/services/authService');

describe('Issue #11: User Registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    UserModel.findByEmail.mockResolvedValue(null);
    UserModel.findByUsername.mockResolvedValue(null);
  });

  it('registers a valid user and stores a hashed password', async () => {
    UserModel.create.mockImplementation(async ({ username, email, passwordHash }) => ({
      toJSON: () => ({
        id: 'test-user-id',
        username,
        email,
        createdAt: new Date(),
      }),
      passwordHash,
    }));

    const result = await registerUser({
      username: 'alice',
      email: 'Alice@example.com',
      password: 'StrongPassword123!',
    });

    expect(result.status).toBe('ok');
    expect(result.user).toMatchObject({
      id: 'test-user-id',
      username: 'alice',
      email: 'alice@example.com',
    });
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('passwordHash');

    const createArgument = UserModel.create.mock.calls[0][0];
    expect(createArgument.passwordHash).not.toBe('StrongPassword123!');
    await expect(
      verifyPassword('StrongPassword123!', createArgument.passwordHash)
    ).resolves.toBe(true);
  });

  it('rejects an existing email with HTTP 409', async () => {
    UserModel.findByEmail.mockResolvedValue({ id: 'existing-user' });

    await expect(
      registerUser({
        username: 'alice',
        email: 'alice@example.com',
        password: 'StrongPassword123!',
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_EMAIL',
    });

    expect(UserModel.create).not.toHaveBeenCalled();
  });

  it('rejects an existing username with HTTP 409', async () => {
    UserModel.findByUsername.mockResolvedValue({ id: 'existing-user' });

    await expect(
      registerUser({
        username: 'alice',
        email: 'alice@example.com',
        password: 'StrongPassword123!',
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_USERNAME',
    });

    expect(UserModel.create).not.toHaveBeenCalled();
  });

  it('normalizes email addresses to lowercase and trims usernames', async () => {
    UserModel.create.mockImplementation(async ({ username, email }) => ({
      toJSON: () => ({ id: 'test-user-id', username, email }),
    }));

    await registerUser({
      username: '  alice  ',
      email: '  ALICE@EXAMPLE.COM  ',
      password: 'StrongPassword123!',
    });

    expect(UserModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'alice',
        email: 'alice@example.com',
      })
    );
  });

  it('rejects missing or invalid input with HTTP 400', async () => {
    await expect(registerUser()).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });

    await expect(
      registerUser({
        username: 'alice',
        email: 'not-an-email',
        password: 'StrongPassword123!',
      })
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });

    expect(UserModel.create).not.toHaveBeenCalled();
  });

  it('rejects a PostgreSQL unique-constraint race with HTTP 409', async () => {
    const duplicateError = new Error('Unique constraint violation');
    duplicateError.code = '23505';
    UserModel.create.mockRejectedValue(duplicateError);

    await expect(
      registerUser({
        username: 'alice',
        email: 'alice@example.com',
        password: 'StrongPassword123!',
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_ACCOUNT',
    });
  });

  it('propagates unexpected database errors instead of creating a fake user', async () => {
    const databaseError = new Error('Database unavailable');
    databaseError.code = 'ECONNREFUSED';
    UserModel.findByEmail.mockRejectedValue(databaseError);

    await expect(
      registerUser({
        username: 'alice',
        email: 'alice@example.com',
        password: 'StrongPassword123!',
      })
    ).rejects.toBe(databaseError);

    expect(UserModel.create).not.toHaveBeenCalled();
  });
});
