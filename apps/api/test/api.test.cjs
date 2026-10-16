const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { createApp } = require('../dist/main');

const schema = `test_${randomUUID().replaceAll('-', '')}`;
let app, admin, base;
const future = (hours) => new Date(Date.now() + hours * 3600000).toISOString();
const person = { name: 'Test Guest', email: 'guest@example.com' };
async function request(path, body) {
  const response = await fetch(
    `${base}/api${path}`,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  return { status: response.status, body: await response.json() };
}
before(async () => {
  const url =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/coffeetime';
  admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const isolatedUrl = new URL(url);
  isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = isolatedUrl.toString();
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
after(async () => {
  if (app) await app.close();
  if (admin) {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});

test('create, list, book, and retain a booking after restarting the API', async () => {
  const health = await request('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  const created = await request('/slots', { startsAt: future(24), duration: 30 });
  assert.equal(created.status, 201);
  const id = created.body.id;
  const booked = await request(`/slots/${id}/bookings`, person);
  assert.equal(booked.status, 201);
  await app.close();
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  const listed = await request('/slots');
  assert.equal(listed.body.find((slot) => slot.id === id).booked, true);
  assert.equal(JSON.stringify(listed.body).includes(person.email), false);
  assert.equal((await request(`/slots/${id}/bookings`, person)).status, 409);
});

test('12 simultaneous bookings yield exactly one success', async () => {
  const { body: slot } = await request('/slots', { startsAt: future(26), duration: 30 });
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      request(`/slots/${slot.id}/bookings`, { name: `Guest ${i}`, email: `guest${i}@example.com` }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 11);
});

test('reject overlaps but allow adjacent availability, even under concurrent creation', async () => {
  const startsAt = future(28);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => request('/slots', { startsAt, duration: 30 })),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 3);
  assert.equal(
    (
      await request('/slots', {
        startsAt: new Date(Date.parse(startsAt) + 15 * 60000).toISOString(),
        duration: 30,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request('/slots', {
        startsAt: new Date(Date.parse(startsAt) + 30 * 60000).toISOString(),
        duration: 30,
      })
    ).status,
    201,
  );
});

test('reject invalid input and expired or nonexistent slots', async () => {
  for (const body of [
    { startsAt: future(-1), duration: 30 },
    { startsAt: future(35), duration: 17 },
    { startsAt: 'not-a-date', duration: 30 },
    { startsAt: '2030-01-01T12:00:00', duration: 30 },
    { startsAt: future(35), duration: 30, extra: true },
  ]) {
    assert.equal((await request('/slots', body)).status, 400);
  }
  const created = await request('/slots', { startsAt: future(35), duration: 30 });
  assert.equal(created.status, 201);
  const slot = created.body;
  for (const body of [
    { name: ' ', email: person.email },
    { name: person.name, email: 'invalid' },
    { ...person, name: 'x'.repeat(81) },
  ]) {
    assert.equal((await request(`/slots/${slot.id}/bookings`, body)).status, 400);
  }
  assert.equal((await request('/slots/not-a-uuid/bookings', person)).status, 400);
  assert.equal((await request(`/slots/${randomUUID()}/bookings`, person)).status, 404);
  const id = randomUUID();
  await admin.query(
    `INSERT INTO "${schema}".slots (id, starts_at, duration, ends_at) VALUES ($1, now() - interval '2 hours', 30, now() - interval '90 minutes')`,
    [id],
  );
  assert.equal((await request(`/slots/${id}/bookings`, person)).status, 409);
  assert.equal(
    (await request('/slots')).body.some((slot) => slot.id === id),
    false,
  );
});
