import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { ROLES } from './lib/roles.js'
import { setRole, resetAll } from './lib/store.js'
import { useRole, useDispatches } from './lib/useStore.js'
import MapPage from './pages/MapPage.jsx'
import CoveragePage from './pages/CoveragePage.jsx'
import AnalyticsPage from './pages/AnalyticsPage.jsx'
import StationsPage from './pages/StationsPage.jsx'
import RespondPage from './pages/RespondPage.jsx'

export default function App() {
  const role = useRole()
  const dispatches = useDispatches()
  const navigate = useNavigate()
  const openCount = dispatches.filter((d) => ['requested', 'accepted'].includes(d.status)).length

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={() => navigate('/')}>
          <span className="brand-mark">◎</span>
          <div>
            <div className="brand-name">Moov Service Network</div>
            <div className="brand-sub">US Warranty Dispatch &amp; Analytics</div>
          </div>
        </div>

        <nav className="tabs">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            Map &amp; Dispatch
          </NavLink>
          <NavLink to="/coverage" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            Zone Coverage
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            Analytics
          </NavLink>
          <NavLink to="/stations" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            Stations {openCount ? <span className="pill">{openCount} open</span> : null}
          </NavLink>
        </nav>

        <div className="role-switch">
          <label>Signed in as</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} title="Demo role switcher">
            {Object.entries(ROLES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button className="ghost small" title="Reset demo data" onClick={() => { if (confirm('Reset all demo edits & dispatches to the clean master list?')) resetAll() }}>
            Reset
          </button>
        </div>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/coverage" element={<CoveragePage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/stations" element={<StationsPage />} />
          <Route path="/respond/:id/:action" element={<RespondPage />} />
        </Routes>
      </main>
    </div>
  )
}
