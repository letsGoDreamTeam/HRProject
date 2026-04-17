import { Link, Outlet, useLocation } from 'react-router-dom'

const NAV_SECTIONS = [
  {
    label: 'OVERVIEW',
    items: [{ to: '/admin/dashboard', icon: '⊞', label: '시스템 대시보드' }],
  },
  {
    label: 'MANAGEMENT',
    items: [{ to: '/admin/accounts', icon: '🛡', label: '계정 및 권한 관리' }],
  },
]

export function AdminLayout() {
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar */}
      <aside className="flex w-56 flex-shrink-0 flex-col bg-[#1a1f2e] text-white">
        <div className="px-5 py-6">
          <div className="text-xs font-bold tracking-widest text-slate-400">ADMIN</div>
          <div className="mt-1 text-sm font-semibold text-white">HR Intelligence</div>
        </div>
        <nav className="flex-1 space-y-6 px-3">
          {NAV_SECTIONS.map((sec) => (
            <div key={sec.label}>
              <div className="mb-2 px-2 text-[10px] font-bold tracking-widest text-slate-500">
                {sec.label}
              </div>
              <ul className="space-y-0.5">
                {sec.items.map((item) => {
                  const active = pathname === item.to || pathname.startsWith(item.to + '/')
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                          active
                            ? 'bg-violet-600/20 text-violet-300'
                            : 'text-slate-400 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span className="text-base">{item.icon}</span>
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4 py-4">
          <Link to="/hr" className="text-xs text-slate-500 hover:text-slate-300">
            ← HR 포털로 돌아가기
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col bg-slate-50">
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
