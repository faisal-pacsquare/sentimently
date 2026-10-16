# Deploying Sentimently

Three Vercel projects from one GitHub repository, plus one free database:

| Part | Folder (Vercel "Root Directory") | Address (example) |
|---|---|---|
| API | `sentimently-api` | `https://sentimently-api.vercel.app` |
| Shop | `sentimently-web/apps/storefront` | `https://sentimently.vercel.app` (later `www.yourshop.pk`) |
| Studio console | `sentimently-web/apps/admin` | `https://sentimently-studio.vercel.app` (later `studio.yourshop.pk`) |
| Database | Upstash Redis, from the Vercel Marketplace | free plan |

Everything below is done once. Deploying a change afterwards is just `git push`.

## What you need first
- A GitHub account and a Vercel account (the free plans are enough to start).
- About 30 minutes.
- Decisions to keep handy: the admin email and a strong password (12+ characters).

## 1. Put the code on GitHub
The repository is already initialised in this folder, with nothing committed yet. Create an empty **private** repository on GitHub, then:

```bash
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<you>/sentimently.git
git push -u origin main
```

On GitHub, open the **Actions** tab. The `ci` workflow runs on its own and takes about 5 minutes. It must be green before you go on: it runs the API tests, the web tests, both production builds, a dependency audit, a short load test, and a smoke test that places a real order.

## 2. Create the database (Upstash Redis)
1. In Vercel: **Storage** > **Create Database** > **Upstash** (Redis). Pick the free plan and the **Mumbai (ap-south-1)** region, which is closest to the API's server region (`bom1`, set in `sentimently-api/vercel.json`).
2. Do not connect it yet; create the API project first (step 3), then connect it to that project. Vercel then adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the API project by itself.

**How it behaves.** On the very first read, each collection (gifts, groups, settings...) is copied from `sentimently-api/data/*.json` into Redis. From then on **Redis is the truth**: changing the files and redeploying will *not* change the live shop. Change the live catalogue in the studio console. Orders, accounts and stock live only in Redis.

## 3. Deploy the API
1. Vercel > **Add New** > **Project** > import the repository.
2. **Root Directory:** `sentimently-api`. Framework preset: **Other**. Leave the build settings as they are (`vercel.json` sets them).
3. Add these **environment variables** before the first deploy:

| Name | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `JWT_SECRET` | a random string of 32+ characters | Changing it signs everyone out. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_EMAIL` | your email | Creates the first administrator at startup if none exists |
| `ADMIN_PASSWORD` | 12+ characters | Remove both `ADMIN_*` variables once you can sign in (see step 7) |
| `APP_URL` | the shop's address, e.g. `https://sentimently.vercel.app` | No trailing slash. Used in emailed links and for returning from card payments |
| `CORS_ORIGINS` | the shop and the console addresses, comma separated | e.g. `https://sentimently.vercel.app,https://sentimently-studio.vercel.app`. Without it browsers are blocked from calling the API |
| `CRON_SECRET` | a random string of 16+ characters | Switches on the scheduler endpoint (step 6) |
| `ALERT_EMAIL` | an address that watches for problems | Failed gifts, overdue refunds |
| `RATE_LIMIT_MAX` | leave unset (120 a minute) | |

4. Click **Deploy**. If it stops with "Unsafe production configuration", the message says which setting is missing; the API refuses to start in production without a real `JWT_SECRET`, and without a database it refuses unless `ALLOW_MEMORY_STORAGE=true` (a demo where orders can vanish).
5. Now connect the database: project **Storage** tab > connect the Upstash database. Then **Deployments** > the latest > **Redeploy**.
6. Check `https://<your-api>/api/v1/health`. It should say `"store":"UpstashDriver"`. If it says `MemoryDriver`, the database is not connected.

## 4. Deploy the shop and the studio console
Do this twice, with these differences:

| | Shop | Studio console |
|---|---|---|
| Root Directory | `sentimently-web/apps/storefront` | `sentimently-web/apps/admin` |
| Project name | `sentimently` | `sentimently-studio` |

For both: framework preset **Vite** (detected automatically). Leave **Include source files outside of the Root Directory** switched **on** (the apps share code from `sentimently-web/packages`).

**Environment variable (both projects):**

| Name | Value |
|---|---|
| `VITE_API_URL` | `https://<your-api>.vercel.app/api/v1` |

This is baked in when the app is built, so after changing it you must redeploy.

Then go back to the API project and set `APP_URL` and `CORS_ORIGINS` to the real addresses of these two projects (step 3 table), and redeploy the API.

## 5. Check it works
1. Open the shop. The home page should show gifts and pictures.
2. Add a gift, personalise it, and place a **cash on delivery** order.
3. Open the studio console, sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. The order should be under **Needs action**.
4. Track the order on the shop's **Track an order** page.
5. Open `https://<your-api>/api/v1/health` again: `UpstashDriver`.

## 6. The background jobs (scheduler)
Scheduled digital gifts, reminders, overdue-refund alerts and expiring gift links all run from one endpoint, `GET /api/v1/internal/scheduler/run`, which needs `Authorization: Bearer <CRON_SECRET>`.

- **Baseline (already configured):** `sentimently-api/vercel.json` has a Vercel cron that runs it once a day at 03:00 UTC (8:00 in Pakistan). Vercel sends the secret by itself.
- **Every 10 minutes (recommended):** the free Vercel plan allows only a daily cron, so a gift scheduled for "9:00" would wait until the next morning. `.github/workflows/scheduler.yml` calls the endpoint every 10 minutes for free. In the GitHub repository: **Settings > Secrets and variables > Actions**:
  - **Variables** tab: `API_URL` = `https://<your-api>.vercel.app` (no trailing slash)
  - **Secrets** tab: `CRON_SECRET` = the same value you gave the API
- GitHub pauses scheduled workflows in a repository with no activity for 60 days. If you are on a paid Vercel plan, change the cron in `vercel.json` to `*/5 * * * *` instead and delete the workflow.

## 7. After the first sign-in
- In Vercel, delete `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the API project and redeploy. The admin account stays in the database. Add other staff from the console's **Team and tools** page.
- Change the sample content: gifts, prices, delivery rates, the announcement bar and the bank-transfer text (**Settings**).

## Custom domains
Add them in each project's **Settings > Domains**, then update the API's `APP_URL` and `CORS_ORIGINS` and the two apps' `VITE_API_URL` if the API address changes, and redeploy all three.

## What is not ready yet (do not launch without these)
These are the launch blockers from the backend gate report that deployment does not solve:

- **Email is not wired.** The API only prints emails to its log. Order confirmations, email verification, password resets and gift links reach nobody. Pick a provider (Resend, Brevo, SendGrid...) and the API needs a real sender added. Until then, customers cannot confirm their email or reset a password.
- **Card payments** need Safepay keys and a sandbox test: see `Safepay_Sandbox_Checklist.md`.
- **Photos are links, not uploads** (no file storage yet).
- **Real content, policies and legal pages** are placeholders.
- **No uptime monitoring or backups.** Add a free uptime check on `/api/v1/health`. Upstash keeps your data, but export it before big changes.
- **Free-plan limits:** Upstash's free plan allows a fixed number of commands a month and the shop reads from it often; watch the usage graph in the first weeks.

## Rolling back
Vercel keeps every deployment. In a project's **Deployments** list, open an older one and choose **Promote to Production**. Data in Redis is not rolled back with the code.
