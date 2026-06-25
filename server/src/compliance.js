// Compliance / expiration evaluation for a station. Surfaces lapses before they
// bite: expired or soon-to-expire insurance & contracts, heat-pump centers without
// an HVAC license on file, and missing agreement documents.
//
// Returned shape: { level: 'ok'|'warn'|'expired', issues: [{ severity, message }] }
// level = worst severity present ('info' never raises level above 'ok').

const SOON_DAYS = 45

function daysUntil(dateStr, now) {
  if (!dateStr) return null
  const t = new Date(dateStr + 'T00:00:00Z').getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((t - now) / 86400000)
}

export function computeCompliance(station, docTypes = new Set(), now = Date.now()) {
  const issues = []
  const add = (severity, message) => issues.push({ severity, message })

  // Insurance
  const ins = daysUntil(station.insuranceExpiry, now)
  if (station.insuranceExpiry == null) add('info', 'No insurance expiry date on file')
  else if (ins < 0) add('expired', `Insurance expired ${-ins} day(s) ago`)
  else if (ins <= SOON_DAYS) add('warn', `Insurance expires in ${ins} day(s)`)

  // Contract (only flag if a date is on file)
  const con = daysUntil(station.contractExpiry, now)
  if (con != null) {
    if (con < 0) add('expired', `Contract expired ${-con} day(s) ago`)
    else if (con <= SOON_DAYS) add('warn', `Contract expires in ${con} day(s)`)
  }

  // Only REFRIGERANT heat-pump work requires an HVAC license + EPA 608.
  // Electrical-only heat-pump centers do not.
  if (station.products?.heatPumpRefrigerant && !station.hvacLicense) {
    add('warn', 'Refrigerant heat-pump work qualified but no HVAC license on file')
  }

  // Missing agreement documents.
  const missing = []
  if (!docTypes.has('contract')) missing.push('Contract')
  if (!docTypes.has('schedule_a')) missing.push('Schedule A')
  if (!docTypes.has('insurance')) missing.push('Insurance COI')
  if (station.products?.heatPumpRefrigerant && !docTypes.has('hvac_license')) missing.push('HVAC License')
  if (missing.length) add('info', `Missing documents: ${missing.join(', ')}`)

  const level = issues.some((i) => i.severity === 'expired')
    ? 'expired'
    : issues.some((i) => i.severity === 'warn')
      ? 'warn'
      : 'ok'
  return { level, issues }
}
