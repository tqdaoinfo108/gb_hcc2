import { cookies } from "next/headers";
import { prisma } from "./prisma";

export interface SessionLocation { id: string; code: string; name: string }
export interface SessionUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  roles: string[];
  locations: SessionLocation[];
  locationIds: string[];
}

export interface Scope {
  user: SessionUser | null;
  isSuperAdmin: boolean;
  /** Locations the user may pick between (super admin = all). */
  availableLocations: SessionLocation[];
  /** Currently selected location id, or null = "all (in scope)". */
  selectedLocationId: string | null;
  /**
   * The effective location filter for queries:
   *  - null  → no filter (super admin viewing all locations)
   *  - []    → match nothing (a location admin with no assigned locations)
   *  - [...] → restrict to these location ids
   */
  scopeLocationIds: string[] | null;
}

/** Parse the logged-in user from the `hcc_user` cookie (set at login). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get("hcc_user")?.value;
  if (!raw) return null;
  try {
    const u = JSON.parse(raw);
    return {
      id: u.id, username: u.username, email: u.email, fullName: u.fullName,
      isSuperAdmin: !!u.isSuperAdmin, roles: u.roles ?? [],
      locations: u.locations ?? [], locationIds: u.locationIds ?? [],
    };
  } catch {
    return null;
  }
}

async function fetchAllLocations(): Promise<SessionLocation[]> {
  const rows = await prisma.kioskLocation.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true },
    orderBy: [{ province: "asc" }, { name: "asc" }],
  });
  return rows;
}

/**
 * Resolve the effective location scope for the current request, combining the
 * user's permissions with the selected location (`hcc_loc` cookie).
 */
export async function getScope(): Promise<Scope> {
  const user = await getSessionUser();
  const selected = (await cookies()).get("hcc_loc")?.value || null;

  if (!user) {
    return { user: null, isSuperAdmin: false, availableLocations: [], selectedLocationId: null, scopeLocationIds: [] };
  }

  if (user.isSuperAdmin) {
    const availableLocations = await fetchAllLocations();
    const sel = selected && selected !== "all" && availableLocations.some(l => l.id === selected) ? selected : null;
    return {
      user, isSuperAdmin: true, availableLocations,
      selectedLocationId: sel,
      scopeLocationIds: sel ? [sel] : null, // null = all locations
    };
  }

  // Location admin: limited to assigned locations.
  const mine = user.locationIds;
  const sel = selected && selected !== "all" && mine.includes(selected) ? selected : null;
  return {
    user, isSuperAdmin: false, availableLocations: user.locations,
    selectedLocationId: sel,
    scopeLocationIds: sel ? [sel] : (mine.length ? mine : ["__none__"]),
  };
}
