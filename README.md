# Selamont

The Selamont web app: landing page, pricing, Google and email sign-in, a Stripe paywall, an admin area, and five working engines.

| Engine | What it does | Needs |
|---|---|---|
| **Content Engine** | Upload product photos, get hooks, captions, product copy, ad concepts and a 7-day launch plan | Anthropic key |
| **Store Analyzer** | Scans any store URL as a phone shopper: 21 conversion/trust/mobile/SEO checks, Google mobile speed, and AI fixes | Works without keys; AI + speed test need keys |
| **Drops & Launches** | Public launch pages with countdown + waitlist (`/d/your-drop`), CSV export, AI announcements | Supabase |
| **Creator Marketplace** | Brands post briefs, creators apply, brands accept/approve, referral codes, commission + fee tracking | Supabase |
| **Launch Analytics** | Views, unique visitors, sign-up rate, store clicks, daily charts per drop | Supabase |

## Run it on your computer

```bash
npm install
npm run dev
```

Open http://localhost:5173. With no keys it runs in **demo mode** (fake sign-in; the Store Analyzer works; database engines show a setup notice). `npm run dev` also runs the `/api` server code, so everything you add to `.env` works locally.

## Where to host: Vercel (not GitHub Pages)

The engines run server code (AI calls, store scanning, payments). **GitHub Pages can only host static files**, so on Pages the website loads but the engines can't work. Use **GitHub to store the code** and **Vercel to host it**. Vercel deploys automatically every time you push to GitHub.

> Vercel's free Hobby plan is for non-commercial use. Once you charge customers, Vercel's terms require the Pro plan.

## Put the code on GitHub

1. Create an account at https://github.com and click **New repository**. Name it `selamont`, set it to **Private**, and don't add a README.
2. In a terminal in `C:\Selamont` (the project is already a git repository with a first commit):
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/selamont.git
   git push -u origin main
   ```
   The first push opens a browser window to sign in to GitHub.
3. Afterwards, save and publish changes with:
   ```bash
   git add -A && git commit -m "Describe the change" && git push
   ```

## Deploy on Vercel

1. Sign in at https://vercel.com with GitHub, click **Add New → Project**, and import `selamont`. The settings are detected from `vercel.json`.
2. Before deploying, add the environment variables from `.env.example` (Settings → Environment Variables). You can deploy with none set and add them later; redeploy after changes.
3. Your site is live at `https://selamont-xxxx.vercel.app`. Add your own domain under Settings → Domains, then set `SITE_URL` to it.

## Go live: accounts to connect

### 1. Supabase (sign-in + database) - free tier
1. Create a project at https://supabase.com.
2. **SQL Editor**: run `supabase/migrations/0001_profiles.sql`, then `supabase/migrations/0002_engines.sql`.
3. **Settings → API**: copy the Project URL → `VITE_SUPABASE_URL`, the `anon` key → `VITE_SUPABASE_ANON_KEY`, and the `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (secret: server only).
4. **Authentication → URL Configuration**: Site URL = your Vercel URL. Add `http://localhost:5173/**` and `https://YOUR-SITE/**` to Redirect URLs.
5. Before launch, connect your own email sender under **Authentication → Emails**. The built-in one is heavily rate-limited.

### 2. Your admin account (everything free)
The password is never stored in code; anything in a public site or GitHub repo can be read by anyone.
1. Supabase → **Authentication → Users → Add user → Create new user**. Email `adminpod@admin.com`, your password, and tick **Auto Confirm User**. Do this **before** you share the site, so nobody else can register that email first.
2. **SQL Editor**: run `supabase/make-admin.sql`.
3. Sign in on the site with that email and password. You get every engine free, no daily limits, and an **Admin** page to see users and give anyone free access.

`admin.com` is someone else's domain, so password-reset emails to it will never reach you. Keep the password somewhere safe, or use an email address you own instead (change it in `make-admin.sql` and create that user).

### 3. Google sign-in
1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create **OAuth client ID** (Web application).
2. Authorized redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → **Google**: enable and paste the client ID and secret.

### 4. AI (Content Engine, store advice, launch copy)
Create a key at https://console.anthropic.com → `ANTHROPIC_API_KEY`. It is billed per use (Claude Opus 5). Rough estimates: a content pack with photos is about 10–30 cents; a store analysis with AI advice is about 5–15 cents. Check real costs in the Anthropic console after a few runs. Daily caps per plan (in `api/_lib/content.ts` and `api/_lib/analyzer.ts`) keep costs predictable. Set a monthly spend limit in the Anthropic console too.

### 5. Mobile speed test (free)
Google Cloud → enable **PageSpeed Insights API** → Credentials → API key → `PAGESPEED_API_KEY`.

### 6. Stripe (payments)
1. Create products **Growth** and **Scale** with monthly prices; copy the price IDs → `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE`. Secret key → `STRIPE_SECRET_KEY`.
2. Settings → Billing → **Customer portal**: turn on plan switching and cancellation.
3. Developers → **Webhooks** → add endpoint `https://YOUR-SITE/api/stripe-webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Signing secret → `STRIPE_WEBHOOK_SECRET`.
4. Test with card `4242 4242 4242 4242`, any future date, any CVC. Stay in test mode until everything works.

Check everything from the **Admin** page: it shows which services are connected.

## How the security works

- **Plans** live in `profiles.plan`. Browsers can read their own row but never change it; only the Stripe webhook (or an admin) can.
- **Every engine checks the plan on the server**, not just in the browser. Database rules (row-level security) stop users reading each other's waitlists, analytics or deals, and stop creators marking their own work approved or setting their own sales.
- **The Store Analyzer** only fetches public websites. It refuses localhost, private networks and cloud metadata addresses.
- **Secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, Stripe keys) exist only on the server. Only `VITE_`-prefixed values reach the browser, and those are safe to expose.

## What's not built yet

- **Automated creator payouts.** The marketplace tracks commissions and the platform fee, but brands pay creators themselves. Real payouts need Stripe Connect, plus tax and KYC handling.
- **Automatic sales attribution.** Brands enter attributed sales, helped by each creator's referral code. Pulling orders straight from Shopify needs a Shopify app integration.
- **Waitlist emails.** Waitlists export to CSV for your email tool; Selamont doesn't send the launch emails itself.
- **Terms of Service and Privacy Policy.** You need these before taking payments.

## Project layout

```
api/index.ts            the single Vercel Function; routes every /api/* call
api/_lib/               content, analyzer, billing, admin, auth + plan checks
src/pages/engines/      the five engine screens
src/pages/PublicDrop    public launch page (/d/:slug)
src/pages/Admin         admin dashboard
supabase/migrations/    database tables + security rules (run in order)
supabase/make-admin.sql turns your account into an admin
```
