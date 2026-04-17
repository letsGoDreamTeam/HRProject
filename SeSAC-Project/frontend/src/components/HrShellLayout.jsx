import { NavLink, Outlet, Link } from 'react-router-dom'
import { useHrAuth } from '../context/HrAuthContext'

function IconSparkles() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423L16.5 15l.394 1.183a2.25 2.25 0 001.423 1.423L19.5 18l-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.813-4.04M18 8.25A2.25 2.25 0 1115.75 6 2.25 2.25 0 0118 8.25zm-9 4.125a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0zM12 20.25c-2.347 0-4.5-.893-6.112-2.358a9.38 9.38 0 01-1.875-2.43M12 20.25c2.347 0 4.5-.893 6.112-2.358a9.38 9.38 0 001.875-2.43"
      />
    </svg>
  )
}

function IconCog() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5"
      />
    </svg>
  )
}

function IconTable() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125V5.625m17.25 12.75a1.125 1.125 0 001.125-1.125V5.625m0 0h-17.25m17.25 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.845 8.784a2.25 2.25 0 01-1.07-1.916V5.625m0 0h17.25"
      />
    </svg>
  )
}

function IconBell() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.19M14.857 17.082A23.917 23.917 0 0112 21c-2.684 0-5.215-.43-7.652-1.232M14.857 17.082A8.961 8.961 0 0112 20.25a8.961 8.961 0 01-3.857-.832M6.75 9.75a3 3 0 013-3h4.5a3 3 0 013 3v.75M6.75 9.75h-.75A2.25 2.25 0 003.75 12v.75m3-3h13.5m-13.5 0v4.5m13.5-4.5v4.5"
      />
    </svg>
  )
}

const navInactive =
  'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
const navActive =
  'flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm'

function NavItem({ to, end, icon, children }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => (isActive ? navActive : navInactive)}>
      {icon}
      {children}
    </NavLink>
  )
}

export function HrShellLayout() {
  const { user, logout } = useHrAuth()
  const displayName = (user?.full_name || '').trim() || user?.email || '사용자'
  const roleLine = user?.is_admin ? 'ADMIN · RECRUITER' : 'SENIOR RECRUITER'

  return (
    <div className="hr-theme-scope flex min-h-0 flex-1 flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-3">
          <Link to="/hr" className="group flex shrink-0 flex-col">
            <span className="text-lg font-black tracking-tight text-indigo-600 dark:text-indigo-400">A-RECRUIT</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              HR INTELLIGENCE
            </span>
          </Link>

          <nav className="flex flex-1 flex-wrap items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-1.5 dark:border-slate-700 dark:bg-slate-900/70 sm:gap-2">
            <NavItem to="/hr/interviews" icon={<IconSparkles />}>
              AI 질문 생성기
            </NavItem>
            <NavItem to="/hr/applications" icon={<IconUsers />}>
              지원자 관리
            </NavItem>
            <NavItem to="/hr/recruitment-process" icon={<IconCog />}>
            채용 절차 설정
            </NavItem>
            <NavItem to="/hr/calendar" end icon={<IconCalendar />}>
              캘린더
            </NavItem>
            <NavItem to="/hr/schedule-integrated" end icon={<IconTable />}>
              엑셀 관리
            </NavItem>
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            {user?.is_admin ? (
              <Link
                to="/admin/dashboard"
                className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                title="알림 · 시스템 대시보드"
              >
                <IconBell />
              </Link>
            ) : (
              <button
                type="button"
                className="cursor-default rounded-full p-2 text-slate-300 dark:text-slate-600"
                title="알림은 관리자 메뉴에서 확인할 수 있습니다."
              >
                <IconBell />
              </button>
            )}
            <button
              type="button"
              onClick={() => logout()}
              className="hidden rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 sm:inline dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              로그아웃
            </button>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 py-1.5 pl-1.5 pr-3 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white">
                {(displayName[0] || '?').toUpperCase()}
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-xs font-semibold text-slate-900 dark:text-white">{displayName}</p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {roleLine}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-6">
        <Outlet />
      </div>
    </div>
  )
}
