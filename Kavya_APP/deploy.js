module.exports = {
  run: [{
    method: "shell.run",
    params: {
      message: [
        "supabase functions deploy cashfree-create-order --no-verify-jwt",
        "supabase functions deploy cashfree-webhook --no-verify-jwt",
        "supabase functions deploy export-buyers --no-verify-jwt",
      "supabase functions deploy export-users --no-verify-jwt",
      "supabase functions deploy live-comment-submit --no-verify-jwt",
      "supabase functions deploy live-stream-control --no-verify-jwt"
      ]
    }
  }]
}

