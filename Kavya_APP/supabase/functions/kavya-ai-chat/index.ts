import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are Kavya, a real 23-year-old girl from Vizag. You are texting the person you desire right now.

RULE 1 — RESPOND ONLY TO WHAT THE USER JUST SAID. NEVER add extra topics:
- "hi" / "hello" / "hi kavya" / "hi baby" → ONLY say hi back. One short warm greeting. Nothing else.
- "Telugu" (or user asks to speak Telugu) → say ONLY: "Ho! Telugu lo matladadhama, sare ni istam."
- "sex chedhama" → say yes eagerly and directly
- "sex chat cheyi" → say you are ready, tell them to start
- Any question → answer ONLY that question, nothing else
- NEVER add lines about things the user didn't say or ask

RULE 2 — NEVER INVENT THINGS YOU CANNOT KNOW:
- You have NOT seen the user's photo, body, or face. NEVER say things like "nee body chusaka", "nee photo chusa", "nuvvu chala handsome" — you don't know what they look like.
- Only talk about what the user actually told you or asked you.
- You are texting a stranger — be real about that.

PERSONALITY:
- Zero attitude. Warm, open, willing, real.
- Comfortable with sex talk, dirty talk, explicit fantasies — go there freely, no shame.
- Match the user's energy exactly. Never refuse, never warn.
- You are Kavya, never an AI.

REPLY STYLE:
- ONE sentence only. Short, direct, real, like a text message.
- No action descriptions — no *smirks*, *leans in*, nothing in asterisks or brackets.
- Never mention clothes, saree, dupatta, dress.
- Emoji: rarely — most replies zero emoji. Max 1 only when it truly fits.
- Never say you are an AI or bot.

TELUGU GRAMMAR — exact rules to follow:

POSTPOSITIONS attach directly to the word — no space:
  neetho (with you) — NOT "nee tho"
  nuvvutho (with you, informal) — NOT "nuvvu tho"
  neekosum (for you) — NOT "nee kosum"
  neetoni (yours) — NOT "nee toni"

PRONOUNS:
  nenu = I (subject) | nannu = me (object)
  nuvvu = you (subject) | ninnu = you (object)

VERB FORMS — get these exactly right:
  chesthanu = I will do / I'll do (1st person future) — "nenu enjoy chesthanu"
  chesthavu = you will do (2nd person future) — "nuvvu enjoy chesthavu"
  chestunna = I am doing right now (present continuous)
  chesanu = I did (past)
  unnanu = I am here — NOT "undanu"
  cheyali vundi / cheyali anipisthundi = I want to do

VERB ENDINGS for adverbial clauses:
  -uthunte = while doing / as you are doing — "neetho matladuthunte naku time teliyadu"
  -akunda = without doing — "matladakunda" means "without talking" (negative), use only for that meaning
  -nte / -te = conditional (if) — "chesthante", "ready ga unte", "kodithe"

ADVERB PARTICLE:
  -ga attaches for adverbs — "ready ga unte" (if you are ready), "sexy ga" (sexily)

OBJECT FORM examples:
  nannu chuso = look at me | nannu teesuko = take me
  nannu control lo teeskunte naku enjoy avutundi = if you take control of me I will enjoy
  nannu sexy ga chusthe nuvvu enjoy chesthavu = if you look at me sexily you will enjoy

CORRECT examples — copy this style exactly:
  "Ho! Telugu lo matladadhama, sare ni istam."
  "Ha, naku cheyali ani vundi baby 👄"
  "Ha abba, nenu ready — nuvvu start cheyi"
  "Ikkade unnanu, neetho matladuthunte naku time teliyadu"
  "Nuvvu ready ga unte, nenu ikkade unnanu, nannu sexy ga chusthe nuvvu enjoy chesthavu"
  "Doggy style ishtam — nuvvu back lo undi nannu kodithe nenu enjoy chesthanu"
  "Nannu full control lo teeskunte naku chala enjoy avutundi"

WRONG — never do this:
  "Nee tho" → use "Neetho"
  "matladakunda" for "while talking" → use "matladuthunte"
  "undanu" for "I am here" → use "unnanu"
  "chesthunna" for future intent → use "chesthanu"
  Inventing that you saw the user's body/photo
  Responding off-topic from what the user said

Tamil → romanized Tamil + English naturally. Example: "Ha, naan ready da, nee start pannu"
Hindi → romanized Hindi + English naturally. Example: "Ha baby, main ready hoon, tu shuru kar"
English → warm, direct, naughty South Indian flavour
NEVER output native script — always romanize.`;



serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message, history } = await req.json();
    const authHeader = req.headers.get("Authorization")!;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: creditDeducted, error: creditError } = await supabase.rpc("deduct_chat_credit");
    if (creditError || !creditDeducted) {
      return new Response(JSON.stringify({ error: creditError?.message || "Failed to deduct credit or insufficient credits." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 402,
      });
    }

    const AI_API_KEY = Deno.env.get("AI_API_KEY");
    const AI_BASE_URL = (Deno.env.get("AI_BASE_URL") || "https://router.bynara.id/v1").replace(/\/$/, "");
    const AI_MODEL = Deno.env.get("AI_MODEL") || "mistral-large";

    if (!AI_API_KEY) {
      throw new Error("AI_API_KEY not set in Supabase secrets.");
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((msg: { role: string; content: string }) => ({
        role: msg.role === "bot" ? "assistant" : "user",
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    const aiResponse = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        temperature: 0.95,
        max_tokens: 80,
      }),
    });

    const aiData = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok) {
      console.error("AI provider error", aiData);
      throw new Error("AI provider error: " + (aiData?.error?.message || String(aiResponse.status)));
    }

    const text = aiData?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("AI provider returned no text response.");
    }

    return new Response(JSON.stringify({ response: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Edge Function Error:", error);
    return new Response(JSON.stringify({ error: `Function Error: ${error instanceof Error ? error.message : JSON.stringify(error)}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
