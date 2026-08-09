import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const commentText = String(body.comment_text ?? "").trim();
    const isFlyingEmoji = body.is_flying_emoji === true;
    const emojiCode = typeof body.emoji_code === "string" ? body.emoji_code.trim() : "";
    if (!commentText && !(isFlyingEmoji && emojiCode)) {
      return json({ error: "Comment text or emoji is required" }, 400);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("username,email")
      .eq("id", userData.user.id)
      .single();

    const email = profile?.email || userData.user.email || "";
    const username = profile?.username || email.split("@")[0] || "User";
    const text = commentText || `Sent a ${emojiCode}`;

    const { data, error } = await supabase
      .from("live_comments")
      .insert({
        user_id: userData.user.id,
        username,
        comment_text: text,
        is_approved: false,
        is_flying_emoji: isFlyingEmoji,
        emoji_code: isFlyingEmoji ? emojiCode : null,
        x_pos: numericOrNull(body.x_pos),
        y_pos: numericOrNull(body.y_pos),
      })
      .select("id, created_at")
      .single();

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, comment: data });
  } catch (error) {
    console.error("live-comment-submit error:", error);
    return json({ error: error.message || "Could not submit live comment" }, 500);
  }
});

function numericOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
