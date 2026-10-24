const authService = require('../services/authService');

async function register(req, res, next) {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Username, email, and password are required',
      });
    }

    const result = await authService.registerUser({ username, email, password });
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, username, identifier, password } = req.body;
    const loginId = identifier || email || username;

    if (!loginId || !password) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Username/email and password are required',
      });
    }

    const result = await authService.loginUser({
      email: loginId,
      username: loginId,
      password,
    });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
};
