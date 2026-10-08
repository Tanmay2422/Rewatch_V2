const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/index');

test('GET /health returns ok', async () => {
  const res = await request(app).get('/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
});

test('GET /api/entries requires login', async () => {
  const res = await request(app).get('/api/entries');
  assert.strictEqual(res.status, 401);
});

test('GET /metrics exposes Prometheus metrics', async () => {
  await request(app).get('/health');
  const res = await request(app).get('/metrics');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /rewatch_http_requests_total/);
});
