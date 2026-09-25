/**
 * Central config loader. Fails loudly at startup if required env vars are
 * missing, rather than failing confusingly deep inside a request handler.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in Railway under this service's Variables tab.`
    );
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  googlePlacesApiKey: requireEnv("GOOGLE_PLACES_API_KEY"),
  supabaseUrl: requireEnv("SUPABASE_URL"),
  supabaseKey: requireEnv("SUPABASE_KEY"),
  // Bearer token required on the /mcp endpoint and the JSON scan API.
  // The web dashboard itself stays open (read-only, no secrets rendered).
  mcpAuthToken: requireEnv("MCP_AUTH_TOKEN"),
};
