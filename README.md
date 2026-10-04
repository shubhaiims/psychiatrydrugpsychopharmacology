# PsychRx Drug Library

Psychiatry Made Easy is a plain Node.js, static HTML/CSS/JavaScript, and Vercel Serverless application. It is not a Next.js project.

The public landing page is at `/`, and the public drug-library browse page is at `/browse`. The drug library and admin editor are protected by Supabase Auth and by server-side authorization checks.

## Routes

- `/` - public landing page (about the site, features, plans)
- `/browse` - public drug-library browse page, search, and class chips
- `/login` - member login
- `/register` - member registration with full name, email, password, and password confirmation
- `/forgot-password` - password recovery request
- `/reset-password` - password update after a Supabase recovery link
- `/library` - authenticated drug library and Ask My Notes
- `/subscribe` - membership page with Razorpay checkout
- `/account` - signed-in account page: name, membership status, password reset email, log out
- `/terms`, `/privacy`, `/refunds`, `/contact` - policy pages Razorpay reviews; each has highlighted `[BRACKETED]` details for the site owner to fill in
- `/admin/login` - separate admin login
- `/admin` - authenticated and database-authorized Admin Drug Editor, including a read-only Members list

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

## Membership Payments

Members pay through Razorpay Checkout on `/subscribe`. Each payment adds `MEMBERSHIP_DAYS` of access (default 30) for `MEMBERSHIP_PRICE_INR` (default 1).

- Server routes: `GET /api/billing/plans`, `GET /api/billing/status`, `POST /api/billing/order`, `POST /api/billing/verify`
- The server checks the Razorpay signature, confirms the payment with Razorpay, then calls `public.grant_membership` so each payment is counted once
- Payments that finish after the tab closes are picked up the next time the member's status is checked
- `PAYWALL_ENABLED=true` makes `/library`, the drug APIs and Ask My Notes members-only; admins always have access
- Only `/subscribe` allows Razorpay in its Content-Security-Policy
- Apply `supabase/migrations/202610020001_memberships_and_payments.sql` before turning payments on

## Account and Members API

- `GET /api/account` returns the signed-in user's name, email, role and membership status. `PATCH /api/account` with `{ "fullName": "..." }` changes the name; the existing database trigger copies it into `public.profiles`.
- `GET /api/admin/members` (admins only) returns the newest 500 profiles with each member's access end date.

Vercel's free plan allows 12 serverless functions per deployment, and `api/` is already at 12. These two routes are served by `api/auth/[action].js` through rewrites in `vercel.json` instead of getting their own files. `npm run build` fails if `api/` grows past 12 files.

## Database Migrations

Do not run migrations automatically against production. Review and apply these files manually, in order, from the Supabase SQL Editor or an approved migration workflow:

1. `supabase/migrations/202608150000_existing_storage_schema.sql`
2. `supabase/migrations/202608150001_auth_profiles_and_admins.sql`
3. `supabase/migrations/202608150002_authorization_policies.sql`
4. `supabase/migrations/202608150003_drop_legacy_mobile_otp.sql`
5. `supabase/migrations/20260815061242_harden_public_defaults_and_indexes.sql`

The migrations are idempotent and do not truncate, replace, or delete drug rows. Mobile/phone OTP storage is removed; authentication uses Supabase email and password accounts.

## Supabase Auth Settings

In Authentication settings:

1. Enable the Email provider and email/password signups.
2. Turn on **Confirm email** (Authentication > Providers > Email). The server also refuses to start a session, or serve any protected route, for a user whose `email_confirmed_at` is empty, so access stays gated even if this setting is switched off by mistake.
3. Set the Site URL to the production origin, for example `https://your-domain.example`.
4. Add exact redirect URLs for `https://your-domain.example/login` and `https://your-domain.example/reset-password`.
5. Add `http://localhost:3000/login` and `http://localhost:3000/reset-password` for local testing.
6. Set a minimum password length of at least 8 characters and enable leaked-password protection when available.
7. Review Auth rate limits. CAPTCHA requires a corresponding browser challenge integration before it is enabled.
8. Configure custom SMTP (Authentication > Emails > SMTP Settings) before production. Supabase's built-in mailer allows only about 2 auth emails per hour project-wide, so signup confirmation stops for everyone after that. Use any provider (Resend, Brevo, Amazon SES, Postmark, Gmail Workspace SMTP), verify your sending domain (SPF/DKIM), then raise **Rate Limits > Emails sent per hour** to match, for example 30 to 100.

Vercel preview URLs should be added deliberately. Avoid a broad wildcard unless preview authentication is required and the security tradeoff has been reviewed.

## Latest Research Feed

`/research` reads `public/research.json`, which `.github/workflows/update-research.yml` refreshes daily from PubMed (JAMA Psychiatry, Bipolar Disorders, Psychiatry Research, and psychiatry-topic NEJM papers). The workflow never deploys by itself: it pushes the `research-update` branch and opens a pull request, and the site updates only when you merge it. Run it once from the Actions tab (Run workflow) to fill the page for the first time. Optionally add an `NCBI_API_KEY` repository secret for higher PubMed rate limits.

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

`SUPABASE_URL` should be the project origin (for example, `https://project-ref.supabase.co`). The server also normalizes a mistakenly copied `/rest/v1` endpoint to the project origin so Auth and database requests cannot be routed to the wrong Supabase service.

`GET /api/health` checks the deployed server's Auth and backend-only database configuration. It returns readiness states only; it never returns keys or drug records.

## Drug Data and GitHub Sync

Production reads and writes `public.drugs` through server-only APIs. Supabase is the live source of truth, and Admin Drug Editor changes take effect immediately without redeploying. Normal code pushes, Vercel deployments, and authentication changes never synchronize or replace drug records.

The original 61-record backup/seed remains at `server/data/drugs.json`. `.github/workflows/sync-supabase.yml` is available only through GitHub Actions `workflow_dispatch`; it has no `push` trigger. A manual run requires typing `REPLACE_ALL_SUPABASE_DRUGS` before it invokes the replacement script.

`npm run supabase:push` is a destructive full-table replacement, not a deployment step. It deletes every row in `public.drugs` and then inserts the committed seed. The script refuses to run unless `CONFIRM_SUPABASE_DRUG_REPLACE=REPLACE_ALL_SUPABASE_DRUGS` is set explicitly. Never add this command to a normal build, deploy, push, or scheduled workflow.

For a deliberate local seed restore in PowerShell, after reviewing the target project and seed file:

```powershell
$env:CONFIRM_SUPABASE_DRUG_REPLACE="REPLACE_ALL_SUPABASE_DRUGS"
npm run supabase:push
```

The manual workflow and local command require `SUPABASE_URL` plus either `SUPABASE_SECRET_KEY` or the legacy `SUPABASE_SERVICE_ROLE_KEY`. These server-side secrets must never be exposed to browser code.

## Validation

```bash
npm run build
npm test
```

## Clinical Safety

This is an educational reference system. Verify all drug information against current prescribing information, institutional protocols, local laws, and clinical judgment before publishing or using it.
