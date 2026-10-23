const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { createApp } = require('../dist/main');
const { Integrations } = require('../dist/integrations');

const schema = `test_${randomUUID().replaceAll('-', '')}`;
let app, admin, base;
const providerEnv = [
  'GROQ_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
];
const savedProviderEnv = Object.fromEntries(providerEnv.map((key) => [key, process.env[key]]));
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
  // Keep tests isolated from configured live AI and calendar providers.
  for (const key of providerEnv) delete process.env[key];
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
  for (const key of providerEnv) {
    if (savedProviderEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedProviderEnv[key];
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
  assert.equal(booked.body.calendarEventCreated, false);
  await app.close();
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  const listed = await request('/slots');
  assert.equal(listed.body.find((slot) => slot.id === id).booked, true);
  assert.equal(JSON.stringify(listed.body).includes(person.email), false);
  assert.equal((await request(`/slots/${id}/bookings`, person)).status, 409);
});

test('assistant recommends only real open slots and falls back when Groq is off', async () => {
  const first = await request('/slots', { startsAt: future(30), duration: 30 });
  const second = await request('/slots', { startsAt: future(32), duration: 45 });
  const result = await request('/slots/assistant', {
    message: 'A short chat next week, preferably in the afternoon.',
  });
  assert.equal(result.status, 201);
  assert.match(result.body.message, /open times/i);
  assert.deepEqual(result.body.slotIds, [first.body.id, second.body.id]);
  assert.equal((await request('/slots/assistant', { message: '' })).status, 400);
  for (let attempt = 1; attempt < 8; attempt += 1) {
    assert.equal((await request('/slots/assistant', { message: 'Any time is fine.' })).status, 201);
  }
  assert.equal(
    (await request('/slots/assistant', { message: 'One more suggestion.' })).status,
    429,
  );
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

test('Groq recommendations are limited to server-provided IDs and redact contact details', async () => {
  const originalKey = process.env.GROQ_API_KEY;
  const originalFetch = global.fetch;
  process.env.GROQ_API_KEY = 'test-key';
  const slot = { id: randomUUID(), startsAt: future(40), duration: 30 };
  let sentBody;
  global.fetch = async (_url, options) => {
    sentBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: 'I found a time that fits.',
                slotIds: [slot.id, randomUUID()],
              }),
            },
          },
        ],
      }),
    };
  };
  try {
    const result = await new Integrations().recommendSlots(
      'Any afternoon works. Reach me at guest@example.com or +1 555 123 4567.',
      [slot],
    );
    assert.deepEqual(result.slotIds, [slot.id]);
    assert.equal(result.message, 'I found a time that fits.');
    assert.match(JSON.stringify(sentBody), /\[email removed\]/);
    assert.match(JSON.stringify(sentBody), /\[phone removed\]/);
    assert.doesNotMatch(JSON.stringify(sentBody), /guest@example\.com|555 123 4567/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalKey;
  }
});

test('Google Calendar event creation uses the host calendar and excludes guest email', async () => {
  const keys = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GOOGLE_CALENDAR_ID',
  ];
  const originalEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  Object.assign(process.env, {
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    GOOGLE_REFRESH_TOKEN: 'test-refresh-token',
    GOOGLE_CALENDAR_ID: 'primary',
  });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? { ok: true, json: async () => ({ access_token: 'test-access', expires_in: 3600 }) }
      : { ok: true };
  };
  try {
    const created = await new Integrations().createCalendarEvent(
      { startsAt: future(48), duration: 30 },
      'Test Guest',
    );
    assert.equal(created, true);
    assert.match(calls[1].url, /calendars\/primary\/events$/);
    const event = JSON.parse(calls[1].options.body);
    assert.equal(event.summary, 'Coffee chat with Test Guest');
    assert.equal(event.start.timeZone, 'Europe/Skopje');
    assert.doesNotMatch(JSON.stringify(event), /email/i);
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
});
