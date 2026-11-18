// The portal API: GET /api/index?action=… or POST with a JSON body, as in the legacy client.
// background: a request the app makes on its own (the 30-second refresh). It does not count
// as user activity, so it does not keep an idle session alive.
export async function api(action, body, { background = false } = {}) {
  const headers = body ? { "Content-Type": "application/json" } : {};
  if (background) headers["X-Portal-Background"] = "1";
  const r = await fetch("/api/index?action=" + action, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "Request failed");
  return j;
}
