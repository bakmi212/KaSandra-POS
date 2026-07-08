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

    const sheetToken = settings?.google_sheets_token || Deno.env.get("GOOGLE_SHEETS_TOKEN");
    const spreadsheetId = settings?.google_sheets_id || Deno.env.get("GOOGLE_SHEETS_ID");

    if (!sheetToken || !spreadsheetId) {
      return new Response(JSON.stringify({ error: "Google Sheets not configured. Set GOOGLE_SHEETS_TOKEN and GOOGLE_SHEETS_ID in settings." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sheetsApi = "https://sheets.googleapis.com/v4/spreadsheets";

    async function ensureSheet(title: string): Promise<string> {
      const metaResp = await fetch(`${sheetsApi}/${spreadsheetId}`, {
        headers: { "Authorization": `Bearer ${sheetToken}` },
      });
      const meta = await metaResp.json();
      const existing = (meta.sheets || []).find((s: any) => s.properties.title === title);
      if (existing) return existing.properties.sheetId;

      const batchResp = await fetch(`${sheetsApi}/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${sheetToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
      });
      const batchResult = await batchResp.json();
      return batchResult.replies?.[0]?.addSheet?.properties?.sheetId;
    }

    async function appendRows(range: string, values: any[][]) {
      await fetch(`${sheetsApi}/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${sheetToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
    }

    async function clearSheet(range: string) {
      await fetch(`${sheetsApi}/${spreadsheetId}/values/${range}:clear`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${sheetToken}`, "Content-Type": "application/json" },
      });
    }

    if (action === "sync_sales") {
      const { data: sales } = await supabase.from("sales").select("invoice_no, created_at, customer_id, subtotal, discount, total, payment_method, status").order("created_at", { ascending: false }).limit(500);
      await ensureSheet("Penjualan");
      await clearSheet("Penjualan!A1:Z10000");
      const header = [["Invoice", "Tanggal", "Customer ID", "Subtotal", "Diskon", "Total", "Pembayaran", "Status"]];
      const rows = (sales || []).map((s: any) => [s.invoice_no, s.created_at, s.customer_id, s.subtotal, s.discount, s.total, s.payment_method, s.status]);
      await appendRows("Penjualan!A1", [...header, ...rows]);
      return new Response(JSON.stringify({ success: true, synced: rows.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sync_products") {
      const { data: products } = await supabase.from("products").select("name, sku, barcode, category_id, cost_price, sell_price, stock, is_active").order("name");
      await ensureSheet("Produk");
      await clearSheet("Produk!A1:Z10000");
      const header = [["Nama", "SKU", "Barcode", "Kategori ID", "Harga Beli", "Harga Jual", "Stok", "Aktif"]];
      const rows = (products || []).map((p: any) => [p.name, p.sku, p.barcode, p.category_id, p.cost_price, p.sell_price, p.stock, p.is_active]);
      await appendRows("Produk!A1", [...header, ...rows]);
      return new Response(JSON.stringify({ success: true, synced: rows.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use sync_sales or sync_products." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
