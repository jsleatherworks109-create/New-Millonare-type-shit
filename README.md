# Selamont (brand edition)

Your private brand toolkit, running free on your own PC. No accounts, no login, no subscriptions.

| Tool | What it does |
|---|---|
| **Content Engine** | Product photos + details in → hooks, captions, product description, ad concepts, content ideas, 7-day launch plan |
| **Store Analyzer** | Scans any store page (21 conversion, trust, mobile and SEO checks) in seconds, then optional AI fixes |
| **Drops & Launches** | Launch pages with countdown + waitlist, CSV export, AI-written announcements |
| **Creators** | Track creators, campaigns, shipped products, content links, sales, commission owed and payments |
| **Launch Analytics** | Views, unique visitors, sign-up rate, store clicks and daily charts per drop |

## Start it

Double-click **`Start Selamont.bat`**. Your browser opens at http://localhost:5173. Keep the black window open while you use it.

(Or in a terminal: `npm install` once, then `npm start`.)

**The AI needs the Ollama app running** (it starts with Windows on this PC). The dot at the bottom of the sidebar shows whether AI is ready.

## How fast is the free AI?

It runs on this PC's processor, so it's slower than paid AI, but it costs nothing. Measured on this machine:

- Hooks, captions or product description: about **1–2 minutes each** (only tick the sections you need)
- Reading a product photo: about **3 minutes per photo**
- Store Analyzer AI advice: about **4 minutes** (the scan itself takes seconds)
- Drop announcements: about **2–4 minutes**

The AI unloads itself two minutes after each job to give your RAM back.

Want it faster and better? Add a Claude API key to `.env` (see `.env.example`). It's paid per use (a few cents per job); nothing else changes.

## Share launch pages with shoppers (free)

Your tools stay on your PC, but shoppers need to reach your launch pages:

1. Double-click **`Share launch pages.bat`**.
2. It prints a free public link like `https://something.trycloudflare.com`. Your drops show that link automatically; copy it from the drop's page.
3. **Keep that window open (and the PC on) during the launch.**

Only `/d/your-drop` pages and the waitlist form are shared, never your tools, data or drafts. The free link **changes each time you restart sharing**, so start it before you post the link and leave it running. For a permanent link, buy a domain (about $10/year) and set up a named Cloudflare Tunnel.

## Your business partner

- **Same Wi-Fi:** run `npm run dev:lan`. The terminal shows a network address (like `http://192.168.1.20:5173`) your partner can open. There's no login, so anyone on your Wi-Fi could open it. Set `APP_PASSCODE` in `.env` to require a passcode.
- **Different location:** the simplest free option is for them to run their own copy from GitHub. Your data (drops, creators) lives in your copy only.

## Your data

Everything is saved in one file: `C:\Users\<you>\.selamont\selamont.db`. **Back it up by copying that file** (e.g. to OneDrive). It isn't in the project folder, so it's never uploaded to GitHub.

## Going commercial later

The full multi-user version (Google sign-in, Stripe paywall, admin, hosted on Vercel) is saved on the **`saas`** branch on GitHub:

```bash
git checkout saas
```

## Project layout

```
Start Selamont.bat         double-click to start
Share launch pages.bat     double-click to share launch pages publicly
api/_lib/                  server: AI (ai.ts), analyzer, content, data (SQLite), routes
scripts/public-server.mjs  the launch-page-only public server + free Cloudflare link
src/pages/engines/         the five tool screens
src/pages/PublicDrop.tsx   the launch page shoppers see
```
