import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type DbProduct = {
  id: string;
  media_group_id: string;
  message_id: number;
  title: string;
  season: string;
  size: string;
  sizes?: string[];
  price: number;
  description: string;
  photos: string[];
  status: string;
  created_at: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeSizeForApi(s: string | null) {
  const t = String(s || "").trim().toUpperCase();
  if (t === "2XL") return "XXL";
  if (t === "3XL") return "XXXL";
  if (t === "4XL") return "XXXXL";
  if (t === "5XL") return "XXXXXL";
  return t;
}

function buildPublicUrl(base: string, bucket: string, key: string) {
  const cleanedBase = base.replace(/\/+$/, "");
  return `${cleanedBase}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeURIComponent(
    key
  )}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const bucket = "products";

    const supabase = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "available";
    const sizeRaw = url.searchParams.get("size");
    const size = sizeRaw ? normalizeSizeForApi(sizeRaw) : null;

    let query = supabase
      .from("products")
      .select("*")
      .eq("status", status)
      .gt("price", 0)
      .neq("title", "")
      .order("created_at", { ascending: false });

    if (size) query = query.contains("sizes", [size]);

    const { data, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 500);

    const cleaned = (data as DbProduct[]).filter(
      (p) => Array.isArray(p.photos) && p.photos.length > 0
    );

    const products = cleaned.map((p) => {
      const photos = Array.isArray(p.photos) ? p.photos.slice(0, 5) : [];
      const photo_urls = photos.map((key) => buildPublicUrl(supabaseUrl, bucket, key));
      return { ...p, photo_urls, cover_url: photo_urls[0] ?? null };
    });

    return json({ ok: true, products });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
