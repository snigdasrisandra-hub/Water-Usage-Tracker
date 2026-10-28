/* WaterWise frontend: all usage entries are loaded from the Express API. */
(() => {
  "use strict";
  const API_BASE = (window.WATER_TRACKER_API || "http://localhost:3000/api").replace(/\/$/, "");
  const $ = (id) => document.getElementById(id);
  const form = $("usage-form");
  const els = {
    id: $("entry-id"), activity: $("activity"), amount: $("amount"), date: $("usage-date"), notes: $("notes"),
    formMessage: $("form-message"), save: $("save-btn"), cancel: $("cancel-edit"), formTitle: $("form-title"),
    body: $("entries-body"), empty: $("empty-state"), listMessage: $("list-message"), search: $("search-input"),
    activityFilter: $("activity-filter"), sort: $("sort-filter"), status: $("connection-status")
  };
  let entries = [];
  let busy = false;
  const todayISO = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  };
  els.date.value = todayISO();

  function setStatus(mode, text) {
    els.status.className = `status ${mode}`;
    els.status.innerHTML = `<i></i>${escapeHtml(text)}`;
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function showFormMessage(message, type = "") {
    els.formMessage.textContent = message;
    els.formMessage.className = `form-message ${type}`.trim();
  }
  function setBusy(value) {
    busy = value;
    els.save.disabled = value;
    els.save.style.opacity = value ? ".65" : "1";
    els.save.innerHTML = value ? "Saving…" : (els.id.value ? "Update entry ↗" : "Save entry ↗");
  }
  async function request(path = "", options = {}) {
    let response;
    try {
      response = await fetch(`${API_BASE}/usage${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) }
      });
    } catch {
      throw new Error("Could not reach the backend. Check that the server is running at " + API_BASE + ".");
    }
    let data = {};
    try { data = await response.json(); } catch { /* non-JSON response */ }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }
  function dayDiff(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    const now = new Date(`${todayISO()}T00:00:00`);
    return Math.round((now - d) / 86400000);
  }
  function renderStats() {
    const valid = entries.filter(e => Number.isFinite(Number(e.amount_litres)));
    const today = valid.filter(e => e.usage_date === todayISO());
    const week = valid.filter(e => dayDiff(e.usage_date) >= 0 && dayDiff(e.usage_date) < 7);
    const total = arr => arr.reduce((sum, e) => sum + Number(e.amount_litres), 0);
    $("today-total").textContent = total(today).toLocaleString(undefined,{maximumFractionDigits:1});
    $("today-entry-count").textContent = `${today.length} ${today.length === 1 ? "entry" : "entries"} today`;
    $("week-total").textContent = total(week).toLocaleString(undefined,{maximumFractionDigits:1});
    $("daily-average").textContent = (total(week) / 7).toLocaleString(undefined,{maximumFractionDigits:1});
    $("entry-count").textContent = valid.length.toLocaleString();
  }
  function visibleEntries() {
    const query = els.search.value.trim().toLowerCase();
    const activity = els.activityFilter.value;
    return [...entries].filter(e =>
      (!activity || e.activity === activity) &&
      (!query || `${e.activity} ${e.notes || ""} ${e.usage_date}`.toLowerCase().includes(query))
    ).sort((a,b) => {
      if (els.sort.value === "oldest") return a.usage_date.localeCompare(b.usage_date) || String(a.created_at||"").localeCompare(String(b.created_at||""));
      if (els.sort.value === "highest") return Number(b.amount_litres) - Number(a.amount_litres);
      if (els.sort.value === "lowest") return Number(a.amount_litres) - Number(b.amount_litres);
      return b.usage_date.localeCompare(a.usage_date) || String(b.created_at||"").localeCompare(String(a.created_at||""));
    });
  }
  function renderEntries() {
    const shown = visibleEntries();
    els.body.innerHTML = shown.map(e => `<tr>
      <td><span class="activity-dot"></span>${escapeHtml(e.activity)}</td>
      <td>${escapeHtml(e.usage_date)}</td>
      <td class="amount-cell">${Number(e.amount_litres).toLocaleString(undefined,{maximumFractionDigits:2})} L</td>
      <td>${escapeHtml(e.notes || "—")}</td>
      <td><div class="row-actions"><button class="icon-btn" type="button" data-action="edit" data-id="${escapeHtml(e.id)}" aria-label="Edit ${escapeHtml(e.activity)}">Edit</button><button class="icon-btn delete" type="button" data-action="delete" data-id="${escapeHtml(e.id)}" aria-label="Delete ${escapeHtml(e.activity)}">Delete</button></div></td>
    </tr>`).join("");
    els.empty.classList.toggle("hidden", shown.length !== 0);
    $("result-count").textContent = `${shown.length} ${shown.length === 1 ? "entry" : "entries"}`;
    $("list-message").textContent = "";
    document.querySelector(".table-wrap").classList.toggle("hidden", shown.length === 0);
  }
  async function loadEntries() {
    setStatus("", "Loading data…");
    $("refresh-btn").disabled = true;
    try {
      const data = await request();
      entries = Array.isArray(data.data) ? data.data : [];
      setStatus("online", "Backend connected");
      renderStats(); renderEntries();
    } catch (err) {
      setStatus("offline", "Connection issue");
      els.listMessage.textContent = err.message;
      entries = [];
      renderStats(); renderEntries();
      els.empty.classList.remove("hidden");
      els.empty.querySelector("h3").textContent = "Could not load entries";
      els.empty.querySelector("p").textContent = "Check the backend and Supabase setup, then refresh.";
    } finally {
      $("refresh-btn").disabled = false;
    }
  }
  function resetForm() {
    form.reset(); els.id.value = ""; els.date.value = todayISO();
    els.formTitle.textContent = "Log water usage"; els.cancel.classList.add("hidden");
    els.save.innerHTML = "Save entry ↗"; showFormMessage("");
  }
  function editEntry(id) {
    const e = entries.find(item => String(item.id) === String(id));
    if (!e) return;
    els.id.value = e.id; els.activity.value = e.activity; els.amount.value = e.amount_litres;
    els.date.value = e.usage_date; els.notes.value = e.notes || "";
    els.formTitle.textContent = "Edit water entry"; els.save.innerHTML = "Update entry ↗";
    els.cancel.classList.remove("hidden"); showFormMessage("");
    $("add-entry").scrollIntoView({behavior:"smooth",block:"start"});
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const amount = Number(els.amount.value);
    if (!els.activity.value) return showFormMessage("Please choose an activity.", "error");
    if (!Number.isFinite(amount) || amount < 0.1 || amount > 100000) return showFormMessage("Enter an amount between 0.1 and 100,000 litres.", "error");
    if (!els.date.value || els.date.value > todayISO()) return showFormMessage("Choose a valid date that is not in the future.", "error");
    const payload = { activity: els.activity.value, amount_litres: amount, usage_date: els.date.value, notes: els.notes.value.trim() };
    setBusy(true); showFormMessage("");
    try {
      const id = els.id.value;
      await request(id ? `/${encodeURIComponent(id)}` : "", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
      resetForm(); showFormMessage(id ? "Entry updated successfully." : "Entry saved successfully.", "success");
      await loadEntries();
      $("form-message").textContent = id ? "Entry updated successfully." : "Entry saved successfully.";
      $("form-message").className = "form-message success";
    } catch (err) { showFormMessage(err.message, "error"); }
    finally { setBusy(false); }
  });
  els.cancel.addEventListener("click", resetForm);
  els.body.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "edit") return editEntry(id);
    const entry = entries.find(e => String(e.id) === String(id));
    if (!entry || !window.confirm(`Delete the ${entry.activity} entry (${entry.amount_litres} L)? This cannot be undone.`)) return;
    button.disabled = true;
    try { await request(`/${encodeURIComponent(id)}`, { method: "DELETE" }); await loadEntries(); }
    catch (err) { els.listMessage.textContent = err.message; button.disabled = false; }
  });
  ["input","change"].forEach(type => {
    els.search.addEventListener(type, renderEntries);
    els.activityFilter.addEventListener(type, renderEntries);
    els.sort.addEventListener(type, renderEntries);
  });
  $("refresh-btn").addEventListener("click", loadEntries);
  loadEntries();
})();