import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function hmacBase64(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    // Keep this raw string unchanged: Cashfree signs the raw webhook body.
    const rawBody = await request.text();
    const timestamp = request.headers.get("x-webhook-timestamp");
    const suppliedSignature = request.headers.get("x-webhook-signature");
    const secret = Deno.env.get("CASHFREE_CLIENT_SECRET");
    // Cashfree sends an unsigned POST only to validate that a new endpoint is
    // reachable. Acknowledge it, but never process it as a payment webhook.
    if (!timestamp || !suppliedSignature) {
      return Response.json({ ok: true, probe: true });
    }
    if (!secret) throw new Error("Cashfree webhook secret is not configured.");
    if (await hmacBase64(secret, `${timestamp}${rawBody}`) !== suppliedSignature) {
      return new Response("Invalid signature", { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const orderId = payload?.data?.order?.order_id;
    const payment = payload?.data?.payment;
    if (!orderId || !payment?.cf_payment_id) throw new Error("Incomplete Cashfree payment payload.");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (payment.payment_status === "SUCCESS") {
      const { error } = await supabase.rpc("fulfill_cashfree_order", {
        p_cashfree_order_id: orderId, p_cashfree_payment_id: String(payment.cf_payment_id),
      });
      if (error) throw error;
    } else if (["FAILED", "USER_DROPPED"].includes(payment.payment_status)) {
      await supabase.from("payment_orders").update({ status: "failed" }).eq("cashfree_order_id", orderId).eq("status", "created");
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return new Response("Webhook processing failed", { status: 400 });
  }
});
