# ECF Roster

Evangel Christian Fellowship — service rostering web app.

A Next.js 14 application for managing weekly service rosters with a multi-role
workflow (Worship Coordinator → Service Coordinator → Admin approval), automatic
constraint-based roster generation, validation warnings, and Telegram
notifications.

## Tech Stack

- **Next.js 14 (App Router)** + TypeScript
- **MongoDB Atlas** (free tier) via the official `mongodb` driver
- **iron-session** for auth (encrypted cookie sessions, serverless-safe)
- **Tailwind CSS** for styling
- **xlsx** for Excel seed import
- **Native fetch** for Telegram Bot API

## Quick Start

### 1. Prerequisites

- Node.js 18+
- MongoDB Atlas cluster (or local MongoDB)
- `npm` (or `yarn` / `pnpm`)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your values:

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB connection string (e.g. `mongodb+srv://...`) |
| `MONGODB_DB` | ❌ | Database name (default: `ecf_roster`) |
| `SESSION_SECRET` | ✅ | Random string ≥ 32 chars for session signing. Generate with `openssl rand -hex 32` |
| `TELEGRAM_BOT_TOKEN` | ❌ | Telegram bot token (optional notifications) |
| `TELEGRAM_CHAT_ID` | ❌ | Telegram chat/group ID (optional notifications) |
| `NEXT_PUBLIC_BASE_URL` | ❌ | Public URL for links in Telegram messages (default: `http://localhost:3000`) |

### 4. Seed from Excel (optional)

If you have the ECF Service Roster Excel files, import people and reference rosters:

```bash
# Place the Excel files in the project root:
#   07 - ECF Service Roster JUL 2026.xlsx
#   08 - ECF Service Roster AUG 2026.xlsx
npm run seed
```

This imports:
- **People** (34+) with their role capabilities from the reference table
- **Rules** document with default rosters configuration
- **July & August reference rosters** (used by the algorithm for "previous month" checks)

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On first launch with an empty database, you'll be redirected to `/setup` to
create the initial admin account. `/setup` doubles as the **signup page**:
it only works while zero users exist.

## Password management (no email server needed)

| Situation | How |
|---|---|
| Know your password | **Account** page (`/account`) → change it with your current password |
| Forgot your password | Open `/forgot-password` (linked on the login page), then ask an admin to generate a one-time link via **Admin → Users → “Reset link”**. Links expire in 1 hour, single-use |
| Admin resets anyone | **Admin → Users → Edit** (set a new password directly) or **“Reset link”** (share privately) |
| Total lockout | `npm run reset-password -- user@example.com "NewPassword8+"` (uses `.env.local`), or see `DEPLOY.md` for the Atlas-console fallback |

## Deploy to Vercel

Full guide: **`DEPLOY.md`** (env keys, Atlas IP allowlist, first-run signup).

1. Push the repo to GitHub
2. Import into [Vercel](https://vercel.com) — framework auto-detected as Next.js
3. Set environment variables in Vercel dashboard (`MONGODB_URI`, `SESSION_SECRET`, `NEXT_PUBLIC_BASE_URL`, …)
4. Deploy

For MongoDB Atlas: set IP allowlist to `0.0.0.0/0` (or Vercel's dynamic IPs).

## Roles & Workflow

| Role | Pages | Capabilities |
|---|---|---|
| **Admin** | Dashboard, Users, People, Rules, Settings, Roster | Full access. Create roster months, manage users, approve rosters. |
| **Worship Coordinator** | My Roster | Edit worship team slots (Singers, Musicians, Worship Leader). Submit to Service Coordinator. |
| **Service Coordinator** | Roster | Edit service slots (HC, Ushers, Counting, Camera, etc.). Submit for Admin approval. |

### Roster Status Flow

```
DRAFT → WORSHIP_FILLED → SERVICE_FILLED → APPROVED
```

- Admin creates a new month (status: `DRAFT`)
- Worship Coordinator fills worship slots → submits (status: `WORSHIP_FILLED`)
- Service Coordinator fills remaining slots → submits (status: `SERVICE_FILLED`)
- Admin approves (status: `APPROVED`) → roster becomes read-only
- Any pre-approved status can be reset back to `DRAFT` by an admin
- At each transition, a Telegram notification is sent (if configured)

### Auto-Generation

The "Auto-fill" button runs the constraint-satisfaction algorithm that:

1. **Preaching** — rotation: Ps Ludwig (wk 1/3), Chris/Donald alternate (wk 2), Dino (wk 4), Grace (wk 5)
2. **Worship Leader** — round-robin
3. **HC Conductor** — priority list with preaching-conflict checks
4. **HC Setup** — fixed (Ezekiel/Ammon)
5. **HC Servers** — 3 per week, 3rd from preferred pool, Dino/Amy clash rule
6. **Musicians & Singers** — from capability pools, fairness-based assignment
7. **Ushers** — expert+young pairing, ≤2/month, no back-to-back
8. **Counting** — senior+junior pairs, Karen/Wanying conflict avoided
9. **Toilets** — from capability lists

The algorithm warns (but doesn't block) on soft violations.

## Project Structure

```
ecf-roster/
├── package.json
├── next.config.mjs
├── tsconfig.json
├── tailwind.config.ts
├── .env.local.example
├── scripts/
│   ├── seed-from-excel.ts      # One-time Excel import (npm run seed)
│   ├── seed-test-users.ts      # Test logins (npm run seed-test-users)
│   └── reset-password.ts       # Emergency DB password reset
├── DEPLOY.md                   # Vercel deployment guide
└── README.md
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Role-based redirect
│   │   ├── login/              # Login page (+ forgot-password link)
│   │   ├── forgot-password/    # Request an admin-assisted reset
│   │   ├── reset-password/     # One-time reset link landing page
│   │   ├── account/            # Change own password (logged in)
│   │   ├── setup/              # First-run admin creation (signup)
│   │   ├── admin/              # Admin pages (Dashboard, Users, People, Rules)
│   │   ├── worship/            # Worship Coordinator page
│   │   ├── service/            # Service Coordinator page
│   │   ├── api/                # REST API routes (auth incl. forgot/reset/change-password, users, people, rules, settings, roster, generate, telegram)
│   ├── lib/
│   │   ├── db.ts               # MongoDB connection + typed collections
│   │   ├── auth.ts             # iron-session auth, password hashing
│   │   ├── passwordReset.ts    # one-time reset tokens (1h, single-use)
│   │   ├── types.ts            # Shared TypeScript interfaces
│   │   ├── dates.ts            # Date helpers (ISO format, Sundays in month, etc.)
│   │   ├── defaultRules.ts     # Default rosters configuration
│   │   ├── rules.ts            # Roster validation engine
│   │   ├── algorithm.ts        # Constraint-satisfaction roster generator
│   │   └── telegram.ts         # Telegram Bot API integration
│   └── components/
│       ├── Navbar.tsx           # Top navigation bar
│       └── RosterGrid.tsx       # Editable roster table with cell-level editing
└── README.md
```

## Deploy to Vercel

Full guide: **`DEPLOY.md`**.

1. Push the repo to GitHub
2. Import into [Vercel](https://vercel.com) — framework auto-detected as Next.js
3. Set environment variables in Vercel dashboard (same as `.env.local`)
4. Deploy

For MongoDB Atlas: set IP allowlist to `0.0.0.0/0` (or Vercel's dynamic IPs).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (http://localhost:3000) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run seed` | Import people & rosters from Excel files |
| `npm run seed-test-users` | Create/reset `admin@ecf.test` + `worship@ecf.test` (password: `test1234`) |
| `npm run reset-password` | Reset any user's password: `npm run reset-password -- user@x.com "NewPass8+"` |
| `npm run lint` | Run ESLint |

## License

Internal use — Evangel Christian Fellowship.
