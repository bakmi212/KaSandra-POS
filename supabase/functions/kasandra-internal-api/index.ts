import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

// ============================================================
// INTERNAL API — Sprint 2.1: Project Registration
// ============================================================
// Architecture:
//   Client Application → HTTPS → License Server (this API) → License Database
//   The Client Application NEVER connects directly to the database.
//
// Endpoints:
//   POST /api/internal/register  — Client registers with Bearer token
//   GET  /api/internal/health    — Authenticated health check (Bearer required)
//   GET  /api/internal/version   — Authenticated version info (Bearer required)
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const API_VERSION = "v1";
const APPLICATION_VERSION = "1.0.0";
const SCHEMA_VERSION = "1.0.0";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return json({ success: false, code, message }, status);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return match[1].trim();
}

function generateProjectId(): string {
  return crypto.randomUUID();
}

function generateProjectCode(slug: string): string {
  const base = (slug || "PROJ").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${base}-${suffix}`;
}

// ============================================================
// Token validation — looks up token hash in project_registration
// Returns the registration record or null if invalid
// ============================================================
async function validateProjectToken(token: string) {
  if (!token || token.length < 8) return null;
  const tokenHash = hashToken(token);
  const { data } = await supabase
    .from("project_registration")
    .select("id, project_id, project_code, project_name, project_slug, status")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  return data;
}

// ============================================================
// POST /api/internal/register
// Body: { project_name, project_slug, platform, application_version }
// ============================================================
async function handleRegister(req: Request): Promise<Response> {
  const token = extractBearerToken(req);

  if (!token) {
    return errorResponse("MISSING_TOKEN", "Authorization header is required. Use Bearer <PROJECT_TOKEN>.", 401);
  }

  if (token.length < 8) {
    return errorResponse("INVALID_PROJECT_TOKEN", "Project Token is invalid.", 401);
  }

  let body: {
    project_name?: string;
    project_slug?: string;
    platform?: string;
    application_version?: string;
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Request body must be valid JSON.", 400);
  }

  if (!body.project_name || !body.project_slug) {
    return errorResponse("INVALID_REQUEST", "project_name and project_slug are required.", 400);
  }

  const tokenHash = hashToken(token);

  // Check if a registration already exists for this token
  const { data: existing } = await supabase
    .from("project_registration")
    .select("id, project_id, project_code")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (existing) {
    // Update existing registration with new project info
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("project_registration")
      .update({
        project_name: body.project_name,
        project_slug: body.project_slug,
        platform: body.platform || "web",
        connected_app_version: body.application_version || null,
        status: "registered",
        connected_at: now,
        last_health_check: now,
      })
      .eq("id", existing.id);

    if (updateError) {
      return errorResponse("DATABASE_ERROR", "Unable to save registration.", 500);
    }

    return json({
      success: true,
      status: "registered",
      project_id: existing.project_id,
      project_code: existing.project_code,
      api_version: API_VERSION,
      application_version: APPLICATION_VERSION,
    });
  }

  // Create new registration
  const projectId = generateProjectId();
  const projectCode = generateProjectCode(body.project_slug);
  const now = new Date().toISOString();

  const { error: insertError } = await supabase
    .from("project_registration")
    .insert({
      project_id: projectId,
      project_name: body.project_name,
      project_code: projectCode,
      project_slug: body.project_slug,
      platform: body.platform || "web",
      token_hash: tokenHash,
      status: "registered",
      connected_app_name: body.project_name,
      connected_app_version: body.application_version || null,
      connected_platform: body.platform || "web",
      connected_at: now,
      last_health_check: now,
    });

  if (insertError) {
    if (insertError.code === "23505") {
      return errorResponse("PROJECT_ALREADY_REGISTERED", "Project already registered.", 409);
    }
    return errorResponse("DATABASE_ERROR", "Unable to save registration.", 500);
  }

  return json({
    success: true,
    status: "registered",
    project_id: projectId,
    project_code: projectCode,
    api_version: API_VERSION,
    application_version: APPLICATION_VERSION,
  });
}

// ============================================================
// GET /api/internal/health
// Bearer token required — validates the client's token.
// Updates last_health_check timestamp on success.
// ============================================================
async function handleHealth(req: Request): Promise<Response> {
  const token = extractBearerToken(req);

  if (!token) {
    return errorResponse("MISSING_TOKEN", "Authorization header is required. Use Bearer <PROJECT_TOKEN>.", 401);
  }

  const registration = await validateProjectToken(token);

  if (!registration) {
    return errorResponse("INVALID_PROJECT_TOKEN", "Project Token is invalid.", 401);
  }

  const now = new Date().toISOString();
  await supabase
    .from("project_registration")
    .update({ last_health_check: now })
    .eq("id", registration.id);

  return json({
    success: true,
    status: "online",
    api_version: API_VERSION,
    application_version: APPLICATION_VERSION,
  });
}

// ============================================================
// GET /api/internal/version
// Bearer token required.
// ============================================================
async function handleVersion(req: Request): Promise<Response> {
  const token = extractBearerToken(req);

  if (!token) {
    return errorResponse("MISSING_TOKEN", "Authorization header is required. Use Bearer <PROJECT_TOKEN>.", 401);
  }

  const registration = await validateProjectToken(token);

  if (!registration) {
    return errorResponse("INVALID_PROJECT_TOKEN", "Project Token is invalid.", 401);
  }

  return json({
    success: true,
    application_version: APPLICATION_VERSION,
    api_version: API_VERSION,
    schema_version: SCHEMA_VERSION,
  });
}

// ============================================================
// MAIN SERVER
// ============================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace("/kasandra-internal-api", "").replace(/^\/+/, "");
    const segments = path.split("/").filter(Boolean);

    if (segments[0] !== "api" || segments[1] !== "internal") {
      return errorResponse("NOT_FOUND", "Endpoint not found. Use /api/internal/{endpoint}.", 404);
    }

    const endpoint = segments[2];

    if (endpoint === "register" && req.method === "POST") {
      return await handleRegister(req);
    }

    if (endpoint === "health" && req.method === "GET") {
      return await handleHealth(req);
    }

    if (endpoint === "version" && req.method === "GET") {
      return await handleVersion(req);
    }

    return errorResponse("NOT_FOUND", `Unknown endpoint: /api/internal/${endpoint || "undefined"}`, 404);
  } catch (err) {
    return errorResponse("INTERNAL_ERROR", err.message || "Internal server error.", 500);
  }
});
