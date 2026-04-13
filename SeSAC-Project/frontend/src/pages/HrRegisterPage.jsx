import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useHrAuth } from '../context/HrAuthContext'

export function HrRegisterPage() {
  const { register, token } = useHrAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (token) nav('/hr', { replace: true })
  }, [token, nav])

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await register(email, password, fullName)
      nav('/hr', { replace: true })
    } catch (err) {
      setError(err?.message || '가입 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">HR 회원가입</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          비밀번호는 8자 이상을 권장합니다. 관리자 이메일은 서버 환경변수로 지정할 수 있습니다.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        )}
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          이름 (표시용)
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          이메일
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          비밀번호 (8자 이상)
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? '처리 중…' : '가입하기'}
        </button>
        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          이미 계정이 있나요?{' '}
          <Link to="/hr/login" className="font-medium text-violet-600 hover:underline dark:text-violet-400">
            로그인
          </Link>
        </p>
      </form>
    </div>
  )
}
