import { Link, Outlet, useLocation } from 'react-router-dom'
import { useHrAuth } from '../context/HrAuthContext'

export function Layout() {
  const { pathname } = useLocation()
  const { token, user, loading, logout } = useHrAuth()
  const showHrLogout =
    Boolean(token) &&
    pathname.startsWith('/hr') &&
    pathname !== '/hr/login' &&
    pathname !== '/hr/register'
  const showHrWho = showHrLogout && !loading && user
  const hrDashboard = showHrLogout

  return (
    <div className="flex min-h-dvh flex-col">
      {!hrDashboard ? (
        <div className="sticky top-0 z-10 border-b border-slate-200/90 bg-white/90 backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-950/90">
          <header>
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Link
                to="/hr"
                className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white"
              >
                HRProject
              </Link>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {showHrWho ? (
                  <span
                    className="max-w-[min(100vw-12rem,20rem)] truncate text-xs text-slate-600 dark:text-slate-400"
                    title={[user.email, user.full_name?.trim(), user.is_admin ? '관리자' : '일반', user.can_manage_admin_roles === false ? '권한 변경: 최고관리자만' : user.is_admin ? '권한 변경: 가능' : '']
                      .filter(Boolean)
                      .join(' · ')}
                  >
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {user.full_name?.trim() || user.email}
                    </span>
                    {user.full_name?.trim() ? <span className="text-slate-500"> · {user.email}</span> : null}
                    <span className="text-slate-500"> · {user.is_admin ? '관리자' : '일반'}</span>
                    {user.is_admin && user.can_manage_admin_roles === false ? (
                      <span className="text-slate-500"> · 권한변경 제한</span>
                    ) : null}
                  </span>
                ) : null}
                {showHrLogout ? (
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    로그아웃
                  </button>
                ) : null}
              </div>
            </div>
          </header>
        </div>
      ) : null}
      <main
        className={`mx-auto w-full flex-1 px-4 py-8 ${hrDashboard ? 'max-w-[min(100%,1440px)] py-0 sm:py-2' : 'max-w-5xl'}`}
      >
        <Outlet />
      </main>
    </div>
  )
}
