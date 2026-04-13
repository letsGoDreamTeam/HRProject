import { Link, Outlet, useLocation } from 'react-router-dom'
import { useHrAuth } from '../context/HrAuthContext'
import { ThemeToggle } from './ThemeToggle'

export function Layout() {
  const { pathname } = useLocation()
  const { token, logout } = useHrAuth()
  const showHrLogout =
    Boolean(token) &&
    pathname.startsWith('/hr') &&
    pathname !== '/hr/login' &&
    pathname !== '/hr/register'

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="sticky top-0 z-10 border-b border-slate-200/90 bg-white/90 backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-950/90">
        <header>
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link
              to="/"
              className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white"
            >
              면접 질문 코파일럿
            </Link>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <nav className="flex gap-4">
                <Link
                  to="/"
                  className="text-slate-600 transition-colors hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-300"
                >
                  분석
                </Link>
                <Link
                  to="/history"
                  className="text-slate-600 transition-colors hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-300"
                >
                  기록
                </Link>
                <Link
                  to="/apass"
                  className="text-slate-600 transition-colors hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-300"
                >
                  A-PASS
                </Link>
                <Link
                  to="/hr"
                  className="text-slate-600 transition-colors hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-300"
                >
                  HR
                </Link>
              </nav>
              {showHrLogout ? (
                <button
                  type="button"
                  onClick={() => logout()}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  로그아웃
                </button>
              ) : null}
              <ThemeToggle />
            </div>
          </div>
        </header>
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
