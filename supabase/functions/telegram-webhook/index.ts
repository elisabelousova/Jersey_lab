import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ADMIN_TG_USERNAME = (Deno.env.get("ADMIN_TG_USERNAME") ?? "").toLowerCase();
const STORAGE_BUCKET = "products";

// ---------------- types ----------------

type TgPhotoSize = { file_id: string; width?: number; height?: number; file_size?: number };
type TgDocument = { file_id: string; mime_type?: string };
type TgForwardOrigin = { type?: string; message_id?: number };

type TgUser = { id: number; username?: string };
type TgChat = { id: number; type?: string };

type TgMessage = {
  message_id: number;
  text?: string;
  caption?: string;

  photo?: TgPhotoSize[];
  document?: TgDocument;

  media_group_id?: string;

  forward_from_message_id?: number;
  forward_origin?: TgForwardOrigin;

  from?: TgUser;
  chat?: TgChat;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  channel_post?: TgMessage;
  edited_channel_post?: TgMessage;
};

type ProductRow = {
  media_group_id: string;
  message_id: number;
  title: string;
  season: string;
  size: string;
  sizes: string[];
  price: number;
  description: string;
  photos: string[]; // storage keys
  status: "available" | "sold";
};

// ---------------- utils ----------------

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------- SOLD helpers ----------------

function isSoldText(t: string) {
  const s = (t || "").toLowerCase();
  return s.includes("продано") || s.includes("sold") || s.includes("❌продано❌");
}

function extractMessageIdFromText(s: string): number | null {
  const text = (s || "").trim();

  // https://t.me/jersey_lab/21193
  let m = text.match(/t\.me\/jersey_lab\/(\d+)\b/i);
  if (m) return Number(m[1]);

  // t.me/c/<chatId>/<msgId>
  m = text.match(/t\.me\/c\/\d+\/(\d+)\b/i);
  if (m) return Number(m[1]);

  // "ПРОДАНО 21193"
  m = text.match(/\b(\d{3,})\b/);
  if (m) return Number(m[1]);

  return null;
}

// ---------------- telegram -> storage ----------------

async function fileIdToTelegramPath(fileId: string): Promise<string | null> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  if (!token) return null;

  const url = `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const r = await fetch(url);
  if (!r.ok) return null;

  const j = await r.json().catch(() => null);
  if (!j?.ok) return null;

  return j.result?.file_path ?? null;
}

// Берём предпоследний размер (~800px) вместо оригинала (2000-4000px).
// Для мобильного каталога 800px более чем достаточно,
// а размер файла в 3-5 раз меньше — экономит cached egress.
function pickImageFileId(msg: TgMessage): string | null {
  if (msg.photo?.length) {
    const idx = Math.max(0, msg.photo.length - 2);
    return msg.photo[idx].file_id;
  }

  const doc = msg.document;
  if (doc?.file_id && (doc.mime_type?.startsWith("image/") || !doc.mime_type)) {
    return doc.file_id;
  }
  return null;
}

function guessExtFromTelegramPath(p: string): string {
  const m = (p || "").match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "jpg";
}

async function uploadTelegramFileToStorage(
  supabase: any,
  mediaGroupId: string,
  telegramFilePath: string
): Promise<string | null> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  if (!token) return null;

  const dl = `https://api.telegram.org/file/bot${token}/${telegramFilePath}`;
  const r = await fetch(dl);
  if (!r.ok) return null;

  const contentType = r.headers.get("content-type") ?? "image/jpeg";
  const bytes = new Uint8Array(await r.arrayBuffer());

  const ext = guessExtFromTelegramPath(telegramFilePath);
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${mediaGroupId}/${fileName}`; // storage key

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: false });

  if (error) {
    console.log("STORAGE_UPLOAD_ERROR", error);
    return null;
  }

  return storagePath; // return key, not URL
}

async function deletePhotosFromStorage(supabase: any, photos: string[]) {
  const paths = (photos ?? []).filter(Boolean);
  if (!paths.length) return { deleted: 0 };

  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  if (error) throw new Error(error.message);

  return { deleted: paths.length };
}

// ---------------- parsing ----------------

function stripBuyBlock(text: string) {
  const lines = (text || "").split("\n");
  const cutIdx = lines.findIndex((l) => /^\s*(купить|buy)\s*:?\s*/i.test(l.trim()));
  return (cutIdx >= 0 ? lines.slice(0, cutIdx) : lines).join("\n").trim();
}

function normalizeForParse(s: string) {
  return (s || "").replace(/ /g, " ").replace(/[‐-–—]/g, "-").trim();
}

function removeEmojiPrefix(s: string) {
  return (s || "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function normalizeSizeCharsOnly(s: string) {
  return (s || "")
    .replaceAll("М", "M")
    .replaceAll("м", "M")
    .replaceAll("Х", "X")
    .replaceAll("х", "X");
}

function unifySize(size: string): string {
  const up = (size || "").toUpperCase();
  if (up === "2XL") return "XXL";
  if (up === "3XL") return "XXXL";
  if (up === "4XL") return "XXXXL";
  if (up === "5XL") return "XXXXXL";
  return up;
}

function parseSizeToken(raw: string): string | null {
  const t0 = normalizeForParse(raw).toUpperCase();
  const t = normalizeSizeCharsOnly(t0)
    .replace(/\b2XL\b/g, "XXL")
    .replace(/\b3XL\b/g, "XXXL")
    .replace(/\b4XL\b/g, "XXXXL")
    .replace(/\b5XL\b/g, "XXXXXL")
    .trim();

  const m = t.match(/^(XXXXXL|XXXXL|XXXL|XXL|XL|L|M|S|XS)\W*$/);
  return m ? unifySize(m[1]) : null;
}

function extractSizesFromAvailabilityLine(line: string): string[] | null {
  const cleaned = normalizeForParse(line);
  const m = cleaned.match(/^\s*(в\s*наличии|available)\s*:?\s*(.+)$/i);
  if (!m) return null;

  const tail = m[2] || "";
  const parts = tail
    .split(/[,/]|(?:\s+)/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const sizes: string[] = [];
  for (const p of parts) {
    const s = parseSizeToken(p);
    if (s && !sizes.includes(s)) sizes.push(s);
  }
  return sizes.length ? sizes : null;
}

function extractSizeStrictLine(line: string): string | null {
  const t0 = normalizeForParse(line).toUpperCase();
  const t = normalizeSizeCharsOnly(t0)
    .replace(/\b2XL\b/g, "XXL")
    .replace(/\b3XL\b/g, "XXXL")
    .replace(/\b4XL\b/g, "XXXXL")
    .replace(/\b5XL\b/g, "XXXXXL")
    .trim();

  const m = t.match(
    /^(?:(РАЗМЕР|SIZE)\s*[:\-–—]?\s*)?(XXXXXL|XXXXL|XXXL|XXL|XL|L|M|S|XS)\W*$/
  );
  return m ? unifySize(m[2]) : null;
}

function extractPrice(text: string): number | null {
  const t = normalizeForParse(text);
  const m =
    t.match(/(\d[\d\s]{1,10}\d)\s*(₽|р\.?|р|руб\.?|руб|RUB)\b/i) ||
    t.match(/(\d[\d\s]{1,10}\d)\s*₽/);

  if (!m) return null;
  const n = Number(m[1].replace(/\s+/g, ""));
  return Number.isFinite(n) ? n : null;
}

function extractSeason(titleLine: string): string {
  const m = (titleLine || "").match(/(\d{2}\/\d{2})/);
  return m ? m[1] : "";
}

function isGarbageDescriptionLine(line: string): boolean {
  const l = normalizeForParse(line).toLowerCase();
  if (l.includes("доставка по всему миру")) return true;
  if (l.includes("доставка по россии")) return true;
  if (l.includes("доставка по миру")) return true;
  if (l.includes("worldwide shipping")) return true;
  if (l.includes("shipping worldwide")) return true;
  return false;
}

function parsePost(rawText: string) {
  const cleaned = stripBuyBlock(rawText || "");
  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const title = removeEmojiPrefix(lines[0]);
  const season = extractSeason(title);

  let sizesArr: string[] | null = null;
  let sizeStr: string | null = null;

  for (let i = 1; i < lines.length; i++) {
    const multi = extractSizesFromAvailabilityLine(lines[i]);
    if (multi) {
      sizesArr = multi;
      sizeStr = multi.join(", ");
      break;
    }
  }

  if (!sizeStr) {
    for (let i = 1; i < lines.length; i++) {
      const s = extractSizeStrictLine(lines[i]);
      if (s) {
        sizesArr = [s];
        sizeStr = s;
        break;
      }
    }
  }

  if (!sizeStr || !sizesArr?.length) return null;

  const price = extractPrice(lines.join(" "));
  if (price == null) return null;

  const descLines: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];

    if (/^\s*(купить|buy)\s*:?\s*/i.test(l)) break;
    if (extractSizesFromAvailabilityLine(l)) continue;
    if (extractSizeStrictLine(l)) continue;
    if (extractPrice(l) != null) continue;
    if (isGarbageDescriptionLine(l)) continue;

    descLines.push(l);
  }

  return {
    title,
    season,
    size: sizeStr,
    sizes: sizesArr,
    price,
    description: descLines.join("\n").trim(),
  };
}

function uniqMax(arr: string[], max: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
    if (out.length === max) break;
  }
  return out;
}

// ---------------- handler ----------------

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
    if (req.method === "GET") return json({ ok: true, message: "telegram-webhook alive" });
    if (req.method !== "POST") return json({ ok: true, message: "Method not allowed" }, 405);

    let update: TelegramUpdate;
    try {
      update = (await req.json()) as TelegramUpdate;
    } catch {
      return json({ ok: true, message: "Invalid JSON ignored" });
    }

    const msg =
      update.message ||
      update.edited_message ||
      update.channel_post ||
      update.edited_channel_post;

    if (!msg) return json({ ok: true, message: "No message" });

    const text = (msg.caption || msg.text || "").trim();
    const hasText = Boolean(text);

    const fromUsername = (msg.from?.username ?? "").toLowerCase();
    const isAdmin = Boolean(ADMIN_TG_USERNAME) && fromUsername === ADMIN_TG_USERNAME;

    console.log("INCOMING", {
      message_id: msg.message_id,
      hasText,
      text: text.slice(0, 200),
      media_group_id: msg.media_group_id ?? null,
      from: fromUsername ?? null,
      isAdmin,
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    // ===== SOLD by text command (works WITHOUT media_group_id) =====
    if (hasText && isSoldText(text)) {
      if (!isAdmin) return json({ ok: true, message: "Sold ignored: not admin" });

      const soldMsgId = extractMessageIdFromText(text);
      if (!soldMsgId || !Number.isFinite(soldMsgId)) {
        return json({ ok: true, message: "Sold ignored: no message_id/link found" });
      }

      const { data: rows, error: se } = await supabase
        .from("products")
        .select("photos")
        .eq("message_id", soldMsgId);

      if (se) return json({ ok: true, message: "Sold select error", error: se.message });

      const photos = ((rows?.[0]?.photos ?? []) as string[]);
      let deleted = 0;

      try {
        const res = await deletePhotosFromStorage(supabase, photos);
        deleted = res.deleted;
      } catch (e) {
        console.log("SOLD_STORAGE_DELETE_ERROR", e);
      }

      const { data: updated, error: ue } = await supabase
        .from("products")
        .update({ status: "sold", photos: [] })
        .eq("message_id", soldMsgId)
        .select("message_id, status");

      if (ue) return json({ ok: true, message: "Sold update error", error: ue.message });

      return json({
        ok: true,
        message: (updated?.length ?? 0)
          ? "Marked sold + photos deleted"
          : "No row updated (message_id not found)",
        soldMsgId,
        deleted,
      });
    }
    // ===== END SOLD =====

    const mediaGroupId = msg.media_group_id;
    if (!mediaGroupId) return json({ ok: true, message: "No media_group_id" });

    const isForward =
      Boolean(msg.forward_from_message_id) ||
      (msg.forward_origin?.type === "channel") ||
      (msg.forward_origin?.type === "user");

    const { data: buf0 } = await supabase
      .from("tg_media_buffer")
      .select("media_group_id")
      .eq("media_group_id", mediaGroupId)
      .maybeSingle();

    const { data: prod0 } = await supabase
      .from("products")
      .select("media_group_id")
      .eq("media_group_id", mediaGroupId)
      .maybeSingle();

    const alreadyStarted = Boolean(buf0 || prod0);
    if (!isForward && !isAdmin && !alreadyStarted) {
      return json({ ok: true, message: "Not forward/admin and not started yet, ignored" });
    }

    const sourcePostId =
      msg.forward_from_message_id ??
      msg.forward_origin?.message_id ??
      msg.message_id;

    const fileId = pickImageFileId(msg);
    let photoKey: string | null = null;

    if (fileId) {
      const tgPath = await fileIdToTelegramPath(fileId);
      if (tgPath) {
        photoKey = await uploadTelegramFileToStorage(supabase, mediaGroupId, tgPath);
      }
    }

    if (photoKey) {
      const { error: rpcErr } = await supabase.rpc("tg_buffer_append_photo", {
        mgid: mediaGroupId,
        p: photoKey,
      });
      if (rpcErr) console.log("tg_buffer_append_photo error", rpcErr);

      const { data: prodNow } = await supabase
        .from("products")
        .select("photos")
        .eq("media_group_id", mediaGroupId)
        .maybeSingle();

      if (prodNow) {
        const nextPhotos = uniqMax([...(prodNow.photos ?? []), photoKey], 8);
        await supabase.from("products").update({ photos: nextPhotos }).eq("media_group_id", mediaGroupId);
      }
    }

    if (hasText) {
      const { error: capErr } = await supabase.rpc("tg_buffer_set_caption", {
        mgid: mediaGroupId,
        mid: sourcePostId,
        cap: text,
      });
      if (capErr) console.log("tg_buffer_set_caption error", capErr);
    }

    const { data: buffer, error: bErr } = await supabase
      .from("tg_media_buffer")
      .select("message_id, caption, photos")
      .eq("media_group_id", mediaGroupId)
      .maybeSingle();

    if (bErr) return json({ ok: true, message: "buffer read error ignored", error: bErr.message });

    const bufferCaption = (buffer?.caption || "").trim();
    const bufferPhotos = (buffer?.photos ?? []) as string[];
    const ready = Boolean(bufferCaption && bufferPhotos.length > 0);

    if (!ready) {
      return json({ ok: true, message: "Not ready yet", mediaGroupId, photos: bufferPhotos.length });
    }

    if (hasText) await sleep(1500);

    const { data: b3 } = await supabase
      .from("tg_media_buffer")
      .select("caption, photos, message_id")
      .eq("media_group_id", mediaGroupId)
      .maybeSingle();

    const finalCaption = (b3?.caption || bufferCaption).trim();
    const finalPhotos = uniqMax(((b3?.photos ?? bufferPhotos) as string[]), 8);
    const finalMessageId = (b3?.message_id as any) ?? sourcePostId;

    const parsed = parsePost(finalCaption);
    if (!parsed) {
      return json({
        ok: true,
        message: "Caption not parsed yet, buffer kept",
        mediaGroupId,
        photos: finalPhotos.length,
      });
    }

    const product: ProductRow = {
      media_group_id: mediaGroupId,
      message_id: finalMessageId,
      photos: finalPhotos,
      title: parsed.title,
      season: parsed.season,
      size: parsed.size,
      sizes: parsed.sizes,
      price: parsed.price,
      description: parsed.description,
      status: "available",
    };

    const { data: existingProd } = await supabase
      .from("products")
      .select("status")
      .eq("media_group_id", mediaGroupId)
      .maybeSingle();

    if (existingProd?.status === "sold") {
      product.status = "sold";
    }

    const { error: upErr } = await supabase.from("products").upsert(product, { onConflict: "media_group_id" });
    if (upErr) return json({ ok: true, message: "products upsert error ignored", error: upErr.message });

    return json({ ok: true, message: "Saved", mediaGroupId, photos: finalPhotos.length });
  } catch (e) {
    return json({ ok: true, message: "exception ignored", error: (e as Error).message });
  }
});
