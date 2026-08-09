import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" // Admin function, use service role key
    );

    // Verify admin status (using the is_admin() function created in schema.sql)
    const { data: { user } } = await supabaseClient.auth.getUser(req.headers.get("Authorization")?.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: adminData, error: adminError } = await supabaseClient.rpc('is_admin');
    if (adminError || !adminData) {
      console.error("Admin check failed:", adminError);
      return new Response(JSON.stringify({ error: "Administrator access required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const { is_active, stream_url } = await req.json();

    // Fetch the single live_stream_status entry
    const { data: currentStatus, error: fetchError } = await supabaseClient
      .from('live_stream_status')
      .select('id')
      .single();

    if (fetchError) {
      console.error("Error fetching live stream status:", fetchError);
      return new Response(JSON.stringify({ error: "Could not retrieve live stream status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const updatePayload: { is_active?: boolean; stream_url?: string; last_updated: string } = {
      last_updated: new Date().toISOString(),
    };

    if (typeof is_active === 'boolean') {
      updatePayload.is_active = is_active;
    }
    if (typeof stream_url === 'string') {
      updatePayload.stream_url = stream_url;
    }

    const { error: updateError } = await supabaseClient
      .from("live_stream_status")
      .update(updatePayload)
      .eq('id', currentStatus.id); // Assuming there's always one entry and we fetched its ID

    if (updateError) {
      console.error("Error updating live stream status:", updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ message: "Live stream status updated" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

