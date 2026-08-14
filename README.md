# PsychRx Drug Library

Psychiatry Made Easy is a plain Node.js, static HTML/CSS/JavaScript, and Vercel Serverless application. It is not a Next.js project.

The public homepage remains at `/`. The drug library and admin editor are protected by Supabase Auth and by server-side authorization checks.

## Routes

- `/` - public homepage
- `/login` - member login
- `/register` - member registration with full name, email, password, and password confirmation
- `/forgot-password` - password recovery request
- `/reset-password` - password update after a Supabase recovery link
- `/library` - authenticated drug library and Ask My Notes
- `/admin/login` - separate admin login
- `/admin` - authenticated and database-authorized Admin Drug Editor

## Preserved Editor Features

- New Drug, Edit Drug, Duplicate Drug, and Delete Drug
- JSON import, export, and clipboard copy
- Notebook Sources upload, indexing, listing, search, and deletion
- Direct Supabase-backed editing without a website redeploy
- The complete 61-record JSON seed in `server/data/drugs.json`

## Security Architecture

The browser sends credentials only to this application's same-origin API routes. Those routes call Supabase Auth with the publishable key. Supabase access and refresh tokens are stored in `HttpOnly`, `SameSite=Lax`, `Secure` production cookies; they are not stored in `localStorage` or `sessionStorage`.

State-changing requests also require a same-origin request and a matching CSRF token. `/library`, `/admin`, all drug APIs, and all notebook APIs verify the Supabase session on the server. Expired access tokens are refreshed server-side and the rotated session is written back to cookies.

Admin authorization is not read from user metadata. After Supabase verifies the user, the server checks `public.admin_users` for the authenticated `auth.users.id`. RLS provides an additional database layer. Authenticated users have no policy or grant that can insert, update, or delete `admin_users` rows.

The Supabase secret or legacy service-role key is used only by Node.js server code. It must never be added to `public/`, browser JavaScript, HTML, or client-visible responses.

## Local Setup

Create `.env` from `.env.example`:

```text
PORT=3000
APP_ORIGIN=http://localhost:3000
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-backend-only-secret-key
```

Legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` names are supported as migration aliases. Prefer the current publishable and secret keys for new configuration.

Run:

```bash
npm run dev
```

Local storage can fall back to `server/data/drugs.json` and the ignored notebook JSON file when database credentials are absent. Authentication still requires Supabase, so protected local routes use the same identity system as production. Production fails closed instead of using local JSON when Supabase storage is missing.

## Database Migrations

Do not run migrations automatically against production. Review and apply these files manually, in order, from the Supabase SQL Editor or an approved migration workflow:

1. `supabase/migrations/202608150000_existing_storage_schema.sql`
2. `supabase/migrations/202608150001_auth_profiles_and_admins.sql`
3. `supabase/migrations/202608150002_authorization_policies.sql`

The migrations are idempotent and do not truncate, replace, or delete drug rows. The old `user_profiles` and `user_otps` tables are retained but locked and marked deprecated.

## Supabase Auth Settings

In Authentication settings:

1. Enable the Email provider and email/password signups.
2. Require email confirmation for new accounts.
3. Set the Site URL to the production origin, for example `https://your-domain.example`.
4. Add exact redirect URLs for `https://your-domain.example/login` and `https://your-domain.example/reset-password`.
5. Add `http://localhost:3000/login` and `http://localhost:3000/reset-password` for local testing.
6. Set a minimum password length of at least 8 characters and enable leaked-password protection when available.
7. Review Auth rate limits. CAPTCHA requires a corresponding browser challenge integration before it is enabled.
8. Configure custom SMTP before production email confirmation and password recovery. Supabase's default mail service is intended only for limited testing.

Vercel preview URLs should be added deliberately. Avoid a broad wildcard unless preview authentication is required and the security tradeoff has been reviewed.

## Create the First Admin

1. Apply all three migrations.
2. Register the intended admin through `/register` using their real full name and email.
3. Confirm the email address and verify that normal `/login` opens `/library`.
4. In Supabase Dashboard, open Authentication > Users and copy that user's UUID.
5. In the SQL Editor, run the following after replacing the UUID:

```sql
insert into public.admin_users (user_id, created_by)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000')
on conflict (user_id) do nothing;
```

6. Log out, then use `/admin/login` with that same Supabase email and password.

Only a trusted database operator with SQL Editor or backend secret-key access can create the first admin. There is intentionally no browser endpoint for promotion.

## Vercel Configuration

Keep the Framework Preset set to **Other** and configure these environment variables for Production and any approved Preview environments:

```text
APP_ORIGIN
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

Set `APP_ORIGIN` to the exact deployed origin, without a path. Vercel functions serve `/library` and `/admin` only after server-side session checks. Security headers and clean route rewrites are defined in `vercel.json`.

## Drug Data and GitHub Sync

Production reads and writes `public.drugs` through server-only APIs. Admin editor changes take effect immediately without redeploying. The committed seed remains at `server/data/drugs.json`.

The existing `.github/workflows/sync-supabase.yml` workflow can still sync that seed after changes to `main`. Its repository secrets must include `SUPABASE_URL` and either `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`. Because the sync replaces the database collection with the committed JSON, use it only as an intentional data operation.

## Validation

```bash
npm run build
npm test
```

## Clinical Safety

This is an educational reference system. Verify all drug information against current prescribing information, institutional protocols, local laws, and clinical judgment before publishing or using it.
