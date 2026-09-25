# Google Review Scanner

Tracks a business's Google rating, review count, and recent reviews over time.

- **Web dashboard** (`/`) — current rating, review count, recent reviews, and a manual "scan now" button per tracked business.
- **REST API** — `POST /api/scan/:label` to trigger a scan (requires `Authorization: Bearer <MCP_AUTH_TOKEN>`).
- **MCP server** — `POST /mcp` (same bearer auth) exposes the scanner as tools Claude can call directly via a Custom Connector.

No mock data: every scan is a real call to the Google Places API, and results are persisted to Supabase.

## Tools exposed over MCP

| Tool | What it does |
|---|---|
| `review_scanner_list_businesses` | List every tracked business |
| `review_scanner_add_business` | Start tracking a new business by name/address |
| `review_scanner_run_scan` | Pull fresh rating/reviews from Google right now |
| `review_scanner_get_latest` | Read the last stored scan (no API call) |
| `review_scanner_get_history` | Rating/review-count trend over time |

## Environment variables

Set these in Railway under this service's **Variables** tab (see `.env.example` for the full list):

- `GOOGLE_PLACES_API_KEY` — from Google Cloud Console, with the Places API enabled
- `SUPABASE_URL` / `SUPABASE_KEY` — from the Supabase project's Settings → API
- `MCP_AUTH_TOKEN` — a random secret; required as a Bearer token on `/mcp` and `/api/scan/*`

## Local development

```bash
npm install
cp .env.example .env   # then fill in real values
npm run dev
```

## Deploying

This repo deploys on Railway from GitHub. Build command: `npm run build`. Start command: `npm start` (or via the included `Procfile`).

## Connecting as a Claude Custom Connector

1. Deploy this service on Railway and note its public URL, e.g. `https://google-review-scanner-production.up.railway.app`.
2. In Claude, go to **Settings → Connectors → Add Custom Connector**.
3. Set the MCP server URL to `https://<your-railway-domain>/mcp`.
4. When prompted for auth, use a Bearer token and paste the value of `MCP_AUTH_TOKEN`.
