import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Profile {
  id: string;
  email: string;
  username: string;
  password: string | null;
  signup_location: string | null;
  signup_ip: string | null;
  last_login_at: string | null;
  created_at: string;
}

interface PasswordReset {
  user_id: string | null;
  email: string;
  old_password: string | null;
  new_password: string | null;
  reset_at: string;
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Missing Supabase environment variables." }, 500);
    }
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ error: "Your sign-in session has expired or is invalid." }, 401);
    }

    const { data: adminProfile, error: adminError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (adminError || adminProfile?.role !== "admin") {
      return jsonResponse({ error: "Administrator access is required." }, 403);
    }

    const [profilesResult, resetsResult] = await Promise.all([
      adminClient.from("profiles").select("*").order("created_at", { ascending: true }),
      adminClient.from("password_reset_log").select("*").order("reset_at", { ascending: true }),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (resetsResult.error) throw resetsResult.error;

    const header = [
      "S.No", "Name", "Email", "Password", "Signup Location",
      "Signup Date", "Signup Time", "Login Date", "Login Time",
      "Password Reset History", "Reset Date", "Reset Time", "Old Password", "New Password"
    ];

    const rows: unknown[][] = [];
    (profilesResult.data as Profile[]).forEach((profile, index) => {
      const signup = new Date(profile.created_at);
      const login = profile.last_login_at ? new Date(profile.last_login_at) : null;

      const resetsForEmail = (resetsResult.data as PasswordReset[]).filter(
        (reset) => reset.email.toLowerCase() === profile.email.toLowerCase()
      );

      if (resetsForEmail.length === 0) {
        rows.push([
          index + 1,
          profile.username,
          profile.email,
          profile.password ?? "",
          profile.signup_location ?? "",
          signup.toLocaleDateString("en-IN"),
          signup.toLocaleTimeString("en-IN"),
          login ? login.toLocaleDateString("en-IN") : "",
          login ? login.toLocaleTimeString("en-IN") : "",
          "",
          "",
          "",
          "",
          "",
        ]);
      } else {
        // First row: the profile itself.
        rows.push([
          index + 1,
          profile.username,
          profile.email,
          profile.password ?? "",
          profile.signup_location ?? "",
          signup.toLocaleDateString("en-IN"),
          signup.toLocaleTimeString("en-IN"),
          login ? login.toLocaleDateString("en-IN") : "",
          login ? login.toLocaleTimeString("en-IN") : "",
          "",
          "",
          "",
          "",
          "",
        ]);
        // Attached bottom rows: one per password reset for the same email.
        resetsForEmail.forEach((reset) => {
          const resetDate = new Date(reset.reset_at);
          rows.push([
            "",
            "",
            reset.email,
            "",
            "",
            "",
            "",
            "",
            "",
            "Password Reset",
            resetDate.toLocaleDateString("en-IN"),
            resetDate.toLocaleTimeString("en-IN"),
            reset.old_password ?? "",
            reset.new_password ?? "",
          ]);
        });
      }
    });

    const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=kavya-all-users-${new Date().toISOString().slice(0, 10)}.csv`,
      },
    });
  } catch (error) {
    console.error("User export failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "User export failed." }, 500);
  }
});
