import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apassDashboardInstitution } from '../api/client'

export function ApassInstitutionDashboardPage() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const d = await apassDashboardInstitution()
        if (!cancelled) setData(d)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '로드 실패')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">입학처·교사 대시보드 (B2B)</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Fit 리포트를 구간별로 묶은 칸반형 목록입니다. DB가 비어 있으면 데모 카드가 표시됩니다.
          </p>
        </div>
        <Link to="/apass" className="text-sm text-violet-600 hover:underline dark:text-violet-300">
          ← A-PASS 홈
        </Link>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {data && (
        <>
          <p className="rounded-xl border border-slate-200 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            {data.report_hint}
          </p>
          <div className="grid gap-4 lg:grid-cols-3">
            {Object.entries(data.columns || {}).map(([title, cards]) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/50"
              >
                <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 dark:border-slate-800 dark:text-slate-100">
                  {title}
                </div>
                <ul className="max-h-[480px] space-y-3 overflow-y-auto p-3">
                  {(cards || []).map((c) => (
                    <li
                      key={c.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 text-left text-sm shadow-sm dark:border-slate-700 dark:bg-slate-950"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-slate-900 dark:text-white">{c.applicant_name}</span>
                        <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                          {c.fit_score}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{c.summary}</p>
                      <p className="mt-1 text-[10px] uppercase text-slate-400">band: {c.band}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
