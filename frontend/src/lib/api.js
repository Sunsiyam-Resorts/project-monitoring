// The portal API: GET /api/index?action=… or POST with a JSON body, as in the legacy client.
export async function api(action, body) {
  const r = await fetch("/api/index?action=" + action, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "Request failed");
  return j;
}
