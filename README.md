# Coffeetime — Coffee with Antonio

[![Build and test](https://github.com/AntonioPuceski/teamlift-coffeetime/actions/workflows/ci.yml/badge.svg)](https://github.com/AntonioPuceski/teamlift-coffeetime/actions/workflows/ci.yml)

A small scheduling app for the TeamLift Product Engineer Internship Challenge. One host publishes availability; visitors pick a day and reserve a slot with their name and email.

**[Open the live app](https://teamlift-coffeetime.onrender.com)** · [Source code](https://github.com/AntonioPuceski/teamlift-coffeetime)

The demo runs on Render's free web service with Neon PostgreSQL. After inactivity, the first visit can take about a minute to wake up. Demo availability extends beyond the submission deadline; use **Host view** to publish more times.

![Coffeetime booking page](docs/screenshots/booking-desktop.jpg)

## Stack

- React + TypeScript + Vite
- NestJS REST API with validated request DTOs
- PostgreSQL with `pg` and parameterized SQL
- CSS, Lucide icons, and `date-fns-tz` for the single display timezone: **Europe/Skopje**

## Run locally

Requires Node.js 22 or newer and npm. Run commands from the repository root.

```sh
npm ci
```

Start PostgreSQL in one terminal. The included development runner downloads its platform-specific PostgreSQL binaries as an npm dependency and stores data in the ignored `.postgres/` directory:

```sh
npm run db:start
```

Leave it open. In another terminal:

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to NestJS on port 3001. Stop each process with Ctrl+C. Restarting the database preserves your slots and bookings.

For a populated demo, with the API running:

```sh
npm run seed
```

This creates 40 real bookable slots over the next ten weekdays, only if there are no upcoming slots. The host view can also create slots without seeding.

### Alternative database setup

If you prefer Docker, use `docker compose up -d db` instead of `npm run db:start`. Do not run both on port 5432.

For an existing PostgreSQL database, copy `.env.example` to `.env` and set `DATABASE_URL`. The default local connection is `postgresql://postgres:postgres@localhost:5432/coffeetime`. The database must exist; the API creates its tables on startup. PostgreSQL 17+ is the intended target; local verification uses PostgreSQL 18.

On Linux, the embedded runner must run as a non-root user. Docker or an existing database are alternatives. The local credentials are for development only.

## Production build

```sh
npm run build
npm start
```

Open **http://127.0.0.1:3001**. NestJS serves both the built frontend and the API, so deployment needs only one Node service plus PostgreSQL.

To deploy to a conventional Node host:

1. Provision a PostgreSQL database and set its connection string as `DATABASE_URL` in the host's secret settings. Use the provider's documented TLS configuration.
2. Set `HOST=0.0.0.0` and use the platform's `PORT`.
3. Build with `npm ci && npm run build`; start with `npm start`.
4. Open the deployed URL, publish availability in Host view, and make a test booking.

The included `render.yaml` describes the free Node web service with a database readiness check. The live service was configured through Render's dashboard using the same settings. See [deployment instructions](docs/DEPLOYMENT.md) for the Render + Neon setup.

## Features

- Calendar with available days, duration filters, and bookable times
- Host form for date, start time, and 15/30/45/60-minute durations
- Booking form, confirmation, validation errors, and stale-slot conflict handling
- Booked times become disabled; availability refreshes on window focus and every 30 seconds
- Responsive layouts, native modal focus management, labels, keyboard focus styles, and reduced-motion support
- PostgreSQL persistence, with guest contact details omitted from the public availability response

## API

| Method | Route                     | Behavior                                                                     |
| ------ | ------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/api/health`             | Reports readiness after a successful database query                          |
| GET    | `/api/slots`              | Upcoming slots with `id`, `startsAt`, `duration`, and `booked`               |
| POST   | `/api/slots`              | Create a slot using `{ "startsAt": "2026-10-23T08:00:00Z", "duration": 30 }` |
| POST   | `/api/slots/:id/bookings` | Reserve using `{ "name": "Alex", "email": "alex@example.com" }`              |

Creation examples must use a date in the future. Invalid input returns 400, a missing booking slot returns 404, and overlapping availability or an unavailable booking returns 409.

## Why double booking is prevented

`bookings.slot_id` has a unique constraint. The booking endpoint executes one `INSERT ... SELECT ... ON CONFLICT DO NOTHING` statement, rather than checking availability and then separately inserting. PostgreSQL arbitrates competing writes. Exactly one request succeeds; other requests receive 409.

Slots also have a PostgreSQL range exclusion constraint. Their half-open ranges `[start, end)` cannot overlap, but adjacent slots are allowed. This keeps one host from offering two different slots that would conflict.

Timestamps use `TIMESTAMPTZ`. Browser inputs are explicitly interpreted as Europe/Skopje, independent of the visitor's device timezone. The form rejects nonexistent times during the spring daylight-saving transition. Ambiguous times during the autumn transition use the timezone library's default; explicit offset selection is a future improvement.

## Tests

With PostgreSQL running:

```sh
npm test
```

The tests start a real NestJS HTTP server against real PostgreSQL, using a unique temporary schema that is removed afterward. They do not clear app data. The database user needs permission to create schemas.

The four integration tests cover:

- Creation, booking, privacy of public responses, and persistence across an API restart
- Twelve simultaneous bookings, with exactly one success and eleven conflicts
- Concurrent slot creation, overlap rejection, and allowed adjacent times
- Invalid input, past slots, malformed IDs, missing slots, and expired availability

The production TypeScript build also checks the frontend and backend. Manual browser verification covers host creation and a booking with a Cyrillic guest name.

The deployed app was verified on October 18, 2026: the database health check passed, the browser booking and host publishing flows worked, and eight concurrent live booking requests produced exactly one success and seven conflicts. Bookings remained visible after reloading, and the public response excluded guest contact details.

## Scope and tradeoffs

There is no login, as requested. The host view is a shared demo interface, not a protected admin area. Guest names and emails are stored, but no public endpoint returns them. Before using this for real scheduling, add host authentication, rate limiting, a retention policy, and appropriate privacy information.

The confirmation is deterministic text, not an LLM call. No confirmation emails, video meeting links, or Google Calendar integration are generated. These are deliberately outside this first version. The app clearly states that on confirmation.

Table creation is kept in one small initialization module for this challenge. A longer-lived product should use versioned migrations. Other useful additions would be cancellation, host booking details behind authentication, explicit DST ambiguity handling, email delivery, and a calendar invite download.

## AI usage

Built collaboratively with OpenAI Codex for scaffolding, implementation, design iteration, and test creation. Codex ran the production build, PostgreSQL integration tests, and browser checks. During verification, a PostgreSQL parameter type mismatch was found and corrected, and local database creation was configured for UTF-8 guest names.

See [the walkthrough notes](docs/WALKTHROUGH.md) for a demo outline and a guide to the request flow, database constraints, validation, and timezone conversion.

Reference documentation consulted: [NestJS validation](https://docs.nestjs.com/application/validation) and [PostgreSQL INSERT / ON CONFLICT](https://www.postgresql.org/docs/18/sql-insert.html).
