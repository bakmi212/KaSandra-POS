import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function deliverWebhook(webhook: any, event: string, payload: any) {
  const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
  const deliveryId = crypto.randomUUID();

  try {
    const resp = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": event,
        "X-Webhook-Signature": await hmacSha256(webhook.secret || "", body),
      },
      body,
    });

    await supabase.from("webhook_deliveries").insert({
      id: deliveryId,
      webhook_id: webhook.id,
      event,
      payload: JSON.parse(body),
      status: resp.ok ? "delivered" : "failed",
      response_code: resp.status,
      attempts: 1,
      delivered_at: new Date().toISOString(),
    });

    return { ok: resp.ok, status: resp.status };
  } catch (err) {
    await supabase.from("webhook_deliveries").insert({
      id: deliveryId,
      webhook_id: webhook.id,
      event,
      payload: JSON.parse(body),
      status: "failed",
      attempts: 1,
      error: err.message,
    });
    return { ok: false, error: err.message };
  }
}

async function hmacSha256(secret: string, payload: string): Promise<string> {
  if (!secret) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { event, data } = await req.json();

    if (!event || !data) {
      return new Response(JSON.stringify({ error: "Missing event or data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: webhooks } = await supabase
      .from("webhooks")
      .select("*")
      .eq("is_active", true)
      .contains("events", [event]);

    if (!webhooks || webhooks.length === 0) {
      return new Response(JSON.stringify({ delivered: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = await Promise.all(
      webhooks.map((w) => deliverWebhook(w, event, data)),
    );

    const delivered = results.filter((r) => r.ok).length;

    return new Response(JSON.stringify({ delivered, total: results.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
