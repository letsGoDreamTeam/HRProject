import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useHrAuth } from '../context/HrAuthContext'
import {
  hrAdminNotificationSummary,
  hrAdminPatchUser,
  hrAdminPatchUserByEmail,
  hrAdminRecentFailures,
  hrAdminRetryNotification,
  hrAdminUsers,
} from '../api/client'

export function HrAdminPage() {
  const { user, loading } = useHrAuth()
  const [users, setUsers] = useState([])
  const [summary, setSummary] = useState(null)
  const [failures, setFailures] = useState([])
  const [error, setError] = useState(null)
  const [okMsg, setOkMsg] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [emailInput, setEmailInput] = useState('')

  const adminCount = useMemo(() => users.filter((u) => u.is_admin).length, [users])

  const load = useCallback(async () => {
    setError(null)
    setOkMsg(null)
    try {
      const [u, s, f] = await Promise.all([
        hrAdminUsers(),
        hrAdminNotificationSummary(),
        hrAdminRecentFailures(40),
      ])
      setUsers(Array.isArray(u) ? u : [])
      setSummary(s)
      setFailures(Array.isArray(f) ? f : [])
    } catch (e) {
      setError(e?.message || '불러오기 실패 (관리자만 접근 가능)')
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!user?.is_admin) return
    void load()
  }, [load, loading, user?.is_admin])

  if (loading) {
    return (
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
        불러오는 중…
      </p>
    )
  }
  if (!user?.is_admin) {
    return <Navigate to="/hr" replace />
  }

  const setAdmin = async (userId, isAdmin) => {
    setBusyId(userId)
    setError(null)
    setOkMsg(null)
    try {
      await hrAdminPatchUser(userId, { is_admin: isAdmin })
      setOkMsg(isAdmin ? '관리자 권한을 부여했습니다.' : '관리자 권한을 해제했습니다.')
      await load()
    } catch (e) {
      setError(e?.message || '변경 실패')
    } finally {
      setBusyId(null)
    }
  }

  const setAdminByEmail = async (isAdmin) => {
    const email = emailInput.trim()
    if (!email) {
      setError('이메일을 입력하세요.')
      return
    }
    setBusyId(`email:${email}`)
    setError(null)
    setOkMsg(null)
    try {
      await hrAdminPatchUserByEmail({ email, is_admin: isAdmin })
      setOkMsg(isAdmin ? `"${email}" 에게 관리자 권한을 부여했습니다.` : `"${email}" 의 관리자 권한을 해제했습니다.`)
      setEmailInput('')
      await load()
    } catch (e) {
      setError(e?.message || '변경 실패')
    } finally {
      setBusyId(null)
    }
  }

  const retryOne = async (id) => {
    setBusyId(id)
    setError(null)
    setOkMsg(null)
    try {
      await hrAdminRetryNotification(id)
      setOkMsg('재시도 큐에 넣었습니다.')
      await load()
    } catch (e) {
      setError(e?.message || '재시도 실패')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">관리자</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            사용자 관리자 권한 부여·해지, 알림 큐(전송 포기 재시도)
          </p>
        </div>
        <Link to="/hr" className="text-sm text-violet-600 hover:underline dark:text-violet-400">
          ← HR 홈
        </Link>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      )}
      {okMsg && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
          {okMsg}
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">이메일로 권한 부여·해지</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          가입된 사용자 이메일만 가능합니다. 마지막 한 명의 관리자는 해제할 수 없고, 본인 권한은 여기서 해제할 수 없습니다.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            이메일
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="user@company.com"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busyId)}
              onClick={() => void setAdminByEmail(true)}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              관리자 부여
            </button>
            <button
              type="button"
              disabled={Boolean(busyId)}
              onClick={() => {
                if (!window.confirm('이 계정의 관리자 권한을 해제할까요?')) return
                void setAdminByEmail(false)
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              관리자 해지
            </button>
          </div>
        </div>
      </section>

      {summary && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">알림 요약</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            <li>발송 대기(지금 처리 가능): {summary.pending_due}</li>
            <li>예약됨(미래): {summary.pending_scheduled_future}</li>
            <li>전송 포기(dead): {summary.dead_letter}</li>
            <li>발송완료·스킵: {summary.sent_or_skipped}</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            실패 시 지수 백오프로 재시도하며, 상한 초과 시 전송 포기 처리됩니다. 환경변수:{' '}
            <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">NOTIFICATION_MAX_SEND_ATTEMPTS</code> 등
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">사용자 목록</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">관리자 {adminCount}명</p>
        <ul className="mt-3 space-y-2 text-sm">
          {users.map((u) => {
            const isSelf = user?.id === u.id
            const canRevoke = u.is_admin && adminCount > 1 && !isSelf
            const canGrant = !u.is_admin
            return (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 dark:border-slate-800"
              >
                <div>
                  <span className="font-medium text-slate-900 dark:text-white">{u.email}</span>
                  <span className="ml-2 text-slate-500">{u.full_name}</span>
                  {u.is_admin && (
                    <span className="ml-2 rounded bg-violet-100 px-1.5 text-xs text-violet-900 dark:bg-violet-900/40 dark:text-violet-100">
                      관리자
                    </span>
                  )}
                  {isSelf && <span className="ml-2 text-xs text-slate-500">(본인)</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canGrant || busyId === u.id}
                    onClick={() => void setAdmin(u.id, true)}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    부여
                  </button>
                  <button
                    type="button"
                    disabled={!canRevoke || busyId === u.id}
                    title={
                      isSelf
                        ? '본인 권한은 API로 해제할 수 없습니다'
                        : !u.is_admin
                          ? '관리자가 아닙니다'
                          : adminCount <= 1
                            ? '마지막 관리자는 해제할 수 없습니다'
                            : undefined
                    }
                    onClick={() => {
                      if (!window.confirm(`${u.email} 관리자 권한을 해제할까요?`)) return
                      void setAdmin(u.id, false)
                    }}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/50 dark:text-red-200 dark:hover:bg-red-950/30"
                  >
                    해지
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">최근 전송 포기 알림</h2>
        <ul className="mt-3 space-y-2 text-xs">
          {failures.map((f) => (
            <li key={f.id} className="rounded border border-slate-100 p-2 dark:border-slate-800">
              <div className="font-mono text-slate-600 dark:text-slate-400">{f.id}</div>
              <div>
                {f.channel} → {f.recipient} · {f.kind} · 시도 {f.attempt_count}
              </div>
              <div className="mt-1 text-red-700 dark:text-red-300">{f.last_error}</div>
              <button
                type="button"
                disabled={busyId === f.id}
                onClick={() => void retryOne(f.id)}
                className="mt-2 rounded bg-violet-600 px-2 py-1 text-xs text-white hover:bg-violet-700 disabled:opacity-50"
              >
                다시 큐에 넣기
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
