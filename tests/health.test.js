import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('REST API - Health & Status Endpoints', () => {
  it('GET / should serve the client html interface', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Chat App');
  });

  it('GET /api/health should return ok health metrics', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /non-existent-route should return standardized 404 error envelope', async () => {
    const res = await request(app).get('/non-existent-route');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Resource not found: GET /non-existent-route',
    });
  });
});
