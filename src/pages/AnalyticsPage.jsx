import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  FunnelChart, Funnel, LabelList, Cell,
} from 'recharts'
import { useStations, useDispatches } from '../lib/useStore.js'
import { reliabilityScore, acceptanceRate, completionRate, PRODUCTS } from '../lib/ratings.js'

export default function AnalyticsPage() {
  const stations = useStations()
  const dispatches = useDispatches()

  // Network-wide funnel from the seeded performance counters + live dispatches.
  const totals = useMemo(() => {
    const base = stations.reduce(
      (a, s) => ({
        req: a.req + (s.perf?.dispatchRequests || 0),
        acc: a.acc + (s.perf?.dispatchAccepted || 0),
        comp: a.comp + (s.perf?.jobsCompleted || 0),
      }),
      { req: 0, acc: 0, comp: 0 }
    )
    base.req += dispatches.length
    base.acc += dispatches.filter((d) => ['accepted', 'completed'].includes(d.status)).length
    base.comp += dispatches.filter((d) => d.status === 'completed').length
    return base
  }, [stations, dispatches])

  const funnel = [
    { name: 'Requested', value: totals.req, fill: '#2d6cdf' },
    { name: 'Accepted', value: totals.acc, fill: '#1f9d55' },
    { name: 'Completed', value: totals.comp, fill: '#e0701a' },
  ]

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

  const leaderboard = useMemo(
    () =>
      [...stations]
        .sort((a, b) => reliabilityScore(b.perf) - reliabilityScore(a.perf))
        .slice(0, 10),
    [stations]
  )

  // Avg time-to-resolution from live dispatches that completed.
  const avgResolution = useMemo(() => {
    const done = dispatches.filter((d) => d.status === 'completed' && d.timeline?.length > 1)
    if (!done.length) return null
    const hrs = done.map((d) => {
      const t0 = new Date(d.timeline[0].at).getTime()
      const t1 = new Date(d.timeline[d.timeline.length - 1].at).getTime()
      return (t1 - t0) / 36e5
    })
    return hrs.reduce((a, b) => a + b, 0) / hrs.length
  }, [dispatches])

  const acc = totals.req ? Math.round((totals.acc / totals.req) * 100) : 0
  const comp = totals.acc ? Math.round((totals.comp / totals.acc) * 100) : 0

  return (
    <div className="analytics">
      <div className="kpis">
        <Kpi label="Active stations" value={stations.filter((s) => s.status === 'active').length} />
        <Kpi label="Dispatch requests" value={totals.req} />
        <Kpi label="Acceptance rate" value={acc + '%'} />
        <Kpi label="Completion rate" value={comp + '%'} />
        <Kpi label="Avg resolution" value={avgResolution != null ? avgResolution.toFixed(1) + ' h' : '—'} />
      </div>

      <div className="charts">
        <Panel title="Dispatch funnel (requested → accepted → completed)">
          <ResponsiveContainer width="100%" height={240}>
            <FunnelChart>
              <Tooltip />
              <Funnel dataKey="value" data={funnel} isAnimationActive>
                <LabelList position="right" fill="#222" stroke="none" dataKey="name" />
                <LabelList position="left" fill="#222" stroke="none" dataKey="value" />
                {funnel.map((e, i) => (
                  <Cell key={i} fill={e.fill} />
                ))}
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </Panel>

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

        <Panel title="Reliability leaderboard">
          <table className="table">
            <thead>
              <tr><th>Station</th><th>ST</th><th>Score</th><th>Accept</th><th>Complete</th></tr>
            </thead>
            <tbody>
              {leaderboard.map((s) => (
                <tr key={s.id}>
                  <td>{s.company}</td>
                  <td>{s.state}</td>
                  <td><b>{reliabilityScore(s.perf)}</b></td>
                  <td>{acceptanceRate(s.perf) != null ? Math.round(acceptanceRate(s.perf) * 100) + '%' : '—'}</td>
                  <td>{completionRate(s.perf) != null ? Math.round(completionRate(s.perf) * 100) + '%' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
