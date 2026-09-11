// Role-based permissions. Roles are ENFORCED on the server (server/src/auth.js);
// this mirror gates the UI. Keep the two `can` sets in sync.

const FULL = { viewAnalytics: true, logService: true, exportData: true, addStations: true, editStations: true, deleteStations: true, backups: true, viewAudit: true, manageUsers: true }
const VIEW_ONLY = { viewAnalytics: true, logService: false, exportData: false, addStations: false, editStations: false, deleteStations: false, backups: false, viewAudit: false, manageUsers: false }

export const ROLES = {
  admin: {
    label: 'Network Admin',
    blurb: 'Full control: stations, service log, exports, backups, activity log, and users.',
    can: { ...FULL },
  },
  dtm: {
    label: 'Territory Manager',
    blurb: 'Same permissions as Network Admin.',
    can: { ...FULL },
  },
  dispatch: {
    label: 'Dispatch',
    blurb: 'View-only: browse and sort the map, coverage, analytics and station list.',
    can: { ...VIEW_ONLY },
  },
  sales: {
    label: 'Sales',
    blurb: 'View-only: browse and sort the map, coverage, analytics and station list.',
    can: { ...VIEW_ONLY },
  },
}

// Capabilities in display order, with friendly labels (for the permissions matrix).
export const CAPABILITIES = [
  ['viewAnalytics', 'View map & analytics'],
  ['logService', 'Log service tickets'],
  ['exportData', 'Export CSV'],
  ['addStations', 'Add stations'],
  ['editStations', 'Edit stations'],
  ['deleteStations', 'Remove stations'],
  ['backups', 'Database backups'],
  ['viewAudit', 'View activity log'],
  ['manageUsers', 'Manage users'],
]

export function can(role, action) {
  return !!ROLES[role]?.can[action]
}
