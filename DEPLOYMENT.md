# Deployment

The frontend is a Vite single-page application for Vercel. The deployed
frontend at `https://i-lab-appoinment.vercel.app` currently uses the persistent
Railway API at `https://ilabappoinment-production.up.railway.app`. The Express
API, PostgreSQL client, WebSocket server, and appointment reminder worker must
run as a persistent Node service; do not deploy the backend as Vercel
serverless functions. `render.yaml` is an alternative Render Blueprint, not the
configuration for the currently deployed Railway service.

## 1. Keep credentials private

If a database password is exposed, rotate it in Supabase before using it for
production. Never paste database passwords, JWT secrets, service-role keys, or
connection strings into chat, source files, Vite variables, or GitHub. Use the
hosting providers' secret/environment-variable forms.

## 2. Deploy the backend to Railway

In the Railway project, configure the backend service with the repository root
directory set to `/backend`, build command `npm ci`, and start command
`npm start`. This ensures Railway builds the dedicated PostgreSQL/Express API
package rather than the legacy SQLite app at the repository root. The root
`npm start` script also delegates to the same backend for local consistency.

Set Railway's health check path to `/ready`. If the frontend and backend share
the repository, set watch paths to `/backend/**`. Add these variables in
Railway's service variables:

- `NODE_ENV`: `production`
- `JWT_SECRET`: a stable, randomly generated secret
- `SUPABASE_DB_URL`: the Supabase **Session pooler** URI shown under **Connect**
  or **Database settings**. Enter the password only in Railway. URL-encode
  reserved password characters when constructing the URI.
- `FRONTEND_VISITOR_URL`: `https://i-lab-appoinment.vercel.app`
- `CORS_ORIGINS`: `https://i-lab-appoinment.vercel.app`

Railway supplies `PORT`; do not hard-code it. Keep `JWT_SECRET` stable across
deploys, since changing it invalidates existing sessions. Never add the
database URL or JWT secret to Vercel variables or source control.

After deploying, confirm `/live` and `/ready` both return HTTP 200. `/live`
confirms the process started; `/ready` also checks database connectivity and
the required schema. Keep the API as a persistent Railway service: the
WebSocket server and appointment reminder worker are not serverless.

### Alternative: Render Blueprint

To deploy on Render instead, connect the repository as a Blueprint and use
`render.yaml`. Set `SUPABASE_DB_URL` in the Render service environment and keep
its generated `JWT_SECRET` stable across redeployments. If the API moves to a
different host, update Vercel's `VITE_API_URL` and the API's `CORS_ORIGINS`.

The Supabase project has the application schema and RLS enabled. Schema updates
are deliberately not run during deployment; review and apply future migrations
through Supabase SQL Editor or a controlled migration job.

## 3. Deploy the frontend

1. Import the same GitHub repository into Vercel. Keep the project root at the
   repository root; the root `package.json` builds the Vite app, and
   `vercel.json` serves client-side routes through `index.html`.
2. Add these **Production** environment variables in Vercel:
   - `VITE_API_URL`: `https://ilabappoinment-production.up.railway.app/api`
     (the public API URL; `/api` may be omitted, but do not use `localhost`)
   - `VITE_SUPABASE_URL`: `https://jpghwcpayzcvvvrefzlt.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: the project's publishable/anon key from
     Supabase **Project Settings → API**. This is a public browser key; never
     use the service-role key here.
3. Redeploy after saving environment variables. In Railway, set `CORS_ORIGINS`
   to the exact Vercel deployment origin, with no trailing slash or path.
   Multiple allowed origins may be comma-separated; do not include `/api`.
   The frontend build fails when Vercel does not receive an HTTPS
   `VITE_API_URL`, instead of publishing a site whose requests point at
   `localhost`.

The Supabase JavaScript client is present for browser use, but the current
application's data operations go through the Express API. The API connects to
Postgres using `SUPABASE_DB_URL`; do not expose that variable to Vercel's
frontend build.

## 4. Create the first administrator

There are intentionally no seeded admin or staff accounts. Register a visitor
through the deployed app, then run this statement in the Supabase SQL Editor,
replacing the email with the account's exact email:

```sql
UPDATE public.users
SET role_id = (SELECT role_id FROM public.roles WHERE role_name = 'Admin')
WHERE email = 'your-admin-email@example.com';
```

Confirm exactly one row was updated, then sign in through the admin portal.
Create any staff accounts through the admin user-management page.

## 5. Verify the deployment

- Open the frontend and register/sign in as a visitor.
- Verify appointment availability, booking, rescheduling, cancellation, and
  feedback.
- Verify admin login, facility/user/content management, chatbot FAQ management,
  audit log, and analytics.
- Verify the visitor and admin chat screens receive live WebSocket events.
- From the deployed frontend, confirm the browser's API requests use the Railway
  host and that `/api/health` returns HTTP 200. If requests are blocked by CORS,
  add that exact Vercel origin to Railway's `CORS_ORIGINS` and restart the API.
- Check Railway logs and the service `/ready` endpoint for database readiness.
- Configure SendGrid/Twilio credentials in Railway if email/SMS delivery is
  required; without provider credentials, notifications are not delivered.

Keep the Railway service running continuously for reliable WebSockets and
appointment reminder timing.
