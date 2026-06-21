import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Users, Download, UserCog, Menu, X, LayoutGrid } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'

const navItems = [
  { to: '/', label: '场次管理', icon: LayoutDashboard },
  { to: '/roster', label: '名单管理', icon: Users },
  { to: '/templates', label: '排座模板', icon: LayoutGrid },
  { to: '/export', label: '导出', icon: Download },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { currentRole, toggleRole } = useAppStore()

  return (
    <div className="flex h-screen bg-slate-100">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-[#1e293b] text-white flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-700">
          <LayoutDashboard className="w-6 h-6 text-cyan-400" />
          <span className="text-lg font-bold tracking-wide">实验排座系统</span>
        </div>

        <nav className="flex-1 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm transition-colors duration-200 ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-400 border-r-2 border-cyan-400'
                    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3 px-2 py-2">
            <UserCog className="w-5 h-5 text-slate-400" />
            <span className="text-sm text-slate-400">当前角色</span>
          </div>
          <button
            onClick={toggleRole}
            className="w-full mt-2 flex items-center justify-between px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors"
          >
            <span className={`text-sm ${currentRole === 'admin' ? 'text-cyan-400' : 'text-amber-400'}`}>
              {currentRole === 'admin' ? '管理员' : '助教'}
            </span>
            <div
              className={`relative w-10 h-5 rounded-full transition-colors ${
                currentRole === 'admin' ? 'bg-cyan-500' : 'bg-amber-500'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  currentRole === 'admin' ? 'left-0.5' : 'left-[22px]'
                }`}
              />
            </div>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 lg:px-6 gap-4 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex-1" />
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              currentRole === 'admin'
                ? 'bg-cyan-100 text-cyan-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {currentRole === 'admin' ? '管理员' : '助教'}
          </span>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
