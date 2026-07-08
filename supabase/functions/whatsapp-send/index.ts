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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { phone, message, type } = await req.json();

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: "Missing phone or message" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("integration_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const apiKey = settings?.whatsapp_api_key || Deno.env.get("WHATSAPP_API_KEY");
    const phoneId = settings?.whatsapp_phone_id || Deno.env.get("WHATSAPP_PHONE_ID");

    if (!apiKey || !phoneId) {
      return new Response(JSON.stringify({ error: "WhatsApp not configured. Set WHATSAPP_API_KEY and WHATSAPP_PHONE_ID in settings." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const formattedPhone = cleanPhone.startsWith("0") ? "62" + cleanPhone.slice(1) : cleanPhone;

    const payload: any = {
      messaging_product: "whatsapp",
      to: formattedPhone,
      type: "text",
      text: { body: message },
    };

    if (type === "document" && req.json.__pdfBase64) {
      const body = await req.json();
      payload.type = "document";
      payload.document = {
        filename: body.filename || "receipt.pdf",
        caption: message,
      };
    }

    const resp = await fetch(
      `https://graph.facebook.com/v18.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const result = await resp.json();

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: result.error?.message || "WhatsApp API error", details: result }), {
        status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, message_id: result.messages?.[0]?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
