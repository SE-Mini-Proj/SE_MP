const { describe, it, expect } = require('@jest/globals');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config');
const { generateToken } = require('../src/services/authService');

describe('JWT authentication validation', () => {
  it('rejects tampered tokens on protected REST routes', async () => {
    const { token } = generateToken({ id: 'user-1' });
    const [header, payload, signature] = token.split('.');
    const tamperedSignature = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
    const tamperedToken = `${header}.${payload}.${tamperedSignature}`;

    const response = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${tamperedToken}`)
      .send({ name: 'Engineering' });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('rejects expired tokens on protected REST routes', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = jwt.sign(
      { sub: 'user-1', iat: now - 10 },
      config.jwt.secret,
      { expiresIn: -1, algorithm: 'HS256' }
    );

    const response = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({ name: 'Engineering' });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('accepts a valid token and authenticates the request user', async () => {
    const { token } = generateToken({ id: 'user-1' });

    const response = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Engineering' });

    expect(response.status).toBe(201);
    expect(response.body.room.ownerId).toBe('user-1');
  });
});
