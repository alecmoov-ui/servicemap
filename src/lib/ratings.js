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

export function acceptanceRate(perf) {
  if (!perf || !perf.dispatchRequests) return null
  return perf.dispatchAccepted / perf.dispatchRequests
}

export function completionRate(perf) {
  if (!perf || !perf.dispatchAccepted) return null
  return perf.jobsCompleted / perf.dispatchAccepted
}

// Composite 0–100 reliability score. New stations (no history) get a neutral
// baseline so they are not buried — they surface for vetting opportunities.
export function reliabilityScore(perf) {
  const acc = acceptanceRate(perf)
  const comp = completionRate(perf)
  if (acc == null) return 60 // unproven baseline
  const volumeBoost = Math.min((perf.dispatchRequests || 0) / 20, 1) * 10
  return Math.round(acc * 55 + (comp ?? 0.8) * 35 + volumeBoost)
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
