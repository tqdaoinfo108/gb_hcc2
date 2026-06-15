import { cookies } from "next/headers";

/** Server-side: build audit attribution headers from the session cookies so
 *  Next route handlers that proxy to the API carry actor + location for the
 *  API audit interceptor. */
export async function forwardAuditHeaders(): Promise<Record<string, string>> {
  const jar = await cookies();
  const h: Record<string, string> = {};
  const actor = jar.get("hcc_actor")?.value;
  if (actor) {
    const [id, name] = decodeURIComponent(actor).split("|");
    if (id) h["x-actor-id"] = id;
    if (name) h["x-actor-name"] = encodeURIComponent(name);
  }
  const loc = jar.get("hcc_loc")?.value;
  if (loc && loc !== "all") h["x-location-id"] = loc;
  return h;
}
