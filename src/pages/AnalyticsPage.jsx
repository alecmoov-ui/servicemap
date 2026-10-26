import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useStations, useApp } from '../lib/useStore.js'
import { fmtMoney } from '../lib/units.js'
import { reliabilityScore, acceptanceRate, completionRate, flagRate, oneTripRate, avgJobValue, PRODUCTS, pct } from '../lib/ratings.js'
import { complianceClass, complianceLabel, issueText } from '../lib/compliance.js'
import { locationCount } from '../lib/geo.js'

export default function AnalyticsPage() {
  const stations = useStations()
  const { region } = useApp()

  // Network-wide totals from dispatch requests + the service log (per-station perf summed).
  const totals = useMemo(() => {
    const t = { req: 0, resolved: 0, acc: 0, sent: 0, comp: 0, value: 0, flags: 0, oneTrip: 0 }
    for (const s of stations) {
      const p = s.perf || {}
      t.req += p.dispatchRequests || 0; t.resolved += p.resolvedRequests || 0; t.acc += p.dispatchAccepted || 0
      t.sent += p.dispatchSent || 0; t.comp += p.jobsCompleted || 0; t.value += p.totalValue || 0
      t.flags += p.flags || 0; t.oneTrip += p.oneTrip || 0
    }
    return t
  }, [stations])

  // Per-station performance table: anyone with a request or a logged ticket, best first.
  const perfRows = useMemo(
    () => stations
      .filter((s) => (s.perf?.dispatchRequests || 0) + (s.perf?.jobsCompleted || 0) > 0)
      .sort((a, b) => reliabilityScore(b.perf) - reliabilityScore(a.perf) || (b.perf?.jobsCompleted || 0) - (a.perf?.jobsCompleted || 0)),
    [stations]
  )

  // Coverage / capacity by state.
  const byState = useMemo(() => {
    const m = {}
    stations.forEach((s) => {
      m[s.state] = m[s.state] || { state: s.state, stations: 0 }
      m[s.state].stations++
    })
    return Object.values(m).sort((a, b) => b.stations - a.stations)
  }, [stations])

  // Product coverage across the network.
  const byProduct = useMemo(
    () =>
      PRODUCTS.map((p) => ({
        product: p.label,
        stations: stations.filter((s) => s.products?.[p.key]).length,
      })),
    [stations]
  )


  // Stations needing compliance attention (expired first, then warnings).
  const flagged = useMemo(() => {
    const rank = { expired: 0, warn: 1, ok: 2 }
    return stations
      .filter((s) => s.compliance && s.compliance.level !== 'ok')
      .sort((a, b) => rank[a.compliance.level] - rank[b.compliance.level])
  }, [stations])

  const acc = totals.resolved ? Math.round((totals.acc / totals.resolved) * 100) + '%' : '—'
  const comp = totals.sent ? Math.round((Math.min(totals.comp, totals.sent) / totals.sent) * 100) + '%' : '—'
  const flagPct = totals.comp ? Math.round((totals.flags / totals.comp) * 100) + '%' : '—'
  const avgValue = totals.comp && totals.value ? totals.value / totals.comp : null

  return (
    <div className="analytics">
      <div className="kpis">
        <Kpi
          label="Active locations (stations)"
          value={<>{locationCount(stations.filter((s) => s.status === 'active'))} <small>({stations.filter((s) => s.status === 'active').length})</small></>}
        />
        <Kpi label="Dispatch requests" value={totals.req} />
        <Kpi label="Acceptance rate" value={acc} />
        <Kpi label="Completion rate" value={comp} />
        <Kpi label="Flags" value={<>{totals.flags} <small>({flagPct})</small></>} />
        <Kpi label="Value of jobs" value={<>{fmtMoney(totals.value, region)} <small>avg {fmtMoney(avgValue, region)}</small></>} />
      </div>

      <div className="charts">
        <Panel title="Stations by state (capacity & gaps)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byState}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="state" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="stations" fill="#2d6cdf" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Product coverage (stations qualified per product)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byProduct}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="product" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="stations" fill="#1f9d55" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title={`Station performance (${perfRows.length} with activity)`}>
          {perfRows.length === 0 ? (
            <div className="empty">No activity yet. Press <b>Request dispatch</b> on a Map result and log completed tickets under Stations → Log.</div>
          ) : (
            <div className="table-wrap">
              <table className="table small perf-table">
                <thead>
                  <tr>
                    <th>Station</th><th>ST</th><th className="num">Score</th><th className="num">Req</th><th className="num">Accept</th>
                    <th className="num">Done</th><th className="num">Done %</th><th className="num">Value</th><th className="num">Avg/job</th>
                    <th className="num">Flags</th><th className="num">Flag %</th><th className="num">1-trip</th><th className="num">1-trip %</th>
                  </tr>
                </thead>
                <tbody>
                  {perfRows.map((s) => (
                    <tr key={s.id}>
                      <td>{s.company}</td>
                      <td>{s.state}</td>
                      <td className="num"><b>{reliabilityScore(s.perf)}</b></td>
                      <td className="num">{s.perf.dispatchRequests}</td>
                      <td className="num">{pct(acceptanceRate(s.perf))}</td>
                      <td className="num">{s.perf.jobsCompleted}</td>
                      <td className="num">{pct(completionRate(s.perf))}</td>
                      <td className="num">{fmtMoney(s.perf.totalValue, region)}</td>
                      <td className="num">{fmtMoney(avgJobValue(s.perf), region)}</td>
                      <td className="num">{s.perf.flags}</td>
                      <td className="num">{pct(flagRate(s.perf))}</td>
                      <td className="num">{s.perf.oneTrip}</td>
                      <td className="num">{pct(oneTripRate(s.perf))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={`Compliance & expirations (${flagged.length})`}>
          {flagged.length === 0 ? (
            <div className="empty">All stations are current — no expired/expiring insurance or contracts, and no missing heat-pump licenses.</div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Station</th><th>ST</th><th>Status</th><th>Issues</th></tr>
              </thead>
              <tbody>
                {flagged.map((s) => (
                  <tr key={s.id}>
                    <td>{s.company}</td>
                    <td>{s.state}</td>
                    <td><span className={'badge ' + complianceClass(s.compliance.level)}>{complianceLabel(s.compliance.level)}</span></td>
                    <td style={{ fontSize: 12 }}>{issueText(s.compliance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Kpi({ label, value }) {
  return (
    <div className="kpi">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  )
}
function Panel({ title, children }) {
  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      {children}
    </div>
  )
}
