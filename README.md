# PsychRx Drug Library

PsychRx Drug Library is a backend-backed website for maintaining psychiatry pharmacology drug information and showing it on a clean searchable dashboard.

No drug records are included by default. Add records only through the admin editor or by importing drug data you have reviewed.

## Features

- Public drug dashboard with search and filters
- Drug-name dropdown for quickly choosing a medication
- Drug detail page with a clickable outline for jumping between sections
- Backend API for drug records
- Admin password protected editor
- Add, edit, duplicate, delete, import, export, and clear records
- JSON database file for simple self-hosting

## Drug Record Sections

Each drug record is organized under these headings:

- Classification
- Pharmacokinetics
- Pharmacodynamics
- Mechanism of Action
- Dosage and Titration, including target dose and maximum dose
- Indication
- Side Effect
- FDA Black Box Warning
- Special Population Including Organ Impairment
- Drug Interactions
- Miscellaneous

## Local Setup

Create a `.env` file from `.env.example`.

```bash
ADMIN_PASSWORD=replace-with-a-strong-password
SESSION_SECRET=replace-with-a-long-random-secret
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

Drug records are stored in:

```text
server/data/drugs.json
```

The committed database starts empty:

```json
[]
```

When you add or edit drugs from the admin editor, the backend updates this file on the server where the app is running.

## Deploying

This project needs a backend host. GitHub Pages cannot run the editor API.

Good launch options:

- Render
- Railway
- Fly.io
- A VPS with Node.js

For deployment, set these environment variables on the host:

```text
ADMIN_PASSWORD
SESSION_SECRET
PORT
```

Then deploy from the GitHub repository and run:

```bash
npm start
```

## Clinical Safety

This is an educational reference system. Verify all drug information against current prescribing information, institutional protocols, local laws, and clinical judgment before publishing or using it.
