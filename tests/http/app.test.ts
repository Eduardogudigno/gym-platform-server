import request from 'supertest';
import { createApp } from '../../src/app';

describe('HTTP contract', () => {
  const app = createApp();

  it('answers liveness and serves the OpenAPI document', async () => {
    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ success: true, data: { status: 'ok' } });

    const spec = await request(app).get('/docs/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.0.3');
    expect(spec.body.paths['/api/v1/subscriptions/{id}/renew']).toBeDefined();
  });

  it('rejects anonymous access and invalid bodies with the error envelope', async () => {
    const users = await request(app).get('/api/v1/users');
    expect(users.status).toBe(401);
    expect(users.body.success).toBe(false);
    expect(users.body.error.code).toBe('UNAUTHORIZED');

    const register = await request(app).post('/api/v1/auth/register').send({});
    expect(register.status).toBe(400);
    expect(register.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(register.body.error.details)).toBe(true);

    const missing = await request(app).get('/api/v1/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });
});
