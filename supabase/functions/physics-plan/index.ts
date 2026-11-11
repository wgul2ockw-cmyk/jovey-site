const allowedOrigins = new Set(["https://jovey.co", "https://www.jovey.co"]);
const corsHeaders = {
  "Access-Control-Allow-Headers": "apikey, content-type, x-save-code",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function reply(body: Record<string, unknown>, status = 200, origin?: string | null) {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}

function validPayload(value: unknown): value is {
  collections: Record<string, Record<string, { note?: unknown }>>;
  plans: Record<string, unknown>;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (!data.collections || typeof data.collections !== "object" || Array.isArray(data.collections)) return false;
  if (!data.plans || typeof data.plans !== "object" || Array.isArray(data.plans)) return false;
  const collections = data.collections as Record<string, unknown>;
  if (!["disruptive", "labs", "ap"].every((key) =>
    collections[key] && typeof collections[key] === "object" && !Array.isArray(collections[key]))) return false;
  if (Object.keys(data.plans as object).length > 300) return false;
  for (const key of ["disruptive", "labs", "ap"]) {
    const items = collections[key] as Record<string, unknown>;
    if (Object.keys(items).length > 300) return false;
    for (const item of Object.values(items)) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const note = (item as Record<string, unknown>).note;
      if (note !== undefined && (typeof note !== "string" || note.length > 5000)) return false;
    }
  }
  return true;
}

async function hashCode(code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return reply({ ok: false, error: "Origin not allowed." }, 403);
  if (request.method === "OPTIONS") {
    const headers = new Headers(corsHeaders);
    if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405, origin);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 300_000) return reply({ ok: false, error: "Plan is too large." }, 413, origin);

  const code = (request.headers.get("x-save-code") || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(code)) return reply({ ok: false, error: "Invalid save code." }, 400, origin);
  let requestData: { action?: unknown; payload?: unknown };
  try {
    requestData = await request.json();
  } catch {
    return reply({ ok: false, error: "Invalid request." }, 400, origin);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply({ ok: false, error: "Server storage is not configured." }, 503, origin);
  const keyHash = await hashCode(code);
  const endpoint = `${url}/rest/v1/physics_explorer_guest_saves`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  if (requestData.action === "load") {
    const response = await fetch(`${endpoint}?key_hash=eq.${keyHash}&select=payload,updated_at&limit=1`, { headers });
    if (!response.ok) return reply({ ok: false, error: "Could not load the saved plan." }, 502, origin);
    const rows = await response.json();
    const row = rows[0];
    return reply({ ok: true, found: Boolean(row), payload: row?.payload || null, updatedAt: row?.updated_at || null }, 200, origin);
  }

  if (requestData.action === "save") {
    if (!validPayload(requestData.payload)) return reply({ ok: false, error: "The plan format is invalid." }, 400, origin);
    const serialized = JSON.stringify(requestData.payload);
    if (serialized.length > 250_000) return reply({ ok: false, error: "Plan is too large." }, 413, origin);
    const response = await fetch(`${endpoint}?on_conflict=key_hash`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key_hash: keyHash, payload: requestData.payload, updated_at: new Date().toISOString() }),
    });
    if (!response.ok) return reply({ ok: false, error: "Could not save the plan." }, 502, origin);
    return reply({ ok: true }, 200, origin);
  }

  return reply({ ok: false, error: "Unknown action." }, 400, origin);
});
