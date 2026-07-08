import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function verifyToken(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  const hash = createHmac("sha256", Deno.env.get("SUPABASE_ANON_KEY") || "").update(token).digest("hex");
  const { data } = await supabase.from("api_tokens").select("*").eq("token_hash", hash).eq("is_active", true).maybeSingle();
  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (!(await verifyToken(req))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const path = url.pathname.replace("/rest-api", "").replace(/^\/+/, "");
    const segments = path.split("/").filter(Boolean);
    const resource = segments[0];
    const id = segments[1];

    const validResources = ["products", "sales", "customers", "suppliers", "reports"];
    if (!validResources.includes(resource)) {
      return new Response(JSON.stringify({ error: "Unknown resource: " + resource }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (resource === "reports") {
      const type = url.searchParams.get("type") || "summary";
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

      if (type === "summary") {
        const [sales, products, customers] = await Promise.all([
          supabase.from("sales").select("total, created_at").gte("created_at", start),
          supabase.from("products").select("stock, cost_price, sell_price").eq("is_active", true),
          supabase.from("customers").select("id", { count: "exact" }),
        ]);
        const totalSales = (sales.data || []).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
        const stockValue = (products.data || []).reduce((s: number, r: any) => s + Number(r.stock || 0) * Number(r.cost_price || 0), 0);
        return new Response(JSON.stringify({
          total_sales_this_month: totalSales,
          transaction_count: sales.data?.length || 0,
          active_products: products.data?.length || 0,
          stock_value: stockValue,
          customer_count: customers.count || 0,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "Unknown report type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tableMap: Record<string, string> = {
      products: "products", sales: "sales", customers: "customers", suppliers: "suppliers",
    };
    const table = tableMap[resource];

    if (req.method === "GET") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 1000);
      const offset = parseInt(url.searchParams.get("offset") || "0");
      let query = supabase.from(table).select("*").order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (id) query = query.eq("id", id).maybeSingle();
      const { data, error } = await query;
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { data, error } = await supabase.from(table).insert(body).select("*").maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "PUT" && id) {
      const body = await req.json();
      const { data, error } = await supabase.from(table).update(body).eq("id", id).select("*").maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "DELETE" && id) {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
