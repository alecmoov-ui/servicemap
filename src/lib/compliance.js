// Display helpers for the server-computed station.compliance ({ level, issues }).
export const COMPLIANCE = {
  ok: { cls: 'active', label: '✓ OK' },
  warn: { cls: 'paused', label: '⚠ Review' },
  expired: { cls: 'issue', label: '✕ Action' },
}

export const complianceLabel = (level) => (COMPLIANCE[level] || COMPLIANCE.ok).label
export const complianceClass = (level) => (COMPLIANCE[level] || COMPLIANCE.ok).cls
export const issueText = (compliance) => (compliance?.issues || []).map((i) => i.message).join(' · ')
