import { Routes, Route, NavLink } from 'react-router-dom'
import {
  Server, Network, DatabaseBackup, GitCompare, ShieldCheck,
  Terminal, CalendarClock, GitGraph, ScrollText, Settings, Activity
} from 'lucide-react'
import { cn } from './lib/utils'

import InventoryPage from './pages/InventoryPage'
import ScanPage from './pages/ScanPage'
import BackupPage from './pages/BackupPage'
import DiffPage from './pages/DiffPage'
import AuditPage from './pages/AuditPage'
import PlaybookPage from './pages/PlaybookPage'
import SchedulerPage from './pages/SchedulerPage'
import TopologyPage from './pages/TopologyPage'
import LogsPage from './pages/LogsPage'
import SettingsPage from './pages/SettingsPage'

const navItems = [
  { to: '/', icon: Server, label: 'Inventaire' },
  { to: '/scan', icon: Network, label: 'Découverte' },
  { to: '/backup', icon: DatabaseBackup, label: 'Backups' },
  { to: '/diff', icon: GitCompare, label: 'Comparateur' },
  { to: '/audit', icon: ShieldCheck, label: 'Audit' },
  { to: '/playbook', icon: Terminal, label: 'Playbooks' },
  { to: '/scheduler', icon: CalendarClock, label: 'Planificateur' },
  { to: '/topology', icon: GitGraph, label: 'Topologie' },
  { to: '/logs', icon: ScrollText, label: 'Journaux' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
]

export default function App() {
  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar */}
      <nav className="flex flex-col w-[220px] bg-slate-900 border-r border-slate-800 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-slate-800">
          <Activity className="w-5 h-5 text-blue-400" />
          <span className="font-semibold text-white text-sm">NetworkTools</span>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border-r-2 border-blue-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800">
          <p className="text-xs text-slate-600">v1.0.0</p>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<InventoryPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/backup" element={<BackupPage />} />
          <Route path="/diff" element={<DiffPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/playbook" element={<PlaybookPage />} />
          <Route path="/scheduler" element={<SchedulerPage />} />
          <Route path="/topology" element={<TopologyPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
