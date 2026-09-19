# Deploying ECF Roster to Vercel (free tier)

This app is a standard Next.js 14 project — Vercel auto-detects it.
No `vercel.json` is needed; the defaults (build = `npm run build`) work.

## 1. MongoDB Atlas setup (free M0 cluster)

1. Create a free cluster at <https://cloud.mongodb.com> (M0 tier).
2. **Database Access** → Add a database user (username + strong password).
3. **Network Access** → Allow `0.0.0.0/0`.
   Vercel uses dynamic IPs, so the allowlist must be open to anywhere.
   (Access is still gated by your DB username/password.)
4. **Connect → Drivers → Node.js** and copy the connection string, e.g.
   `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

## 2. Environment variables

Set these in **Vercel Dashboard → Project → Settings → Environment Variables**
(Production + Preview + Development, or at least Production):

| Variable | Required | How to get it |
|---|---|---|
| `MONGODB_URI` | ✅ | Atlas connection string from step 1 (with real user/password) |
| `MONGODB_DB` | ❌ | Defaults to `ecf_roster` if unset |
| `SESSION_SECRET` | ✅ | Any random string **≥ 32 chars**. Generate with `openssl rand -hex 32` (or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `NEXT_PUBLIC_BASE_URL` | ✅* | Your Vercel URL, e.g. `https://ecf-roster.vercel.app` — used to build password-reset links. (*Falls back to the request host if unset, but set it explicitly.) |
| `TELEGRAM_BOT_TOKEN` | ❌ | Optional — or set later in Admin → Settings |
| `TELEGRAM_CHAT_ID` | ❌ | Optional — or set later in Admin → Settings |

> ⚠️ Never commit `.env.local` — it is gitignored. It stays on your machine only.

## 3. Deploy

**Option A — from GitHub (recommended):**

```bash
git push origin main        # this repo is already connected (see below)
```

1. Go to <https://vercel.com> → **Add New → Project** → import `ECFRoster`.
2. Vercel detects **Next.js** automatically. Leave build settings as-is.
3. Add the environment variables from step 2.
4. **Deploy.**

**Option B — Vercel CLI:**

```bash
npx vercel          # preview deploy
npx vercel --prod   # production deploy
```

## 4. First-run signup

1. Open your deployed URL. With an empty database you'll be redirected to `/setup`.
2. Create the **first admin account** (name + email + password ≥ 8 chars).
   `/setup` only works when **zero users exist** — afterwards it redirects to `/login`.
3. As admin, add coordinators via **Admin → Users**.

## 5. Password management

There is no email server on the free tier, so resets are **admin-assisted**:

| Situation | How |
|---|---|
| User knows their password | **Account page** (`/account`) → change it with current password |
| User forgot password | User opens `/forgot-password` (linked from login), then **asks an admin**, who goes to **Admin → Users → “Reset link”** and shares the one-time link privately (WhatsApp/Telegram). Links expire in **1 hour** and are **single-use** |
| Admin changes anyone's password | **Admin → Users → Edit** → enter a new password → Save |
| Total lockout (no admin can log in) | Direct DB reset — see below |

### Direct DB reset (emergency admin reset)

Locally (needs `.env.local` with `MONGODB_URI`):

```bash
npm run reset-password -- user@example.com "NewPassword8+"
# i.e. npx tsx scripts/reset-password.ts user@example.com "NewPassword8+"
```

Or in **MongoDB Atlas → Browse Collections → `ecf_roster.users`**,
you can delete a broken account — then `/setup` (if zero users remain) or
another admin recreates it. Passwords are `bcrypt` hashes; always reset via
the script or the Admin UI, never by hand-editing the hash.

## 6. Custom domain (optional)

Vercel Dashboard → Project → **Settings → Domains** → add your domain
and follow the DNS instructions. Update `NEXT_PUBLIC_BASE_URL` to match.

## 7. Redeploys

Every `git push` to `main` auto-redeploys production on Vercel.
Preview deploys are created for other branches / PRs automatically.
