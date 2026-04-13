import { Navigate, Outlet } from 'react-router-dom'
import { useHrAuth } from '../context/HrAuthContext'

export function HrProtected() {
  const { token, loading } = useHrAuth()
  if (loading) {
    return (
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
        인증 확인 중…
      </p>
    )
  }
  if (!token) return <Navigate to="/hr/login" replace />
  return <Outlet />
}
