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
    const { to, subject, body, pdfBase64, filename } = await req.json();

    if (!to || !subject) {
      return new Response(JSON.stringify({ error: "Missing to or subject" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Support comma-separated recipients
    const toList = String(to).split(',').map((e: string) => e.trim()).filter(Boolean);

    const { data: settings } = await supabase
      .from("integration_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const smtpHost = settings?.email_smtp_host || Deno.env.get("EMAIL_SMTP_HOST");
    const smtpUser = settings?.email_smtp_user || Deno.env.get("EMAIL_SMTP_USER");
    const smtpPass = settings?.email_smtp_pass || Deno.env.get("EMAIL_SMTP_PASS");
    const fromEmail = settings?.email_from || Deno.env.get("EMAIL_FROM") || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass) {
      return new Response(JSON.stringify({ error: "Email not configured. Set SMTP settings in integration settings." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const boundary = "----=_Boundary_" + crypto.randomUUID();
    const hasAttachment = !!pdfBase64;

    let emailBody = `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\n${body || ""}\r\n`;

    if (hasAttachment) {
      emailBody += `--${boundary}\r\nContent-Type: application/pdf; name="${filename || "document.pdf"}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${filename || "document.pdf"}"\r\n\r\n${pdfBase64}\r\n`;
    }
    emailBody += `--${boundary}--\r\n`;

    const rawEmail = `From: ${fromEmail}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n${emailBody}`;

    const authHeader = "Basic " + btoa(smtpUser + ":" + smtpPass);
    const resp = await fetch(`https://${smtpHost}/v2/smtp/email`, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: fromEmail },
        to: toList.map((e: string) => ({ email: e })),
        subject,
        text: body || "",
        attachments: hasAttachment ? [{ content: pdfBase64, filename: filename || "document.pdf", type: "application/pdf" }] : undefined,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: "Email send failed", details: errText }), {
        status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
