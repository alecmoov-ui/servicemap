import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { ROLES, can } from './lib/roles.js'
import { useApp } from './lib/AppContext.jsx'
import MapPage from './pages/MapPage.jsx'
import CoveragePage from './pages/CoveragePage.jsx'
import AnalyticsPage from './pages/AnalyticsPage.jsx'
import StationsPage from './pages/StationsPage.jsx'
import UsersPage from './pages/UsersPage.jsx'
import ActivityPage from './pages/ActivityPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ChangePassword from './pages/ChangePassword.jsx'
import { useState } from 'react'

export default function App() {
  const { user, authLoading } = useApp()

  if (authLoading) {
    return <div className="boot">Loading…</div>
  }

  if (!user) return <LoginPage />

  return <Shell />
}

function Shell() {
  const { user, logout } = useApp()
  const navigate = useNavigate()
  const [changingPw, setChangingPw] = useState(false)

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
            Stations
          </NavLink>
          {can(user.role, 'manageUsers') && (
            <NavLink to="/users" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              Users
            </NavLink>
          )}
          {can(user.role, 'viewAudit') && (
            <NavLink to="/activity" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              Activity
            </NavLink>
          )}
        </nav>

        <div className="role-switch">
          <div className="who">
            <div className="who-name">{user.name}</div>
            <div className="who-role">{ROLES[user.role]?.label || user.role}</div>
          </div>
          <button className="ghost small" onClick={() => setChangingPw(true)}>Password</button>
          <button className="ghost small" onClick={logout}>Sign out</button>
        </div>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/coverage" element={<CoveragePage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/stations" element={<StationsPage />} />
          {can(user.role, 'manageUsers') && <Route path="/users" element={<UsersPage />} />}
          {can(user.role, 'viewAudit') && <Route path="/activity" element={<ActivityPage />} />}
        </Routes>
      </main>

      {changingPw && <ChangePassword onClose={() => setChangingPw(false)} />}
    </div>
  )
}
