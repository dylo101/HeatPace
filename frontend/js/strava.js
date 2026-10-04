export async function api(path, options = {}) {
  let response;
  try { response = await fetch(`/api/${path}`, { credentials: "same-origin", ...options, signal: AbortSignal.timeout(120000) }); }
  catch { throw new Error("Couldn’t reach HeatPace. Your calculator and demo still work. Try again shortly."); }
  let body;
  try { body = await response.json(); }
  catch { throw new Error("The connection service is unavailable. Your calculator and demo still work."); }
  if (!response.ok) {
    const error = new Error(body.error || "Couldn’t complete this request. Try again.");
    error.status = response.status;
    throw error;
  }
  return body;
}
