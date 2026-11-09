/**
 * Absolute URLs of the ops console pages. The shell mounts `opsRoutes` at the portal root, so these are
 * root-relative. Change OPS_BASE if the shell ever nests the routes under a prefix.
 */
export const OPS_BASE = '';

export const opsPaths = {
  dashboard: `${OPS_BASE}/dashboard`,
  users: `${OPS_BASE}/users`,
  staff: `${OPS_BASE}/staff`,
  hospitals: `${OPS_BASE}/hospitals`,
  hospital: (id: string) => `${OPS_BASE}/hospitals/${encodeURIComponent(id)}`,
  agents: `${OPS_BASE}/agents`,
  cases: `${OPS_BASE}/cases`,
  case: (id: string) => `${OPS_BASE}/cases/${encodeURIComponent(id)}`,
  bookings: `${OPS_BASE}/bookings`,
  travel: `${OPS_BASE}/travel`,
  catalog: `${OPS_BASE}/catalog`,
  content: `${OPS_BASE}/content`,
  settings: `${OPS_BASE}/settings`,
  website: `${OPS_BASE}/settings/website`,
  audit: `${OPS_BASE}/audit-logs`,
  messages: `${OPS_BASE}/messages`,
  moderation: `${OPS_BASE}/moderation`,
  enquiries: `${OPS_BASE}/enquiries`,
} as const;
