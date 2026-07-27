# PsychRx Drug Library

PsychRx Drug Library is a backend-backed website for maintaining psychiatry pharmacology drug information and showing it on a clean searchable dashboard.

Drug records can be edited through GitHub JSON sync or through the password-protected admin editor.

The frontend files live in `public/` so Vercel can publish them directly, while `/api` contains the Vercel serverless backend.

## Features

- Phone OTP gated public drug dashboard with search and filters
- Drug-name dropdown for quickly choosing a medication
- Drug detail page with a clickable outline for jumping between sections
- Backend API for drug records
- Admin password protected editor
- Add, edit, duplicate, delete, import, export, and clear records
- Supabase-backed production storage
- GitHub Actions workflow to sync `server/data/drugs.json` into Supabase

## Drug Record Sections

Each drug record is organized under these headings:

- Classification
- Mechanism of Action and Receptor Profile
- Pharmacodynamics
- FDA Approved and Off-Label Uses
- Pharmacokinetics and Half-Life
- Clinical Dosing, Optimization, and Target Dose, including separate target dose and maximum dose fields
- Side Effects
- FDA Black Box Warning
- Prescribing in Special Populations
- Drug Interactions
- Miscellaneous

## Local Setup

Create a `.env` file from `.env.example`.

```bash
ADMIN_PASSWORD=replace-with-a-strong-password
SESSION_SECRET=replace-with-a-long-random-secret
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-backend-only-service-role-or-secret-key
OTP_WEBHOOK_URL=https://your-sms-gateway.example/send-otp
OTP_WEBHOOK_TOKEN=optional-gateway-token
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_FROM_NUMBER=+15551234567
OTP_DEV_MODE=true
PORT=3000
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Data Storage

For production, Vercel API routes read and write the `drugs` table in Supabase.
Verified public user profiles are stored in `user_profiles`, and short-lived OTP challenges are stored in `user_otps`.

For local fallback development and GitHub-based syncing, drug records live in:

```text
server/data/drugs.json
```

When Supabase environment variables are present, the API uses Supabase. When they are missing, local development falls back to the JSON file.

## User Phone OTP Access

Public users must create a profile with their name and phone number, request an OTP, and verify it before the dashboard can read `/api/drugs`.

The backend can send OTPs directly through Twilio when these variables are configured:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
```

Alternatively, use `TWILIO_MESSAGING_SERVICE_SID` instead of `TWILIO_FROM_NUMBER`.

The backend can also post OTP delivery requests to `OTP_WEBHOOK_URL` when configured. The webhook receives:

```json
{
  "phone": "+919876543210",
  "otp": "123456",
  "message": "Your Psychiatry Made Easy OTP is 123456. It expires in 10 minutes."
}
```

Use this webhook to connect an SMS provider such as MSG91, Vonage, or your own gateway. In local development, set `OTP_DEV_MODE=true` to return the OTP in the browser for testing. Do not enable `OTP_DEV_MODE` in production.

## Supabase Setup

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run the SQL in `supabase/schema.sql`.
4. Copy your project URL.
5. Copy a backend-only secret key. You can use `SUPABASE_SERVICE_ROLE_KEY` or the newer secret key format.

Do not expose the secret/service-role key in browser JavaScript.

## Vercel Setup from GitHub

1. Push this repository to GitHub.
2. In Vercel, import the GitHub repository.
3. Keep the framework preset as Other.
4. Add these Vercel environment variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY
ADMIN_PASSWORD
SESSION_SECRET
OTP_WEBHOOK_URL
OTP_WEBHOOK_TOKEN, if your gateway requires it
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER if using Twilio directly
```

5. Deploy. Every push to `main` triggers a new Vercel deployment.

## Sync GitHub Drug JSON to Supabase

This repository includes `.github/workflows/sync-supabase.yml`.

To make GitHub push `server/data/drugs.json` into Supabase automatically:

1. Open your GitHub repository.
2. Go to Settings > Secrets and variables > Actions.
3. Add repository secrets:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY
```

4. Edit `server/data/drugs.json` in GitHub or locally.
5. Commit to `main`.
6. GitHub Actions runs `npm run supabase:push` and syncs the JSON into Supabase.

You can also open the Actions tab and run `Sync Supabase Drug Data` manually.

## Recommended Data Flow

Use one primary editing path:

- GitHub-first: edit `server/data/drugs.json`, commit, GitHub Actions syncs Supabase, and Vercel dashboard reads Supabase.
- Admin-panel-first: edit in the website editor, Vercel writes directly to Supabase. Export JSON afterward if you want to update GitHub too.

## Manual Supabase Upload

After setting Supabase environment variables locally, you can push the committed JSON data manually:

```bash
npm run supabase:push
```

## Clinical Safety

This is an educational reference system. Verify all drug information against current prescribing information, institutional protocols, local laws, and clinical judgment before publishing or using it.
