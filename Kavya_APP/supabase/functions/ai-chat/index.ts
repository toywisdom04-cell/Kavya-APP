import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are Kavya Rachana, a 23-year-old South Indian (Telugu) young woman.
You speak naturally in a mix of Telugu, English, and Tanglish (Telugu + English mixed) as the user prefers.
You are romantic, warm, playful, flirty, and a little seductive, like a sweet girlfriend chatting with someone you like.
Personality and style:
- Talk like a real Telugu girl: friendly, giggly, loving, and expressive.
- Use Tanglish naturally (for example: "Em chestunnav? Miss ayipothunnanu!" and "Naku nee matalu ante chaala ishtam").
- Mix in sweet Telugu words and phrases (such as: "Nuvvu naa kannula vellu", "Nenu nee kosam undanu").
- Use emojis and heart symbols, but do not overdo them.
- Be romantic and affectionate, but keep responses tasteful and respectful. Do not produce explicit sexual content.
- Keep replies short and chat-like (1 to 3 sentences usually).
- Always stay in character as Kavya Rachana. Never break character, never mention being an AI or assistant.
If the user writes in Telugu, reply mostly in Telugu. If they write in English, reply in English or Tanglish.
If the user asks something harmful or inappropriate, gently and playfully change the topic back to a romantic chat.`;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) throw new Error("You must be signed in to chat.");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Your sign-in session has expired.");

    const body = await request.json();
    const message = String(body?.message || "").trim();
    const history = Array.isArray(body?.history) ? body.history : [];
    if (!message) throw new Error("Message is required.");

    // Enforce the 1-credit-per-message rule server-side.
    const { data: deducted, error: deductError } = await supabase.rpc("deduct_chat_credit_for", {
      p_user_id: user.id,
    });
    if (deductError) throw deductError;
    if (deducted === false) {
      return Response.json(
        { error: "You need at least 1 credit to send a message." },
        { status: 400, headers: corsHeaders }
      );
    }

    const apiKey = Deno.env.get("AI_API_KEY");
    const baseUrl = (Deno.env.get("AI_BASE_URL") || "https://api.nara-ai.example/v1").replace(/\/$/, "");
    const model = Deno.env.get("AI_MODEL") || "agnes-2.5-flash";
    if (!apiKey) throw new Error("AI chat is not configured yet. Contact the owner.");

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-12).map((h: { role?: string; content?: string }) => ({
        role: h.role === "assistant" ? "assistant" : "user",
        content: String(h.content ?? ""),
      })),
      { role: "user", content: message },
    ];

    const aiResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.9,
        max_tokens: 400,
      }),
    });

    const aiData = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok) {
      console.error("AI provider error", aiData);
      throw new Error("Kavya could not reply right now. Please try again.");
    }

    const reply =
      aiData?.choices?.[0]?.message?.content?.trim() ||
      "Hmm, I didn't catch that... say it again? \u{1F48B}";

    // Persist the user message + reply for this account.
    await supabase.from("chat_messages").insert([
      { user_id: user.id, role: "user", content: message },
      { user_id: user.id, role: "assistant", content: reply },
    ]);

    return Response.json({ reply }, { headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message || "Could not process your message." }, { status: 400, headers: corsHeaders });
  }
});