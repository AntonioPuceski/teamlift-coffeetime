# Free deployment: Render + Neon

Live app: **https://teamlift-coffeetime.onrender.com**. Deployed and verified October 18, 2026.

The current service uses Render's public Git repository connection on branch `codex/initial-app`. For future code changes, use **Manual Deploy → Deploy latest commit** in Render and verify `/api/health` afterward; do not assume a push automatically deploys this service.

The app uses one Render web service for both React and NestJS and a separate Neon PostgreSQL database. Keep both in a nearby European region, such as Frankfurt.

## Database

1. Create a Neon project on the **Free** plan with PostgreSQL 17 or newer.
2. Copy its direct PostgreSQL connection string, including its TLS parameters, into Render's `DATABASE_URL` secret. Do not put it in the repository or paste it into a public issue.
3. No manual table creation is needed. The API initializes its schema on startup.

## Web service

Connect this GitHub repository to Render as a Blueprint, using the committed `render.yaml`, or configure a Node web service manually:

| Setting        | Value                                      |
| -------------- | ------------------------------------------ |
| Plan           | Free                                       |
| Region         | Frankfurt                                  |
| Root directory | Repository root (leave blank)              |
| Build command  | `npm ci --include=dev && npm run build`    |
| Start command  | `npm start`                                |
| Health check   | `/api/health`                              |
| `HOST`         | `0.0.0.0`                                  |
| `NODE_ENV`     | `production`                               |
| `DATABASE_URL` | Neon connection string, stored as a secret |

Node is pinned in `.node-version`. Render supplies `PORT`. The built frontend and API share an origin, so there is no separate frontend URL or CORS setup.

## Verify the deployment

1. Visit `/api/health` on the live domain. Expect `{"status":"ok"}`.
2. Open the app, publish a future slot through Host view, and book it using demo contact details.
3. Reload and verify that the slot is booked. Open another browser tab and confirm it cannot be booked again.
4. Add several unbooked slots for the reviewer. Create dates beyond the submission deadline so the demo remains useful during review.
5. Add the verified live URL to the top of the README and to the submission email.

GitHub Actions builds the app and runs integration tests against PostgreSQL 17 on every push and pull request. Check that the workflow is green before submitting.

## Google Calendar connection

The host authorizes one Google account. Guests do not need to sign in. The app checks FreeBusy availability and creates an event on the selected host calendar after a booking is saved. Event creation uses the guest's name in the event title; guest email is not written to Google Calendar and no invitation is sent.

1. In Google Cloud Console, create/select a project and enable **Google Calendar API**.
2. Set up the OAuth consent screen as **External** and add the host's Google account as a test user while the app is in Testing mode.
3. Create an OAuth client with type **Web application**. Add `https://developers.google.com/oauthplayground` as an authorized redirect URI. Save the client ID and client secret privately.
4. Open [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/). In its settings, enable **Use your own OAuth credentials**, choose server-side flow, offline access, and force the consent screen. Enter the client ID and secret.
5. Request both scopes:
   - `https://www.googleapis.com/auth/calendar.freebusy`
   - `https://www.googleapis.com/auth/calendar.events.owned`
6. Authorize as the host's Google account, exchange the code for tokens, and copy the refresh token.
7. In Render → **Environment**, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` as secret values. Set `GOOGLE_CALENDAR_ID` to `primary` unless using a different calendar ID. Save, rebuild, and deploy.
8. Verify `/api/integrations/status` reports `googleCalendar: true`, then make a test booking and confirm its event appears in the host calendar.

Never paste client secrets or refresh tokens into Git, the frontend, or this chat. A refresh token from an OAuth consent screen in Testing mode expires after seven days; reauthorize if it stops working. If you later change requested scopes, authorize again with both scopes and replace the old refresh token.

## Free-tier behavior

Render's free web service can sleep after inactivity, so the first visit may take longer. Neon's free database can also suspend its compute while idle. The connection pool uses a bounded connection timeout and handles idle disconnects; subsequent requests open fresh connections.

Render's free PostgreSQL database expires after 30 days, which is why this setup uses Neon. Stay on the Free plans; no paid resources are required for the challenge. Recheck provider terms before enabling anything beyond this setup.

Sources: [Render free-tier limits](https://render.com/docs/free), [Render Blueprint configuration](https://render.com/docs/blueprint-spec), [Neon free plan](https://neon.com/blog/neon-free-plan-1-gb-per-project).
