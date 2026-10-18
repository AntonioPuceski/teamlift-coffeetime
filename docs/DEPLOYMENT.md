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

## Free-tier behavior

Render's free web service can sleep after inactivity, so the first visit may take longer. Neon's free database can also suspend its compute while idle. The connection pool uses a bounded connection timeout and handles idle disconnects; subsequent requests open fresh connections.

Render's free PostgreSQL database expires after 30 days, which is why this setup uses Neon. Stay on the Free plans; no paid resources are required for the challenge. Recheck provider terms before enabling anything beyond this setup.

Sources: [Render free-tier limits](https://render.com/docs/free), [Render Blueprint configuration](https://render.com/docs/blueprint-spec), [Neon free plan](https://neon.com/blog/neon-free-plan-1-gb-per-project).
