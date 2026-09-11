# Village Central — standalone Vercel setup

This export no longer needs the Bool runtime. The browser talks only to same-origin `/api/*` routes. Vercel API functions talk to Supabase with a server-only service-role key.

## 1. Create / choose a Supabase project

Open Supabase and create a project. In the SQL Editor, run the complete file:

`supabase/migrations/001_village_central.sql`

This creates the banking, session, transaction, diamond reserve, economy, news, jobs, applications, and audit tables plus atomic PostgreSQL functions for transfers and approved deposit/withdrawal operations.

## 2. Vercel environment variables

In Vercel → Project → Settings → Environment Variables, add these to Production (and Preview if you use Preview deployments):

- `SUPABASE_URL` — your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — the server-only Supabase service-role key
- `SESSION_SECRET` — a long random secret (reserved for future signing; keep private)
- `BOOTSTRAP_SECRET` — a long random secret used only to initialize the first accounts
- `INITIAL_ADMIN_PASSWORD` — Omar's first password, at least 8 characters

There are intentionally **no required `VITE_SUPABASE_*` or `VITE_BOOL_*` variables**. This prevents the old `supabaseUrl is required` blank-screen crash and keeps privileged credentials out of the browser.

Redeploy after adding environment variables.

## 3. Initialize the eight users once

After the first deployment and after the SQL migration is applied, send one POST request to:

`https://YOUR-DOMAIN.vercel.app/api/bootstrap`

JSON body:

```json
{
  "secret": "YOUR_BOOTSTRAP_SECRET",
  "omar_password": "THE_PASSWORD_YOU_WANT_FOR_OMAR"
}
```

This creates, if missing: Anas, Samma, Youssef, Ahmad, Omar, Bisher, Abdullah, and Mikyle. Omar is created with `role=admin`; the others are normal users. It does not duplicate existing users.

For the other users, Omar can sign in and use **Admin Console → Users → Reset password** to assign temporary passwords. Existing passwords are never viewable.

You can make the bootstrap request from a terminal:

```bash
curl -X POST https://YOUR-DOMAIN.vercel.app/api/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"secret":"YOUR_BOOTSTRAP_SECRET","omar_password":"YOUR_ADMIN_PASSWORD"}'
```

After initialization, you may remove `BOOTSTRAP_SECRET` and `INITIAL_ADMIN_PASSWORD` from Vercel if desired.

## 4. Vercel settings

- Framework preset: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: repository root

`vercel.json` preserves `/api/*` server routes and sends SPA routes to `index.html`.

## 5. How authentication works

Login is Minecraft username + password only. There is no email, Google, Discord, OAuth, or magic-link login. `/api/auth/login` verifies a server-side scrypt password hash, creates an expiring session row, and sends an HttpOnly cookie. `/api/auth/session` restores the session after refresh. `/api/auth/logout` revokes it.

## 6. Admin behavior

Omar's real database role is `admin`. Every `/api/admin/*` route re-checks the session and role on the server. Admin can freeze/unfreeze accounts, suspend users, reset passwords, change roles, modify balances through audited adjustments, review deposits/withdrawals, make admin transfers, adjust diamond reserves, change the exchange rate, create/publish/delete news and jobs, review applications, and upload persistent images to the `public-media` Supabase Storage bucket.

## 7. Banking integrity

Transfers and approved deposit/withdrawal flows use SQL functions in the migration so related account, reserve, transaction, history, and audit changes execute in one PostgreSQL transaction with row locking where applicable.

## Troubleshooting

- Blank page: this build no longer initializes Supabase in the browser. If the API is not configured, the UI renders an error instead of crashing.
- Login says server configuration missing: check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel, then redeploy.
- Login says invalid username/password: run bootstrap once or reset that user from Admin.
- `/api/auth/session` returns HTML: confirm this repository's `vercel.json` is deployed and `/api/[...path].ts` exists.
- Admin 403: check Omar's `role` is `admin` and `status` is `active`.
- Image upload fails: ensure the service-role key is valid. The API creates the `public-media` bucket when possible.


## Vercel API routing (final)
This build uses a single explicit Vercel Function at `/api/gateway` for all application API calls. The frontend sends the requested internal route in the `path` query parameter. `/api/bootstrap` and `/api/health` are explicit wrapper functions. The previous catch-all function was removed to avoid Vite/Vercel SPA rewrite conflicts and HTTP 405 responses.
