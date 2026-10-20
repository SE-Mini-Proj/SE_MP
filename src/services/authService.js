/**
 * Auth Service Skeleton
 * Provides business logic for registration and authentication.
 * Full hashing and DB operations will be implemented in #7, #11, and #12.
 */
async function registerUser({ username, email, _password }) {
  return {
    status: 'ok',
    message: 'User registered successfully',
    user: {
      id: 'mock_uuid_' + Date.now(),
      username,
      email,
      createdAt: new Date().toISOString(),
    },
  };
}

async function loginUser({ email, _password }) {
  return {
    status: 'ok',
    token: 'mock_jwt_token_header.payload.signature',
    expiresIn: 86400,
    user: {
      id: 'mock_uuid_1',
      email,
    },
  };
}

module.exports = {
  registerUser,
  loginUser,
};
