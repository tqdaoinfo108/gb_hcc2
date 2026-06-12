/** Client-side: build audit attribution headers from non-httpOnly cookies
 *  (`hcc_actor` = "id|name", `hcc_loc` = selected location id). Attach these to
 *  CRUD fetch() calls so the API audit log records who + where. */
export function auditHeaders(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const get = (k: string) =>
    document.cookie.split("; ").find((c) => c.startsWith(k + "="))?.split("=").slice(1).join("=");
  const actor = decodeURIComponent(get("hcc_actor") ?? "");
  const loc = decodeURIComponent(get("hcc_loc") ?? "");
  const [id, name] = actor.split("|");
  const h: Record<string, string> = {};
  if (id) h["x-actor-id"] = id;
  if (name) h["x-actor-name"] = encodeURIComponent(name);
  if (loc && loc !== "all") h["x-location-id"] = loc;
  return h;
}
