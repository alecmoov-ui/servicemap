// Back-compat shim: the data layer now lives in AppContext (backed by the API).
// Re-exported here so existing page imports keep working.
export { useStations, useDispatches, useRole, useApp } from './AppContext.jsx'
