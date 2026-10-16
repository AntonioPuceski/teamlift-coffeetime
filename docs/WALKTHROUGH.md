# Walkthrough and interview notes

## A two-minute product demo

1. Introduce the idea: a lightweight coffee chat scheduler for one host.
2. Open Host view, choose a future date/time, and publish a slot.
3. Return to the booking page, select that day, choose the slot, and book with a demo name/email.
4. Show the confirmation, then return to availability. The booked slot is disabled.
5. Refresh to demonstrate persistence. Mention the real PostgreSQL concurrency test.
6. Explain the scope: no accounts; one timezone; core experience first. Mention one improvement you personally want to build.

## Follow a request through the code

`apps/web/src/main.tsx` collects form data and calls the API. Vite proxies API calls in development; the production frontend uses the same origin as NestJS.

`apps/api/src/main.ts` applies global validation. `apps/api/src/slots.ts` defines request DTOs, routes, and the booking queries. `apps/api/src/database.ts` initializes the connection pool and tables.

The UI's booked state is a convenience. The database's unique constraint is the actual guarantee. Even if two tabs both display an available slot, the database permits only one booking.

## Questions to be ready for

- Why isn't checking `booked === false` in the frontend sufficient?
- What happens if two requests arrive at almost the same time?
- Why use a range exclusion constraint as well as a unique booking constraint?
- What is stored in `TIMESTAMPTZ`, and why explicitly convert the host's input timezone?
- What is the difference between invalid input (400), a missing slot (404), and a conflict (409)?
- Why is the host view public in this challenge? What would change for real users?
- Which code did AI help generate? What did you verify, change, and learn?

Use these as prompts for your own explanation. Don't claim familiarity with a part you haven't reviewed yet.

## Submission checklist

- [ ] Review the code and personalize the copy/design as desired.
- [ ] Run the build and integration tests.
- [ ] Publish the GitHub repository with this README.
- [ ] Deploy the Node app and PostgreSQL database.
- [ ] Test the deployed app from a fresh browser session.
- [ ] Optionally record a video under two minutes.
- [ ] Send the live URL, repository URL, and optional video link by the deadline.

Email subject: `TeamLift Internship Challenge: Antonio Puceski`.
The direct email specifies October 25, 2026; the generic challenge document says within one week of receipt. Finish early enough to satisfy both if possible.
