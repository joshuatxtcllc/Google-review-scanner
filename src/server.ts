import express, { Request, Response, NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { registerReviewTools } from "./tools/reviewTools.js";
import {
  listTrackedBusinesses,
  getLatestScan,
} from "./services/supabase.js";
import { runScanForLabel, BusinessNotFoundError, PlaceNotResolvedError } from "./services/scanner.js";
import { renderDashboard } from "./web/dashboard.js";

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "google-review-scanner-mcp-server",
    version: "1.0.0",
  });
  registerReviewTools(server);
  return server;
}

function requireBearerToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || token !== config.mcpAuthToken) {
    res.status(401).json({ error: "Unauthorized: missing or invalid bearer token" });
    return;
  }
  next();
}

export function createApp() {
  const app = express();
  app.use(express.json());

  // --- MCP endpoint (bearer-token protected) -----------------------------
  app.post("/mcp", requireBearerToken, async (req: Request, res: Response) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // --- Health check --------------------------------------------------------
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // --- JSON API: trigger a scan (bearer-token protected) ------------------
  app.post("/api/scan/:label", requireBearerToken, async (req: Request, res: Response) => {
    const label = req.params.label;
    try {
      const { business, scan } = await runScanForLabel(label);
      res.json({
        label: business.label,
        place_id: business.place_id,
        scanned_at: scan.scanned_at,
        rating: scan.rating,
        user_ratings_total: scan.user_ratings_total,
        reviews: scan.reviews,
      });
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        res.status(404).json({ error: error.message });
      } else if (error instanceof PlaceNotResolvedError) {
        res.status(422).json({ error: error.message });
      } else {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  });

  // --- Web dashboard (read-only, no secrets rendered) ----------------------
  app.get("/", async (_req: Request, res: Response) => {
    try {
      const businesses = await listTrackedBusinesses();
      const businessesWithScans = await Promise.all(
        businesses.map(async (b) => ({
          business: b,
          scan: await getLatestScan(b.id),
        }))
      );
      res.set("Content-Type", "text/html").send(renderDashboard(businessesWithScans));
    } catch (error) {
      res
        .status(500)
        .set("Content-Type", "text/html")
        .send(`<pre>Error loading dashboard: ${error instanceof Error ? error.message : String(error)}</pre>`);
    }
  });

  return app;
}
