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
    const { action } = await req.json();

    const { data: settings } = await supabase
      .from("integration_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const driveToken = settings?.google_drive_token || Deno.env.get("GOOGLE_DRIVE_TOKEN");
    const folderId = settings?.google_drive_folder_id || Deno.env.get("GOOGLE_DRIVE_FOLDER_ID");

    if (!driveToken) {
      return new Response(JSON.stringify({ error: "Google Drive not configured. Set GOOGLE_DRIVE_TOKEN in settings." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "backup") {
      const tables = ["products", "categories", "customers", "suppliers", "sales", "sale_items", "payments", "purchases", "purchase_items", "stock_movements", "branches", "finance_transactions"];
      const backup: Record<string, any> = { _timestamp: new Date().toISOString(), _version: "1.0" };

      for (const t of tables) {
        const { data, error } = await supabase.from(t).select("*");
        if (!error && data) backup[t] = data;
      }

      const jsonStr = JSON.stringify(backup, null, 2);
      const filename = `kasandra-backup-${new Date().toISOString().slice(0, 10)}.json`;

      const metadata = {
        name: filename,
        parents: folderId ? [folderId] : undefined,
      };

      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      form.append("file", new Blob([jsonStr], { type: "application/json" }));

      const resp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: { "Authorization": `Bearer ${driveToken}` },
        body: form,
      });

      const result = await resp.json();
      if (!resp.ok) {
        return new Response(JSON.stringify({ error: "Drive upload failed", details: result }), {
          status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, file_id: result.id, filename }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "restore") {
      const { fileId } = await req.json();
      if (!fileId) {
        return new Response(JSON.stringify({ error: "Missing fileId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { "Authorization": `Bearer ${driveToken}` },
      });

      if (!resp.ok) {
        return new Response(JSON.stringify({ error: "Failed to download backup" }), {
          status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const backup = await resp.json();
      const restoredTables: string[] = [];

      for (const [table, rows] of Object.entries(backup)) {
        if (table.startsWith("_") || !Array.isArray(rows) || rows.length === 0) continue;
        const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
        if (!error) restoredTables.push(`${table}: ${rows.length} rows`);
      }

      return new Response(JSON.stringify({ success: true, restored: restoredTables }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name%20contains%20'kasandra-backup'&orderBy=modifiedTime%20desc&pageSize=20&fields=files(id,name,modifiedTime,size)`,
        { headers: { "Authorization": `Bearer ${driveToken}` } },
      );
      const result = await resp.json();
      if (!resp.ok) {
        return new Response(JSON.stringify({ error: "Failed to list backups", details: result }), {
          status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ files: result.files || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
