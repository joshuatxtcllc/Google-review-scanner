#!/usr/bin/env node
/**
 * Google Review Scanner
 *
 * - Web dashboard at "/" showing tracked businesses' current Google rating,
 *   review count, and recent reviews, with a manual "scan now" button.
 * - REST endpoint POST /api/scan/:label to trigger a scan (bearer-token auth).
 * - MCP server at POST /mcp (bearer-token auth) exposing the same scan
 *   operations as tools, for Claude to call directly via a Custom Connector.
 */

import { config } from "./config.js";
import { createApp } from "./server.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`Google Review Scanner listening on port ${config.port}`);
  console.log(`  Dashboard: http://localhost:${config.port}/`);
  console.log(`  MCP endpoint: http://localhost:${config.port}/mcp (Bearer token required)`);
});
