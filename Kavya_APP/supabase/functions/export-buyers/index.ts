import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BuyerRecord {
  id: number;
  user_id: string | null;
  email: string;
  mobile: string | null;
  plan_id: string;
  amount_paise: number | null;
  credits_purchased: number | null;
  cashfree_order_id: string | null;
  cashfree_payment_id: string | null;
  created_at: string;
  paid_at: string | null;
  profile: {
    username: string;
    tier_status: string;
    created_at: string;
  } | null;
}

interface Profile {
  id: string;
  credits: number;
}

interface CreditTransaction {
  user_id: string;
  transaction_type: "purchase" | "media_unlock" | "chat" | "adjustment";
  amount: number;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "Admin authorization is required." }, 401);

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Missing Supabase environment variables." }, 500);
    }
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Use the anon key client to verify the user's JWT

    // Use the anon key client to verify the user's JWT
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ error: "Your sign-in session has expired or is invalid." }, 401);
    }

    // Use the service role client for all subsequent database operations
    // const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: adminProfile, error: adminError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (adminError || adminProfile?.role !== "admin") {
      return jsonResponse({ error: "Administrator access is required." }, 403);
    }

    const [buyersResult, profilesResult, transactionsResult] = await Promise.all([
      adminClient.from("buyer_records").select(`
        *,
        profile:profiles (
          username,
          tier_status,
          created_at
        )
      `).order("id", { ascending: true }),
      adminClient.from("profiles").select("id, credits"),
      adminClient.from("credit_transactions").select("user_id, transaction_type, amount"),
    ]);

    if (buyersResult.error) throw buyersResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (transactionsResult.error) throw transactionsResult.error;

    const profiles = new Map((profilesResult.data as Profile[]).map((profile) => [profile.id, profile]));
    const usage = new Map<string, { total: number; media: number; chat: number }>();
    for (const transaction of transactionsResult.data as CreditTransaction[]) {
      const current = usage.get(transaction.user_id) || { total: 0, media: 0, chat: 0 };
      if (transaction.amount < 0) {
        const used = Math.abs(transaction.amount);
        current.total += used;
        if (transaction.transaction_type === "media_unlock") current.media += used;
        if (transaction.transaction_type === "chat") current.chat += used;
      }
      usage.set(transaction.user_id, current);
    }

    const header = [
      "S.No", "Email", "Username", "Phone", "Tier", "Signed up at",
      "Subscription Plan", "Subscription Amount (INR)", "Credits Purchased",
      "Credits Used (Total)", "Credits Used (Media)", "Credits Used (Chat)", "Credits Remaining",
      "Purchase Date", "Purchase Time", "Cashfree Order ID", "Cashfree Payment ID"
    ];

    const rows = (buyersResult.data as BuyerRecord[]).map((buyer) => {
      const buyerUsage = buyer.user_id ? usage.get(buyer.user_id) || { total: 0, media: 0, chat: 0 } : { total: 0, media: 0, chat: 0 };
      const purchaseDate = new Date(buyer.paid_at || buyer.created_at);
      const planLabel = { pro_50: "Pro Member", pro_99: "Pro Member", vip_150: "VIP Member", vip_179: "VIP Member" }[buyer.plan_id] || buyer.plan_id;

      return [
        buyer.id,
        buyer.email,
        buyer.profile?.username,
        buyer.mobile,
        buyer.profile?.tier_status,
        buyer.profile ? new Date(buyer.profile.created_at).toLocaleString("en-IN") : "",
        planLabel,
        buyer.amount_paise === null ? "" : (buyer.amount_paise / 100).toFixed(2),
        buyer.credits_purchased,
        buyerUsage.total,
        buyerUsage.media,
        buyerUsage.chat,
        buyer.user_id ? profiles.get(buyer.user_id)?.credits ?? "" : "",
        purchaseDate.toLocaleDateString("en-IN"),
        purchaseDate.toLocaleTimeString("en-IN"),
        buyer.cashfree_order_id,
        buyer.cashfree_payment_id,
      ];
    });

    const csv = "﻿" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=kavya-buyers-${new Date().toISOString().slice(0, 10)}.csv`,
      },
    });
  } catch (error) {
    console.error("Buyer export failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Buyer export failed." }, 500);
  }
});
