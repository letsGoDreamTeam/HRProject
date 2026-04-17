import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  hrAdminNotificationSummary,
  hrAdminRecentFailures,
  hrAdminTokenUsageSummary,
} from '../api/client'
import { useHrAuth } from '../context/HrAuthContext'

function StatCard({ title, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
}

function formatDateTime(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('ko-KR')
  } catch {
    return iso
  }
}

function formatNumber(v) {
  return Number(v || 0).toLocaleString('ko-KR')
}

export function HrSystemDashboardPage() {
  const { user: me, loading: authLoading } = useHrAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [failures, setFailures] = useState([])
  const [tokenSummary, setTokenSummary] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sum, recent, token] = await Promise.all([
        hrAdminNotificationSummary(),
        hrAdminRecentFailures(10),
        hrAdminTokenUsageSummary(7),
      ])
      setSummary(sum || null)
      setFailures(Array.isArray(recent) ? recent : [])
      setTokenSummary(token || null)
    } catch (e) {
      setError(e?.message || '시스템 지표를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!me?.is_admin) return
    void load()
  }, [authLoading, me?.is_admin, load])

  if (authLoading) {
    return <div className="flex h-56 items-center justify-center text-sm text-slate-400">불러오는 중…</div>
  }
  if (!me?.is_admin) return <Navigate to="/hr" replace />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="inline-block rounded-full border border-violet-200 bg-violet-50 px-3 py-0.5 text-[11px] font-semibold tracking-widest text-violet-600">
            SYSTEM DASHBOARD
          </span>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">시스템 대시보드</h1>
          <p className="mt-1 text-sm text-slate-500">AI 모델 사용량과 운영 지표를 한 화면에서 확인합니다.</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? '새로고침 중…' : '새로고침'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="7일 총 토큰"
          value={formatNumber(tokenSummary?.total_tokens)}
          hint="prompt + completion"
        />
        <StatCard
          title="7일 요청 수"
          value={formatNumber(tokenSummary?.total_requests)}
          hint="OpenAI API 호출 횟수"
        />
        <StatCard
          title="대기 중 큐"
          value={formatNumber((summary?.pending_due || 0) + (summary?.pending_scheduled_future || 0))}
          hint="Notification Outbox 기준"
        />
        <StatCard
          title="최근 실패 건수"
          value={formatNumber(summary?.dead_letter ?? failures.length)}
          hint="재시도 필요 알림"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">모델별 토큰 사용량 (최근 7일)</h2>
          <p className="mt-1 text-xs text-slate-500">모델별 prompt/completion/total 토큰과 호출 횟수</p>
        </div>
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">불러오는 중…</div>
        ) : !tokenSummary?.by_model?.length ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">아직 토큰 사용 로그가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 text-left">모델</th>
                  <th className="px-5 py-3 text-right">Prompt</th>
                  <th className="px-5 py-3 text-right">Completion</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-right">요청 수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tokenSummary.by_model.map((row) => (
                  <tr key={row.model}>
                    <td className="px-5 py-3 font-medium text-slate-800">{row.model || '-'}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{formatNumber(row.prompt_tokens)}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{formatNumber(row.completion_tokens)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">{formatNumber(row.total_tokens)}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{formatNumber(row.requests)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">최근 알림 실패 내역</h2>
          <p className="mt-1 text-xs text-slate-500">전송 실패 원인을 빠르게 확인하고 재시도할 수 있습니다.</p>
        </div>
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">불러오는 중…</div>
        ) : failures.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">최근 실패 이력이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 text-left">시간</th>
                  <th className="px-5 py-3 text-left">수신자</th>
                  <th className="px-5 py-3 text-left">종류</th>
                  <th className="px-5 py-3 text-left">오류</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {failures.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3 text-slate-600">{formatDateTime(row.scheduled_at || row.sent_at)}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{row.recipient || '-'}</td>
                    <td className="px-5 py-3 text-slate-600">{row.kind || '-'}</td>
                    <td className="px-5 py-3 text-red-600">{row.last_error || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
