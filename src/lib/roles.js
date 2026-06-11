// Role-based permissions (prototype). In production these checks live on the
// backend; here they gate UI actions so non-admins cannot damage master data.

export const ROLES = {
  admin: {
    label: 'Admin',
    blurb: 'Full control: edit master list, manage users, view activity log, all analytics.',
    can: { editStations: true, addStations: true, dispatch: true, viewAnalytics: true, manageUsers: true, viewAudit: true },
  },
  dtm: {
    label: 'DTM (Territory Mgr)',
    blurb: 'Manage their territory: add/vet stations, dispatch, see coverage gaps.',
    can: { editStations: true, addStations: true, dispatch: true, viewAnalytics: true, manageUsers: false, viewAudit: false },
  },
  dispatch: {
    label: 'Dispatch',
    blurb: 'Send dispatch requests and track them. Read-only on the master list.',
    can: { editStations: false, addStations: false, dispatch: true, viewAnalytics: true, manageUsers: false, viewAudit: false },
  },
}

export function can(role, action) {
  return !!ROLES[role]?.can[action]
}
