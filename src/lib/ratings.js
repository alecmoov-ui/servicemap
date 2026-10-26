// Reliability scoring used to rank stations in the dispatch list and in analytics.

export const PRODUCTS = [
  { key: 'pumps', label: 'Pump' },
  { key: 'filters', label: 'Filter' },
  { key: 'saltSystems', label: 'Salt System' },
  { key: 'roboticCleaners', label: 'Cleaner' },
  { key: 'lights', label: 'Light' },
  // Heat-pump work is split: electrical fixes (most issues; no HVAC license needed)
  // vs refrigerant fixes (require HVAC license + EPA 608 — see compliance checks).
  { key: 'heatPumpElectrical', label: 'Heat Pump – Electrical' },
  { key: 'heatPumpRefrigerant', label: 'Heat Pump – Refrigerant' },
]

export function productLabel(key) {
  return PRODUCTS.find((p) => p.key === key)?.label ?? key
}

// Rates derived from perf (see server db.js ZERO_PERF). null = no data yet.
// Acceptance: of requests with an outcome, how many were accepted (incl. "not needed").
export function acceptanceRate(perf) {
  if (!perf || !perf.resolvedRequests) return null
  return perf.dispatchAccepted / perf.resolvedRequests
}
// Completion: of requests the station accepted AND was sent on, how many were logged done.
// "Not needed" (another station got the job) is excluded, so nobody is penalised for it.
export function completionRate(perf) {
  if (!perf || !perf.dispatchSent) return null
  return Math.min(1, perf.jobsCompleted / perf.dispatchSent)
}
export function flagRate(perf) {
  if (!perf || !perf.jobsCompleted) return null
  return perf.flags / perf.jobsCompleted
}
export function oneTripRate(perf) {
  if (!perf || !perf.jobsCompleted) return null
  return perf.oneTrip / perf.jobsCompleted
}
export function avgJobValue(perf) {
  if (!perf || !perf.jobsCompleted || !perf.totalValue) return null
  return perf.totalValue / perf.jobsCompleted
}

// Composite 0–100 reliability score, derived purely from requests + the service log:
// completion 35 · acceptance 20 · one-trip 20 · (1 − flag rate) 15 · volume up to 10.
// No history at all = 0 — scores are earned, not assumed. Ties rank by distance.
export function reliabilityScore(perf) {
  if (!perf || (!perf.resolvedRequests && !perf.jobsCompleted)) return 0
  const acc = acceptanceRate(perf) ?? 0
  const comp = completionRate(perf) ?? 0
  const trip = oneTripRate(perf) ?? 0
  const clean = 1 - (flagRate(perf) ?? 0)
  const volume = Math.min((perf.jobsCompleted || 0) / 20, 1)
  return Math.round(comp * 35 + acc * 20 + trip * 20 + clean * 15 + volume * 10)
}

// 0–5 star rating derived from the composite score.
export function starRating(perf) {
  return Math.round((reliabilityScore(perf) / 100) * 5 * 2) / 2 // nearest 0.5
}

export function stars(rating) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0))
}

export const pct = (r) => (r == null ? '—' : Math.round(r * 100) + '%')
