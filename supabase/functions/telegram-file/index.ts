import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  if (!token) return new Response("No TELEGRAM_BOT_TOKEN", { status: 500, headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400, headers: corsHeaders });

  const tgUrl = `https://api.telegram.org/file/bot${token}/${path}`;
  const r = await fetch(tgUrl);

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    return new Response(`Telegram fetch failed: ${r.status} ${text}`.trim(), {
      status: 502,
      headers: corsHeaders,
    });
  }

  const buf = await r.arrayBuffer();
  const ct = r.headers.get("content-type") ?? "application/octet-stream";

  return new Response(buf, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": ct,
      "Cache-Control": "public, max-age=86400",
      "Content-Disposition": "inline",
    },
  });
});
