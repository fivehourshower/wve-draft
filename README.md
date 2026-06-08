# NQ Tournament Drafter

A serverless civilization drafter for team play (1v1 – 4v4).

## Run / deploy
Pure static site — no build step, no server. Just host the three files together:

- `index.html` — the app
- `app.jsx` — UI + draft logic (transpiled in-browser by Babel)
- `civdata.js` — merged civ list (name, tier, rating, icon URL)

Drop the folder onto any static host (GitLab Pages, GitHub Pages, Netlify, Cloudflare Pages, S3) or open `index.html` over a local web server. Civ icons and fonts load from the web, so the page needs internet access.

## Features
- **Draft method:** by rating (default) or by tier.
- **Players per team:** 1–4 · **picks per player:** configurable (default 2).
- **Mirrored teams** (default): both sides draw identical civs lane-for-lane. Toggle to **Independent** for unique picks per player.
- Settings persist in `localStorage` (the tier choice is randomised each session).
- **Share link:** the whole draft is encoded into the URL hash — opening it shows a read-only result. Fully client-side.

## Editing the civ pool
Edit `civdata.js` (a `window.CIVS` array). Each entry: `{ id, name, tier, rating, norm, img }`.
`id` must stay a stable index — shared links reference civs by `id`.
