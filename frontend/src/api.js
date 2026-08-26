/**
 * api.js
 * ──────────────────────────────────────────────────────────────
 * Every call to the backend lives here.
 *
 * React components never call fetch() directly — they call these
 * functions. If the backend address or response shape changes, only
 * this file needs editing.
 */

const BASE = "http://localhost:8000";

/** Confirm the backend is running. Useful before a demonstration. */
export async function health() {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error("Backend is not responding");
  return res.json();
}

/** Every saved model — feeds the "Select existing model" screen. */
export async function listModels() {
  const res = await fetch(`${BASE}/models`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.models;
}

/** One model's categories. */
export async function getModel(modelId) {
  const res = await fetch(`${BASE}/models/${modelId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * Upload a CSV and get its column names back.
 * Feeds the "which column contains the comments?" dropdown.
 */
export async function inspectCsv(file) {
  const form = new FormData();      // FormData is how files are sent
  form.append("file", file);

  const res = await fetch(`${BASE}/inspect`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();                // { columns, rowCount, suggested }
}

/**
 * Run a dataset through a model.
 *
 * Synchronous — this call takes twenty seconds or so while the backend
 * embeds each clause. The caller should show the animation while
 * awaiting it, then navigate when it resolves.
 */
export async function analyse(modelId, file, column, depVar, limit = 200) {
  const form = new FormData();
  form.append("file", file);
  form.append("column", column);
  form.append("dep_var", depVar || "");
  form.append("limit", String(limit));

  const res = await fetch(`${BASE}/models/${modelId}/analyse`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();                // { result_id, report }
}

/** Fetch a report again by id. */
export async function getResults(resultId) {
  const res = await fetch(`${BASE}/results/${resultId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** The per-comment table. */
export async function getRows(resultId, limit = 50) {
  const res = await fetch(`${BASE}/results/${resultId}/rows?limit=${limit}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.rows;
}

/** Trigger a CSV download in the browser. */
export function exportCsv(resultId) {
  window.location.href = `${BASE}/results/${resultId}/export`;
}
