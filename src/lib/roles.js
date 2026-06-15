// Role-based permissions (prototype). In production these checks live on the
// backend; here they gate UI actions so non-admins cannot damage master data.

export const ROLES = {
  admin: {
    label: 'Admin',
    blurb: 'Full control: edit master list, manage users, view activity log, export/backup, all analytics.',
    can: { editStations: true, addStations: true, logService: true, viewAnalytics: true, manageUsers: true, viewAudit: true, exportData: true },
  },
  dtm: {
    label: 'DTM (Territory Mgr)',
    blurb: 'Manage their territory: add/vet stations, log service events, export, see coverage gaps.',
    can: { editStations: true, addStations: true, logService: true, viewAnalytics: true, manageUsers: false, viewAudit: false, exportData: true },
  },
  dispatch: {
    label: 'Dispatch',
    blurb: 'Find authorized centers and log service outcomes from Zendesk. Read-only on the master list.',
    can: { editStations: false, addStations: false, logService: true, viewAnalytics: true, manageUsers: false, viewAudit: false, exportData: false },
  },
}

export function can(role, action) {
  return !!ROLES[role]?.can[action]
}
