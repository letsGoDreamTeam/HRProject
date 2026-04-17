import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { hrApplicantStatusDashboard } from '../api/client'

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ko-KR')
}

function ddayMeta(deadlineIso) {
  if (!deadlineIso) return { label: '—', tone: 'text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-300' }
  const d = new Date(deadlineIso)
  if (Number.isNaN(d.getTime())) {
    return { label: '—', tone: 'text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-300' }
  }
  const today = new Date()
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((target - base) / 86400000)
  if (diff < 0) return { label: `D+${Math.abs(diff)}`, tone: 'text-rose-700 bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300' }
  if (diff <= 3) return { label: diff === 0 ? 'D-Day' : `D-${diff}`, tone: 'text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300' }
  return { label: `D-${diff}`, tone: 'text-emerald-700 bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300' }
}

export function HrRecruitmentSummaryPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [platformFilter, setPlatformFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')

  const load = useCallback(async () => {
    setError(null)
    try {
      const d = await hrApplicantStatusDashboard()
      setData(d)
    } catch (e) {
      setError(e?.message || '불러오기 실패')
      setData(null)
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(t)
  }, [load])

  const rows = Array.isArray(data?.rows) ? data.rows : []
  const platformOptions = Array.from(
    new Set(rows.map((r) => (r.posting_platform || 'unknown').trim() || 'unknown')),
  ).sort((a, b) => a.localeCompare(b, 'ko'))
  const departmentOptions = Array.from(
    new Set(rows.map((r) => (r.department_name || '미지정').trim() || '미지정')),
  ).sort((a, b) => a.localeCompare(b, 'ko'))
  const filteredRows = rows.filter((r) => {
    const p = (r.posting_platform || 'unknown').trim() || 'unknown'
    const d = (r.department_name || '미지정').trim() || '미지정'
    if (platformFilter !== 'all' && p !== platformFilter) return false
    if (departmentFilter !== 'all' && d !== departmentFilter) return false
    return true
  })
  const sortedRows = [...filteredRows].sort((a, b) => {
    const da = a.deadline_at ? new Date(a.deadline_at).getTime() : Number.POSITIVE_INFINITY
    const db = b.deadline_at ? new Date(b.deadline_at).getTime() : Number.POSITIVE_INFINITY
    return da - db
  })
  const urgentCount = sortedRows.filter((r) => {
    const meta = ddayMeta(r.deadline_at)
    return meta.label === 'D-Day' || meta.label.startsWith('D-1') || meta.label.startsWith('D-2') || meta.label.startsWith('D-3')
  }).length
  const totalDupes = sortedRows.reduce((acc, r) => acc + Number(r.duplicate_suspected_count || 0), 0)

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">지원자 현황 대시보드</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            채용담당자가 바로 확인할 수 있도록 공고 핵심 정보와 중복 지원 의심 건수를 표로 보여줍니다.
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

      {!data && !error && <p className="text-sm text-slate-500">불러오는 중…</p>}

      {data && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">표시 공고</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{sortedRows.length}건</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
              <p className="text-xs text-rose-600 dark:text-rose-300">중복 지원 의심 합계</p>
              <p className="mt-1 text-2xl font-bold text-rose-700 dark:text-rose-200">{totalDupes}건</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="text-xs text-amber-700 dark:text-amber-300">마감 임박 (D-3 이내)</p>
              <p className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">{urgentCount}건</p>
            </div>
          </div>

          <section>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">공고별 현황</h2>
            <p className="mt-1 text-xs text-slate-500">
              항목: 지원부서 · 포지션명 · 공고일 · 마감일(D-day) · 공고 플랫폼 · 중복 지원 의심 건수
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                플랫폼 필터
                <select
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                  className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">전체</option>
                  {platformOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                부서 필터
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">전체</option>
                  {departmentOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs text-indigo-600 dark:text-indigo-300">정렬: D-day 오름차순(임박순)</span>
            </div>
            {!rows.length ? (
              <p className="mt-3 text-sm text-slate-500">등록된 공고가 없습니다.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-100/90 dark:bg-slate-800/80">
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="py-3 pl-4 pr-4 font-semibold">지원부서</th>
                      <th className="py-3 pr-4 font-semibold">포지션명</th>
                      <th className="py-3 pr-4 font-semibold">공고일</th>
                      <th className="py-3 pr-4 font-semibold">마감일</th>
                      <th className="py-3 pr-4 font-semibold">D-day</th>
                      <th className="py-3 pr-4 font-semibold">공고 플랫폼</th>
                      <th className="py-3 pr-4 font-semibold text-right">중복 지원 의심</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row, idx) => {
                      const meta = ddayMeta(row.deadline_at)
                      return (
                      <tr
                        key={row.batch_id}
                        className={`border-b border-slate-100 dark:border-slate-800 ${idx % 2 === 1 ? 'bg-slate-50/40 dark:bg-slate-900/30' : ''}`}
                      >
                        <td className="py-2.5 pl-4 pr-4 font-medium text-slate-800 dark:text-slate-200">{row.department_name || '—'}</td>
                        <td className="py-2.5 pr-4">
                          <Link
                            to={`/hr/pipeline/${row.batch_id}/insights`}
                            className="font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800 dark:text-indigo-300 dark:decoration-indigo-600"
                            title="해당 포지션 이력서 인사이트 대시보드로 이동"
                          >
                            {row.position_name || '—'}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-4">{formatDate(row.posted_at)}</td>
                        <td className="py-2.5 pr-4">{formatDate(row.deadline_at)}</td>
                        <td className="py-2.5 pr-4">
                          <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${meta.tone}`}>{meta.label}</span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="inline-flex rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] dark:border-slate-600 dark:bg-slate-950">
                            {row.posting_platform || 'unknown'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-right font-semibold text-rose-600 dark:text-rose-300">
                          {row.duplicate_suspected_count}건
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            새로고침
          </button>
        </div>
      )}
    </div>
  )
}
