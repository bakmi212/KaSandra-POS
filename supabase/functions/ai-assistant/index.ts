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

// ============================================================
// AI Provider Adapter Pattern
// ============================================================

interface AIProvider {
  name: string;
  chat(messages: { role: string; content: string }[], systemPrompt: string, model: string): Promise<string>;
}

class OpenAIProvider implements AIProvider {
  name = "openai";
  constructor(private apiKey: string) {}

  async chat(messages: { role: string; content: string }[], systemPrompt: string, model: string): Promise<string> {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || "OpenAI API error");
    return data.choices?.[0]?.message?.content || "";
  }
}

class GeminiProvider implements AIProvider {
  name = "gemini";
  constructor(private apiKey: string) {}

  async chat(messages: { role: string; content: string }[], systemPrompt: string, model: string): Promise<string> {
    const modelId = model || "gemini-1.5-flash";
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
        }),
      },
    );
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || "Gemini API error");
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
}

class OpenRouterProvider implements AIProvider {
  name = "openrouter";
  constructor(private apiKey: string) {}

  async chat(messages: { role: string; content: string }[], systemPrompt: string, model: string): Promise<string> {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || "OpenRouter API error");
    return data.choices?.[0]?.message?.content || "";
  }
}

function getProvider(name: string, apiKey: string): AIProvider {
  switch (name.toLowerCase()) {
    case "openai": return new OpenAIProvider(apiKey);
    case "gemini": return new GeminiProvider(apiKey);
    case "openrouter": return new OpenRouterProvider(apiKey);
    default: return new OpenAIProvider(apiKey);
  }
}

// ============================================================
// Business Data Collector
// ============================================================

async function gatherBusinessContext(): Promise<string> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const weekStartIso = weekStart.toISOString();

  const [
    todaySales, monthSales, weekSales,
    products, lowStock, topProducts, slowProducts,
    todayExpenses, monthExpenses, topExpenses,
    topSuppliers, topCustomers,
  ] = await Promise.all([
    supabase.from("sales").select("total, created_at, status").gte("created_at", todayStart),
    supabase.from("sales").select("total, created_at, status").gte("created_at", monthStart),
    supabase.from("sales").select("total, created_at, status").gte("created_at", weekStartIso),
    supabase.from("products").select("id, name, sku, stock, cost_price, sell_price, is_active").eq("is_active", true),
    supabase.from("products").select("name, stock, min_stock").eq("is_active", true).lt("stock", 10),
    supabase.from("sale_items").select("product_id, quantity, products(name)").order("quantity", { ascending: false }).limit(10),
    supabase.from("sale_items").select("product_id, quantity, products(name)").order("quantity", { ascending: true }).limit(10),
    supabase.from("finance_transactions").select("amount, category, description").gte("created_at", todayStart).eq("type", "expense"),
    supabase.from("finance_transactions").select("amount, category, description").gte("created_at", monthStart).eq("type", "expense"),
    supabase.from("finance_transactions").select("amount, category, description").eq("type", "expense").order("amount", { ascending: false }).limit(5),
    supabase.from("purchases").select("supplier_id, suppliers(name)").order("created_at", { ascending: false }).limit(50),
    supabase.from("sales").select("customer_id, customers(name), total").order("total", { ascending: false }).limit(20),
  ]);

  const fmtRp = (n: number) => "Rp " + n.toLocaleString("id-ID");
  const sum = (arr: any[], key: string) => (arr || []).reduce((s, r) => s + Number(r[key] || 0), 0);

  const todayOmzet = sum(todaySales.data || [], "total");
  const monthOmzet = sum(monthSales.data || [], "total");
  const weekOmzet = sum(weekSales.data || [], "total");
  const todayExp = sum(todayExpenses.data || [], "amount");
  const monthExp = sum(monthExpenses.data || [], "amount");

  const stockValue = (products.data || []).reduce((s, p) => s + Number(p.stock || 0) * Number(p.cost_price || 0), 0);
  const potentialRevenue = (products.data || []).reduce((s, p) => s + Number(p.stock || 0) * Number(p.sell_price || 0), 0);

  const topProductList = (topProducts.data || []).slice(0, 5).map((p: any) => `${p.products?.name || "Unknown"} (${p.quantity}x)`).join(", ");
  const slowProductList = (slowProducts.data || []).slice(0, 5).map((p: any) => `${p.products?.name || "Unknown"} (${p.quantity}x)`).join(", ");
  const lowStockList = (lowStock.data || []).map((p: any) => `${p.name} (sisa ${p.stock})`).join(", ");
  const topExpList = (topExpenses.data || []).map((e: any) => `${e.description || e.category}: ${fmtRp(e.amount)}`).join(", ");

  const supplierCounts: Record<string, number> = {};
  (topSuppliers.data || []).forEach((p: any) => {
    const name = p.suppliers?.name || "Unknown";
    supplierCounts[name] = (supplierCounts[name] || 0) + 1;
  });
  const topSupplier = Object.entries(supplierCounts).sort((a, b) => b[1] - a[1])[0];

  const customerTotals: Record<string, number> = {};
  (topCustomers.data || []).forEach((s: any) => {
    const name = s.customers?.name || "Walk-in";
    customerTotals[name] = (customerTotals[name] || 0) + Number(s.total || 0);
  });
  const topCustomer = Object.entries(customerTotals).sort((a, b) => b[1] - a[1])[0];

  const todayProfit = todayOmzet - todayExp;

  return `DATA BISNIS KA SANDRA (real-time):
- Omzet hari ini: ${fmtRp(todayOmzet)} (${todaySales.data?.length || 0} transaksi)
- Omzet minggu ini: ${fmtRp(weekOmzet)}
- Omzet bulan ini: ${fmtRp(monthOmzet)} (${monthSales.data?.length || 0} transaksi)
- Pengeluaran hari ini: ${fmtRp(todayExp)}
- Pengeluaran bulan ini: ${fmtRp(monthExp)}
- Estimasi laba hari ini: ${fmtRp(todayProfit)}
- Nilai stok: ${fmtRp(stockValue)}
- Potensi pendapatan dari stok: ${fmtRp(potentialRevenue)}
- Produk terlaris: ${topProductList || "belum ada data"}
- Produk paling sedikit terjual: ${slowProductList || "belum ada data"}
- Barang hampir habis (<10): ${lowStockList || "tidak ada"}
- Pengeluaran terbesar: ${topExpList || "belum ada data"}
- Supplier paling sering: ${topSupplier ? topSupplier[0] + " (" + topSupplier[1] + "x)" : "belum ada data"}
- Pelanggan terbaik: ${topCustomer ? topCustomer[0] + " (" + fmtRp(topCustomer[1]) + ")" : "belum ada data"}
- Total produk aktif: ${products.data?.length || 0}`;
}

// ============================================================
// Smart Recommendations Generator
// ============================================================

async function generateRecommendations(): Promise<any[]> {
  const recs: any[] = [];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [lowStock, slowProducts, topExpenses, products, monthSales] = await Promise.all([
    supabase.from("products").select("name, stock, min_stock, cost_price").eq("is_active", true).lt("stock", 10),
    supabase.from("sale_items").select("product_id, quantity, products(name, stock, sell_price)").order("quantity", { ascending: true }).limit(20),
    supabase.from("finance_transactions").select("amount, category, description, created_at").eq("type", "expense").gte("created_at", monthStart).order("amount", { ascending: false }).limit(10),
    supabase.from("products").select("name, stock, sell_price, cost_price").eq("is_active", true),
    supabase.from("sales").select("total, created_at").gte("created_at", monthStart),
  ]);

  // Restock recommendations
  (lowStock.data || []).forEach((p: any) => {
    const min = p.min_stock || 10;
    if (p.stock < min) {
      recs.push({
        type: "restock",
        priority: p.stock === 0 ? "critical" : "high",
        title: `Restock ${p.name}`,
        description: `Stok tersisa ${p.stock} (minimum ${min}). Segera lakukan pembelian.`,
        action: "Buat PO",
      });
    }
  });

  // Slow-moving products
  const slowMap: Record<string, number> = {};
  (slowProducts.data || []).forEach((s: any) => {
    if (s.products) slowMap[s.products.name] = (slowMap[s.products.name] || 0) + s.quantity;
  });
  const slowEntries = Object.entries(slowMap).filter(([, qty]) => qty <= 2).slice(0, 3);
  slowEntries.forEach(([name, qty]) => {
    recs.push({
      type: "slow_moving",
      priority: "medium",
      title: `Kurangi stok ${name}`,
      description: `Produk slow-moving, hanya terjual ${qty}x bulan ini. Pertimbangkan promo atau bundle.`,
      action: "Buat Promo",
    });
  });

  // Unusual expenses
  const expenses = (topExpenses.data || []).map((e) => Number(e.amount || 0));
  if (expenses.length > 3) {
    const avg = expenses.reduce((a, b) => a + b, 0) / expenses.length;
    (topExpenses.data || []).slice(0, 3).forEach((e: any) => {
      if (Number(e.amount) > avg * 2) {
        recs.push({
          type: "unusual_expense",
          priority: "high",
          title: `Pengeluaran tidak wajar: ${e.description || e.category}`,
          description: `Pengeluaran ${"Rp " + Number(e.amount).toLocaleString("id-ID")} lebih dari 2x rata-rata (${"Rp " + Math.round(avg).toLocaleString("id-ID")}). Periksa kembali.`,
          action: "Review",
        });
      }
    });
  }

  // Promotable products (high margin + good sales)
  const topProductSales: Record<string, number> = {};
  const { data: topItems } = await supabase.from("sale_items").select("product_id, quantity, products(name, sell_price, cost_price)").order("quantity", { ascending: false }).limit(20);
  (topItems || []).forEach((s: any) => {
    if (s.products) {
      const margin = Number(s.products.sell_price || 0) - Number(s.products.cost_price || 0);
      const marginPct = Number(s.products.cost_price) > 0 ? (margin / Number(s.products.cost_price)) * 100 : 0;
      if (marginPct > 30 && s.quantity > 5) {
        recs.push({
          type: "promotable",
          priority: "low",
          title: `Promosikan ${s.products.name}`,
          description: `Margin tinggi (${marginPct.toFixed(0)}%) dan penjualan baik (${s.quantity}x). Layak dipromosikan lebih agresif.`,
          action: "Buat Promo",
        });
      }
    }
  });

  return recs.slice(0, 10);
}

// ============================================================
// Main Handler
// ============================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, message, history } = body;

    // Load AI settings
    const { data: aiSettings } = await supabase.from("ai_settings").select("*").eq("is_active", true).limit(1).maybeSingle();

    const providerName = aiSettings?.provider || body.provider || "openai";
    const apiKey = aiSettings?.api_key || Deno.env.get("OPENAI_API_KEY") || Deno.env.get("AI_API_KEY");
    const model = aiSettings?.model || "gpt-4o-mini";
    const systemPrompt = aiSettings?.system_prompt || "Anda adalah KaSandra AI, asisten bisnis POS.";

    // Action: get business context only (for dashboard insights)
    if (action === "context") {
      const context = await gatherBusinessContext();
      return new Response(JSON.stringify({ context }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: get smart recommendations
    if (action === "recommendations") {
      const recs = await generateRecommendations();
      return new Response(JSON.stringify({ recommendations: recs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: chat with AI
    if (action === "chat" || !action) {
      if (!message) {
        return new Response(JSON.stringify({ error: "Missing message" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!apiKey) {
        return new Response(JSON.stringify({
          error: "AI provider belum dikonfigurasi. Atur API key di Settings > Integrasi > AI Provider.",
        }), {
          status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const provider = getProvider(providerName, apiKey);
      const businessContext = await gatherBusinessContext();

      const fullSystemPrompt = `${systemPrompt}\n\n${businessContext}\n\nGunakan data di atas untuk menjawab pertanyaan user secara akurat. Jika ditanya tentang omzet, laba, produk, stok, supplier, atau pelanggan, gunakan data real-time yang disediakan.`;

      const messages = (history || []).map((h: any) => ({ role: h.role, content: h.content }));
      messages.push({ role: "user", content: message });

      const response = await provider.chat(messages, fullSystemPrompt, model);

      // Save conversation
      await supabase.from("ai_conversations").insert([
        { role: "user", content: message },
        { role: "assistant", content: response, metadata: { provider: providerName, model } },
      ]);

      return new Response(JSON.stringify({ response, provider: providerName, model }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: generate summary
    if (action === "summary") {
      const period = body.period || "daily";
      const context = await gatherBusinessContext();
      const periodLabel = period === "daily" ? "harian" : period === "weekly" ? "mingguan" : "bulanan";

      if (!apiKey) {
        return new Response(JSON.stringify({ summary: `Ringkasan ${periodLabel}:\n\n${context}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const provider = getProvider(providerName, apiKey);
      const summaryPrompt = `Buat ringkasan ${periodLabel} bisnis berdasarkan data berikut. Sertakan: highlight omzet, pengeluaran, laba, produk terlaris, dan 2-3 rekomendasi singkat. Format dengan bullet points dan emoji yang sesuai.`;
      const response = await provider.chat([{ role: "user", content: summaryPrompt }], `${systemPrompt}\n\n${context}`, model);

      return new Response(JSON.stringify({ summary: response }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: get insights
    if (action === "insights") {
      const context = await gatherBusinessContext();
      const recs = await generateRecommendations();

      if (!apiKey) {
        return new Response(JSON.stringify({ insights: context, recommendations: recs }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const provider = getProvider(providerName, apiKey);
      const insightPrompt = `Berikan insight bisnis singkat (maks 3 paragraf) berdasarkan data berikut. Fokus pada: tren penjualan, kesehatan keuangan, dan kondisi stok. Gunakan Bahasa Indonesia yang jelas dan actionable.`;
      const insights = await provider.chat([{ role: "user", content: insightPrompt }], `${systemPrompt}\n\n${context}`, model);

      return new Response(JSON.stringify({ insights, recommendations: recs }), {
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
