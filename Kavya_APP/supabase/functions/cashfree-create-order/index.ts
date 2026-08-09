import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLANS = {
  pro_99: { amount: 99, amountPaise: 9900, credits: 100, tierStatus: "Pro Member" },
  vip_179: { amount: 179, amountPaise: 17900, credits: 180, tierStatus: "VIP Member" },
} as const;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) throw new Error("You must be signed in to purchase credits.");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user?.email) throw new Error("Your sign-in session has expired.");

    const { planId, customerPhone } = await request.json();
    const plan = PLANS[planId as keyof typeof PLANS];
    if (!plan) {
      console.error(`Invalid planId received: ${planId}`);
      throw new Error("Invalid credit pack.");
    }
    if (!/^\d{10}$/.test(customerPhone || "")) throw new Error("A valid 10-digit mobile number is required.");

    const environment = Deno.env.get("CASHFREE_ENVIRONMENT") === "production" ? "production" : "sandbox";
    const apiBase = environment === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
    const orderId = `kavya_${planId}_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const returnUrl = Deno.env.get("CASHFREE_RETURN_URL") || "https://example.com/?cashfree_order_id={order_id}";

    const cashfreeResponse = await fetch(`${apiBase}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": Deno.env.get("CASHFREE_API_VERSION") || "2023-08-01",
        "x-client-id": Deno.env.get("CASHFREE_CLIENT_ID")!,
        "x-client-secret": Deno.env.get("CASHFREE_CLIENT_SECRET")!,
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: plan.amount,
        order_currency: "INR",
        customer_details: { customer_id: user.id, customer_email: user.email, customer_phone: customerPhone },
        order_meta: { return_url: returnUrl },
        order_note: `Kavya App ${planId} credit pack`,
      }),
    });
    const cashfreeOrder = await cashfreeResponse.json();
    if (!cashfreeResponse.ok || !cashfreeOrder.payment_session_id) {
      console.error("Cashfree create-order failed", cashfreeOrder);
      throw new Error("Cashfree could not create this payment. Please try again.");
    }

    const { error: insertError } = await supabase.from("payment_orders").insert({
      user_id: user.id, cashfree_order_id: orderId, plan_id: planId,
      amount_paise: plan.amountPaise, credits_to_add: plan.credits, tier_status: plan.tierStatus,
      mobile: customerPhone,
    });
    if (insertError) throw insertError;

    return Response.json({ paymentSessionId: cashfreeOrder.payment_session_id, environment }, { headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message || "Unable to create payment." }, { status: 400, headers: corsHeaders });
  }
});
