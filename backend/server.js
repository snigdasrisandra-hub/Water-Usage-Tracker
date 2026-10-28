require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { supabase } = require("./supabase");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const allowedOrigin = process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500";
const ACTIVITIES = ["Shower", "Bath", "Brushing teeth", "Toilet flush", "Laundry", "Dishwashing", "Cooking", "Drinking", "Cleaning", "Gardening", "Other"];

app.use(cors({ origin: (origin, callback) => {
  // Allow requests without Origin (curl/local health checks) and the configured frontend origin.
  if (!origin || origin === allowedOrigin) return callback(null, true);
  return callback(new Error("Origin is not allowed by CORS."));
}}));
app.use(express.json({ limit: "20kb" }));

function configured(req, res, next) {
  if (!supabase) return res.status(503).json({ error: "Database is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env." });
  next();
}
function validId(id) {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
function validateEntry(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) return ["Request body must be a JSON object."];
  if (!ACTIVITIES.includes(body.activity)) errors.push(`Activity must be one of: ${ACTIVITIES.join(", ")}.`);
  const amount = Number(body.amount_litres);
  if (body.amount_litres === "" || body.amount_litres === null || body.amount_litres === undefined || !Number.isFinite(amount) || amount < 0.1 || amount > 100000) errors.push("amount_litres must be a number from 0.1 to 100000.");
  if (typeof body.usage_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.usage_date) || !Number.isFinite(Date.parse(`${body.usage_date}T00:00:00Z`)) || body.usage_date > new Date().toISOString().slice(0,10)) errors.push("usage_date must be a valid date in YYYY-MM-DD format and not in the future.");
  if (body.notes !== undefined && body.notes !== null && (typeof body.notes !== "string" || body.notes.length > 500)) errors.push("notes must be text up to 500 characters.");
  return errors;
}
function payload(body) {
  return { activity: body.activity, amount_litres: Number(body.amount_litres), usage_date: body.usage_date, notes: (body.notes || "").trim() || null };
}
function dbError(res, error) {
  console.error("Supabase operation failed:", error.message || error);
  return res.status(500).json({ error: "The database operation failed. Check that database/schema.sql has been run and the project is configured." });
}
app.get("/api/health", (req, res) => res.json({ ok: true, databaseConfigured: Boolean(supabase), service: "water-usage-tracker-api" }));
app.get("/api/usage", configured, async (req, res) => {
  const { data, error } = await supabase.from("water_usage_entries").select("id,activity,amount_litres,usage_date,notes,created_at,updated_at").order("usage_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
  if (error) return dbError(res, error);
  res.json({ data });
});
app.post("/api/usage", configured, async (req, res) => {
  const errors = validateEntry(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" "), details: errors });
  const { data, error } = await supabase.from("water_usage_entries").insert(payload(req.body)).select("id,activity,amount_litres,usage_date,notes,created_at,updated_at").single();
  if (error) return dbError(res, error);
  res.status(201).json({ data });
});
app.get("/api/usage/:id", configured, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Entry ID must be a valid UUID." });
  const { data, error } = await supabase.from("water_usage_entries").select("id,activity,amount_litres,usage_date,notes,created_at,updated_at").eq("id", req.params.id).maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return res.status(404).json({ error: "Usage entry not found." });
  res.json({ data });
});
app.put("/api/usage/:id", configured, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Entry ID must be a valid UUID." });
  const errors = validateEntry(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" "), details: errors });
  const { data, error } = await supabase.from("water_usage_entries").update(payload(req.body)).eq("id", req.params.id).select("id,activity,amount_litres,usage_date,notes,created_at,updated_at").maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return res.status(404).json({ error: "Usage entry not found." });
  res.json({ data });
});
app.delete("/api/usage/:id", configured, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Entry ID must be a valid UUID." });
  const { data, error } = await supabase.from("water_usage_entries").delete().eq("id", req.params.id).select("id").maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return res.status(404).json({ error: "Usage entry not found." });
  res.json({ message: "Usage entry deleted successfully.", id: data.id });
});
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) return res.status(400).json({ error: "Invalid JSON request body." });
  if (err.message === "Origin is not allowed by CORS.") return res.status(403).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});
app.use((req, res) => res.status(404).json({ error: "Route not found." }));
app.listen(PORT, () => console.log(`Water Usage Tracker API listening at http://localhost:${PORT}`));
