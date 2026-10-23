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
- Optional AI assistant recommends real open times and leaves final confirmation to the guest
- Booked times become disabled; availability refreshes on window focus and every 30 seconds
- Responsive layouts, native modal focus management, labels, keyboard focus styles, and reduced-motion support
- PostgreSQL persistence, with guest contact details omitted from the public availability response
- Optional Google Calendar FreeBusy checks mark conflicts and add confirmed bookings as events
- Optional Groq-generated booking confirmation, with a friendly fallback if the AI service is unset or unavailable

## API

| Method | Route                      | Behavior                                                                     |
| ------ | -------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/api/health`              | Reports readiness after a successful database query                          |
| GET    | `/api/slots`               | Upcoming slots with booking and optional calendar-conflict status            |
| POST   | `/api/slots/assistant`     | Recommend real open times from a natural-language preference                 |
| POST   | `/api/slots`               | Create a slot using `{ "startsAt": "2026-10-23T08:00:00Z", "duration": 30 }` |
| POST   | `/api/slots/:id/bookings`  | Reserve using `{ "name": "Alex", "email": "alex@example.com" }`              |
| GET    | `/api/integrations/status` | Reports whether optional integrations are configured                         |

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

The app does not send confirmation emails or create video meeting links. It clearly tells visitors this after booking. The host view remains public because the challenge does not require accounts; a real scheduling product should add host authentication, rate limiting, retention rules, and appropriate privacy information.

## Optional integrations

Both integrations are disabled unless their server-side environment variables are configured. Never put provider credentials in frontend code or commit them to Git. For local development, add secrets to the ignored `.env` file; for Render, add them under the service's secret environment variables.

### Groq booking assistant and confirmation

For local use, set `GROQ_API_KEY` in the ignored `.env`. On Render, either add it as a secret environment variable or create a Secret File named `api-key`; the app reads the latter from `/etc/secrets/api-key`. `GROQ_MODEL` is optional and defaults to `openai/gpt-oss-20b`.

The booking page's **Plan with AI** assistant receives a guest's scheduling preference and the server's current available slots, then suggests up to three matching times. It cannot book or change availability. The guest chooses a suggested slot and confirms with the existing name-and-email form. Obvious email addresses and phone numbers are removed from the preference before it is sent to Groq; the assistant never receives the booking form details. If Groq is unavailable, the app offers the next open slots. After the database saves a booking, Groq also writes a short confirmation sentence. Provider failures use friendly fallback text and do not undo a booking. Keep the Groq account on Free if you want to avoid paid usage and check its current limits before enabling it.

### Google Calendar availability and booking events

The app uses Google's FreeBusy API to check event time ranges; it never reads or returns event titles or descriptions. It marks overlapping slots as calendar conflicts in the host schedule, rejects publishing a slot that conflicts, and rechecks before accepting a booking. Once a booking is safely stored in PostgreSQL, the API creates an event titled `Coffee chat with [guest name]`. It does not add the guest as an attendee, send an invite, or include their email in the event. If event creation fails, the booking remains saved and the guest sees that calendar sync needs attention.

Configure these server-side variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID` (use `primary` for the authorized account's main calendar)

In Google Cloud, enable the Google Calendar API and create an OAuth client. Use Google's OAuth 2.0 Playground with that client and both scopes `https://www.googleapis.com/auth/calendar.freebusy` and `https://www.googleapis.com/auth/calendar.events.owned` to grant availability checks and event creation, then obtain an offline refresh token. Replace an existing refresh token that was authorized only with the FreeBusy scope. Store the client secret and refresh token as secrets in Render or `.env`; never commit them. The authorized account must own or have appropriate access to the selected calendar. The public `/api/integrations/status` endpoint reports only whether each integration is configured; it never returns credentials.

For an External OAuth consent screen left in Testing mode, Google expires refresh tokens after seven days. That is adequate for a short challenge review; longer use requires publishing the consent configuration and meeting Google's requirements.

The database booking is committed before Groq confirmation and Google Calendar event creation. Provider failures cannot undo the booking. PostgreSQL still provides the final one-booking-per-slot guarantee.

Table creation is kept in one small initialization module for this challenge. A longer-lived product should use versioned migrations. Other useful additions would be cancellation, host booking details behind authentication, explicit DST ambiguity handling, email delivery, and a calendar invite download.

## AI usage

Built collaboratively with OpenAI Codex for scaffolding, implementation, design iteration, and test creation. Codex ran the production build, PostgreSQL integration tests, and browser checks. During verification, a PostgreSQL parameter type mismatch was found and corrected, and local database creation was configured for UTF-8 guest names. Groq receives scheduling preferences without booking form contact details; Google Calendar uses FreeBusy checks and creates private host-calendar events without guest email addresses.

See [the walkthrough notes](docs/WALKTHROUGH.md) for a demo outline and a guide to the request flow, database constraints, validation, and timezone conversion.

Reference documentation consulted: [NestJS validation](https://docs.nestjs.com/application/validation) and [PostgreSQL INSERT / ON CONFLICT](https://www.postgresql.org/docs/18/sql-insert.html).
