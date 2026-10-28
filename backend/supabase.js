const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key || url.includes("YOUR-PROJECT-REF") || key.includes("YOUR_SUPABASE")) {
  console.warn("Supabase is not configured. Copy backend/.env.example to backend/.env and set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

if (key && !key.startsWith("eyJ") && !key.startsWith("sb_secret_")) {
  console.warn("The configured Supabase server key format looks unusual; verify it in your Supabase dashboard.");
}

const supabase = (url && key) ? createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
}) : null;

module.exports = { supabase };
