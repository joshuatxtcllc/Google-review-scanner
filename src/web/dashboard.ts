import type { TrackedBusiness, ReviewScan } from "../types.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function starRow(rating: number | null): string {
  if (rating === null) return "—";
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full) + ` (${rating.toFixed(1)})`;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function renderDashboard(
  items: { business: TrackedBusiness; scan: ReviewScan | null }[]
): string {
  const cards = items
    .map(({ business, scan }) => {
      const reviews = scan?.reviews ?? [];
      const reviewsHtml = reviews.length
        ? reviews
            .map(
              (r) => `
        <div class="review">
          <div class="review-head">
            <span class="author">${escapeHtml(r.author_name)}</span>
            <span class="stars">${starRow(r.rating)}</span>
            <span class="rel-time">${escapeHtml(r.relative_time_description)}</span>
          </div>
          <p class="review-text">${escapeHtml(r.text || "")}</p>
        </div>`
            )
            .join("")
        : `<p class="muted">No reviews pulled yet.</p>`;

      return `
      <section class="card" id="card-${escapeHtml(business.label)}">
        <header>
          <h2>${escapeHtml(business.label)}</h2>
          <button class="scan-btn" data-label="${escapeHtml(business.label)}">Scan now</button>
        </header>
        <p class="query">${escapeHtml(business.search_query)}</p>
        <div class="stats">
          <div>
            <span class="stat-value">${scan ? starRow(scan.rating) : "—"}</span>
            <span class="stat-label">Rating</span>
          </div>
          <div>
            <span class="stat-value">${scan?.user_ratings_total ?? "—"}</span>
            <span class="stat-label">Total reviews</span>
          </div>
          <div>
            <span class="stat-value">${scan ? timeAgo(scan.scanned_at) : "never"}</span>
            <span class="stat-label">Last scanned</span>
          </div>
        </div>
        <div class="reviews">${reviewsHtml}</div>
        <div class="scan-status" id="status-${escapeHtml(business.label)}"></div>
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Google Review Scanner</title>
<style>
  :root {
    --bg: #0f1115;
    --card: #171a21;
    --border: #2a2e38;
    --text: #e8e9ec;
    --muted: #8b8f9a;
    --accent: #4f8cff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 24px 16px 64px;
  }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .subtitle { color: var(--muted); margin: 0 0 24px; font-size: 0.9rem; }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    max-width: 720px;
    margin: 0 auto 20px;
  }
  .card header { display: flex; justify-content: space-between; align-items: center; }
  .card h2 { margin: 0; font-size: 1.1rem; text-transform: capitalize; }
  .query { color: var(--muted); font-size: 0.85rem; margin: 4px 0 16px; }
  .scan-btn {
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .scan-btn:disabled { opacity: 0.6; cursor: default; }
  .stats {
    display: flex;
    gap: 24px;
    padding: 12px 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    margin-bottom: 16px;
  }
  .stat-value { display: block; font-size: 1.1rem; font-weight: 600; }
  .stat-label { display: block; font-size: 0.75rem; color: var(--muted); }
  .review { padding: 10px 0; border-bottom: 1px solid var(--border); }
  .review:last-child { border-bottom: none; }
  .review-head { display: flex; gap: 10px; font-size: 0.8rem; color: var(--muted); flex-wrap: wrap; }
  .author { color: var(--text); font-weight: 600; }
  .review-text { margin: 6px 0 0; font-size: 0.9rem; line-height: 1.4; }
  .muted { color: var(--muted); font-size: 0.85rem; }
  .scan-status { font-size: 0.8rem; color: var(--muted); margin-top: 8px; min-height: 1em; }
</style>
</head>
<body>
  <h1>Google Review Scanner</h1>
  <p class="subtitle">Live rating &amp; review tracking, backed by Google Places</p>
  ${cards || `<p class="muted" style="text-align:center">No businesses tracked yet.</p>`}
  <script>
    document.querySelectorAll(".scan-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const label = btn.dataset.label;
        const status = document.getElementById("status-" + label);
        btn.disabled = true;
        status.textContent = "Scanning…";
        try {
          const token = window.prompt("Enter the scanner auth token to run a scan:");
          if (!token) { btn.disabled = false; status.textContent = ""; return; }
          const res = await fetch("/api/scan/" + encodeURIComponent(label), {
            method: "POST",
            headers: { Authorization: "Bearer " + token },
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Scan failed");
          status.textContent = "Scanned just now — reloading…";
          setTimeout(() => window.location.reload(), 800);
        } catch (err) {
          status.textContent = "Error: " + err.message;
          btn.disabled = false;
        }
      });
    });
  </script>
</body>
</html>`;
}
