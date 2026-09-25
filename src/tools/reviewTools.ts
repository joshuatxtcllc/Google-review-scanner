import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  runScanForLabel,
  getLatestScanForLabel,
  getScanHistoryForLabel,
  BusinessNotFoundError,
  PlaceNotResolvedError,
} from "../services/scanner.js";
import { listTrackedBusinesses, upsertTrackedBusiness } from "../services/supabase.js";
import { handlePlacesApiError } from "../services/googlePlaces.js";

function friendlyError(error: unknown): string {
  if (error instanceof BusinessNotFoundError || error instanceof PlaceNotResolvedError) {
    return `Error: ${error.message}`;
  }
  if (error instanceof Error && error.message.includes("Google Places")) {
    return `Error: ${error.message}`;
  }
  return handlePlacesApiError(error);
}

const CHARACTER_LIMIT = 20000;

function truncateIfNeeded(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.slice(0, CHARACTER_LIMIT) +
    `\n\n[Truncated — response exceeded ${CHARACTER_LIMIT} characters]`
  );
}

export function registerReviewTools(server: McpServer): void {
  // --- list_tracked_businesses ---------------------------------------
  server.registerTool(
    "review_scanner_list_businesses",
    {
      title: "List Tracked Businesses",
      description: `Lists every business currently tracked by the Google review scanner.

Returns each business's label (used as the identifier in other tools), its Google search query, its resolved Google Place ID (if a scan has run at least once), and when it was added.

Args: none

Returns JSON:
{
  "businesses": [
    { "label": string, "search_query": string, "place_id": string | null, "created_at": string }
  ]
}

Use when: "what businesses are being tracked", "list review scanner targets".`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const businesses = await listTrackedBusinesses();
        const output = {
          businesses: businesses.map((b) => ({
            label: b.label,
            search_query: b.search_query,
            place_id: b.place_id,
            created_at: b.created_at,
          })),
        };
        return {
          content: [{ type: "text", text: truncateIfNeeded(JSON.stringify(output, null, 2)) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: friendlyError(error) }], isError: true };
      }
    }
  );

  // --- add_tracked_business --------------------------------------------
  server.registerTool(
    "review_scanner_add_business",
    {
      title: "Add a Business to Track",
      description: `Adds a new business for the review scanner to track, or updates the search query for an existing one (matched by label).

This does NOT run a scan immediately — call review_scanner_run_scan afterward to pull the first data.

Args:
  - label (string): Short unique identifier for this business, e.g. "jays_frames". Used to reference it in every other tool.
  - search_query (string): Free-text name + address Google should resolve to a Place ID, e.g. "Jay's Frames, 218 W 27th St, Houston, TX 77008".

Returns JSON: { "label": string, "search_query": string, "place_id": string | null }

Use when: "start tracking reviews for [business]", "add a competitor to the scanner".`,
      inputSchema: {
        label: z
          .string()
          .min(1)
          .max(100)
          .describe("Short unique identifier, e.g. 'jays_frames'"),
        search_query: z
          .string()
          .min(3)
          .max(300)
          .describe("Business name + address for Google to resolve, e.g. 'Jay's Frames, 218 W 27th St, Houston, TX 77008'"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ label, search_query }: { label: string; search_query: string }) => {
      try {
        const business = await upsertTrackedBusiness({ label, search_query });
        const output = {
          label: business.label,
          search_query: business.search_query,
          place_id: business.place_id,
        };
        return {
          content: [
            {
              type: "text",
              text: `Tracking '${label}'. Run review_scanner_run_scan with this label to pull the first scan.`,
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: friendlyError(error) }], isError: true };
      }
    }
  );

  // --- run_scan ---------------------------------------------------------
  server.registerTool(
    "review_scanner_run_scan",
    {
      title: "Run a Review Scan",
      description: `Runs a fresh scan against Google Places for a tracked business: pulls its current star rating, total review count, and up to 5 recent review excerpts, then stores the result as a new dated record.

The first time this runs for a business, it also resolves and saves the business's Google Place ID from its search query.

Args:
  - label (string): The business's tracked label (see review_scanner_list_businesses). Defaults to "jays_frames".

Returns JSON:
{
  "label": string,
  "place_id": string,
  "scanned_at": string (ISO timestamp),
  "rating": number | null,
  "user_ratings_total": number | null,
  "reviews": [ { "author_name": string, "rating": number, "text": string, "relative_time_description": string, "time": number } ]
}

Error Handling:
  - Returns an error if the label isn't tracked yet (add it first with review_scanner_add_business)
  - Returns an error if Google can't resolve the business from its search query

Use when: "scan Jay's Frames reviews now", "check our current Google rating", "pull fresh review data".`,
      inputSchema: {
        label: z
          .string()
          .min(1)
          .max(100)
          .default("jays_frames")
          .describe("Tracked business label to scan"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ label }: { label: string }) => {
      try {
        const { business, scan } = await runScanForLabel(label);
        const output = {
          label: business.label,
          place_id: business.place_id,
          scanned_at: scan.scanned_at,
          rating: scan.rating,
          user_ratings_total: scan.user_ratings_total,
          reviews: scan.reviews,
        };
        const lines = [
          `# Review Scan: ${business.label}`,
          "",
          `Rating: ${scan.rating ?? "n/a"} (${scan.user_ratings_total ?? 0} total reviews)`,
          `Scanned at: ${scan.scanned_at}`,
          "",
          "## Recent reviews",
        ];
        for (const r of scan.reviews) {
          lines.push(`- **${r.author_name}** (${r.rating}/5, ${r.relative_time_description}): ${r.text}`);
        }
        return {
          content: [{ type: "text", text: truncateIfNeeded(lines.join("\n")) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: friendlyError(error) }], isError: true };
      }
    }
  );

  // --- get_latest_scan ----------------------------------------------------
  server.registerTool(
    "review_scanner_get_latest",
    {
      title: "Get Latest Scan Result",
      description: `Returns the most recently stored scan for a tracked business, WITHOUT calling the Google Places API again. Use this to read the last-known rating/reviews cheaply; use review_scanner_run_scan when you need fresh data right now.

Args:
  - label (string): The business's tracked label. Defaults to "jays_frames".

Returns JSON: { "label": string, "scanned_at": string | null, "rating": number | null, "user_ratings_total": number | null, "reviews": array }
Returns a message (no error) if no scan has ever been run for this business.

Use when: "what's our current Google rating", "show the last review scan without re-scanning".`,
      inputSchema: {
        label: z.string().min(1).max(100).default("jays_frames"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ label }: { label: string }) => {
      try {
        const { business, scan } = await getLatestScanForLabel(label);
        if (!scan) {
          return {
            content: [
              {
                type: "text",
                text: `No scans yet for '${label}'. Run review_scanner_run_scan to get the first one.`,
              },
            ],
          };
        }
        const output = {
          label: business.label,
          scanned_at: scan.scanned_at,
          rating: scan.rating,
          user_ratings_total: scan.user_ratings_total,
          reviews: scan.reviews,
        };
        return {
          content: [{ type: "text", text: truncateIfNeeded(JSON.stringify(output, null, 2)) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: friendlyError(error) }], isError: true };
      }
    }
  );

  // --- get_scan_history -----------------------------------------------
  server.registerTool(
    "review_scanner_get_history",
    {
      title: "Get Scan History",
      description: `Returns a time series of past scans for a tracked business — rating and review count over time — so trends can be spotted (e.g. rating dropping, review velocity slowing).

Args:
  - label (string): The business's tracked label. Defaults to "jays_frames".
  - limit (number): Maximum number of past scans to return, most recent first. Between 1-100 (default: 30).

Returns JSON:
{
  "label": string,
  "count": number,
  "scans": [ { "scanned_at": string, "rating": number | null, "user_ratings_total": number | null } ]
}

Use when: "has our rating changed over time", "show review count trend", "did the rating drop recently".`,
      inputSchema: {
        label: z.string().min(1).max(100).default("jays_frames"),
        limit: z.number().int().min(1).max(100).default(30),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ label, limit }: { label: string; limit: number }) => {
      try {
        const { business, scans } = await getScanHistoryForLabel(label, limit);
        const output = {
          label: business.label,
          count: scans.length,
          scans: scans.map((s) => ({
            scanned_at: s.scanned_at,
            rating: s.rating,
            user_ratings_total: s.user_ratings_total,
          })),
        };
        return {
          content: [{ type: "text", text: truncateIfNeeded(JSON.stringify(output, null, 2)) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: friendlyError(error) }], isError: true };
      }
    }
  );
}
