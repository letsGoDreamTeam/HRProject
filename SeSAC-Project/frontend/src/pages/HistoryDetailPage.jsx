import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchHistoryItem } from '../api/client'

export function HistoryDetailPage() {
  const { id } = useParams()
  const [row, setRow] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchHistoryItem(id)
        if (!cancelled) setRow(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기 실패')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  if (!id) {
    return <p className="text-slate-500 dark:text-slate-400">잘못된 경로입니다.</p>
  }

  if (error) {
    return (
      <div>
        <Link
          to="/history"
          className="text-sm text-violet-600 hover:underline dark:text-violet-400"
        >
          ← 목록
        </Link>
        <p className="mt-4 text-red-600 dark:text-red-300">{error}</p>
      </div>
    )
  }

  if (!row) {
    return <p className="text-slate-500 dark:text-slate-400">불러오는 중…</p>
  }

  return (
    <div>
      <Link
        to="/history"
        className="text-sm text-violet-600 hover:underline dark:text-violet-400"
      >
        ← 목록
      </Link>
      <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">분석 상세</h1>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{row.created_at}</p>
      <section className="mt-6">
        <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">원문 JD</h2>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
          {row.jd_text}
        </pre>
      </section>
      <section className="mt-6">
        <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">요약</h2>
        <p className="mt-2 leading-relaxed text-slate-800 dark:text-slate-200">{row.analysis_summary}</p>
      </section>
      <ul className="mt-6 space-y-4">
        {row.items.map((item, i) => (
          <li
            key={`${item.competency}-${i}`}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-900/40"
          >
            <h3 className="font-semibold text-slate-900 dark:text-white">{item.competency}</h3>
            <blockquote className="mt-2 border-l-2 border-violet-400 pl-3 text-sm text-slate-600 dark:border-violet-500/50 dark:text-slate-400">
              {item.evidence}
            </blockquote>
            <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-slate-800 dark:text-slate-200">
              {item.questions.map((q, qi) => (
                <li key={qi}>{q}</li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </div>
  )
}
