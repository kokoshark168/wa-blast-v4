# RF Guild Hub — Boss Tracker

Guild management dashboard for RF Online-style guilds: boss-kill matrix, member points, screenshot-based kill logging, and Excel import/export. Fully client-side (React + Vite + Tailwind), data lives in the browser's localStorage — no server or database needed.

## Features

- **Boss Tracker grid** — members × bosses kill matrix per date, grouped by boss group with color coding, per-boss/per-member totals, multi-select bulk fill/clear, group show/hide chips, boss & member search, date navigation with week label
- **Kill All** — record many bosses for many members in one save
- **Record from party screenshot** — upload/paste the party screenshot, OCR reads player names in the browser (tesseract.js), fuzzy-matches them to the roster, pick the bosses, save everyone at once (manual name entry as fallback)
- **Import / Export** — CSV & XLSX export of the day's matrix, XLSX import (same shape; unknown members are auto-created)
- **Member detail** — total points, boss kills, missed bosses, daily check-ins, guild activities, with full history tabs
- **Members** — bulk add, notes, check-in toggle, guild activity (event) recording with points
- **Insights** — contribution leaderboard
- **Settings** — points config, boss & group editor, JSON backup export/import, reset

## Run locally

```bash
cd guild-hub
npm install
npm run dev
```

## Deploy to Vercel

1. Push this repo to GitHub (already done if you're reading this on GitHub).
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import this repository.
3. Set **Root Directory** to `guild-hub` (Framework Preset: Vite is auto-detected).
4. Deploy. No environment variables needed.

## Notes

- Data is stored per-browser in localStorage. Use **Settings → Export backup** to move data between devices, or as a regular backup.
- OCR ("Read names from image") downloads its language model in the visitor's browser on first use; results depend on screenshot quality — the manual name box covers misreads.
