import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchHistory, getDefaultBackendBaseForUi } from '../api/client'

export function HistoryPage() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchHistory()
        if (!cancelled) setItems(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기 실패')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    const looksLikeNoDb =
      /DATABASE_URL|설정되지 않았습니다|저장할 수 없습니다/i.test(error) || /\b503\b/.test(error)
    const looksLikeWrongApi =
      /\b404\b|Not Found/i.test(error) || /HTTP 404/.test(error)

    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">저장 기록</h1>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          {error}
          {looksLikeNoDb && (
            <span className="mt-2 block text-amber-800 dark:text-amber-200/80">
              위 메시지가 DB 설정과 관련된 경우: 백엔드 <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">.env</code>의{' '}
              <code className="text-amber-900 dark:text-amber-300">DATABASE_URL</code>(Postgres 연결 문자열)을 넣고
              백엔드 프로세스를 다시 시작했는지 확인하세요. (Supabase 대시보드 URL이 아니라 DB 커넥션 문자열입니다.)
            </span>
          )}
          {looksLikeWrongApi && (
            <span className="mt-2 block text-amber-800 dark:text-amber-200/80">
              로컬·LAN(예: Vite <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">--host</code>)에서는 API가
              같은 호스트의 백엔드 포트(기본 8000)로 직접 붙습니다. 백엔드를 켠 뒤{' '}
              <a
                href={`${getDefaultBackendBaseForUi()}/docs`}
                className="font-medium text-violet-700 underline dark:text-violet-300"
                target="_blank"
                rel="noreferrer"
              >
                API 문서(/docs)
              </a>
              가 열리는지 확인하세요.
            </span>
          )}
        </p>
      </div>
    )
  }

  if (items === null) {
    return <p className="text-slate-500 dark:text-slate-400">불러오는 중…</p>
  }

  if (items.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">저장 기록</h1>
        <p className="mt-4 text-slate-500 dark:text-slate-400">아직 저장된 분석이 없습니다.</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">저장 기록</h1>
      <ul className="mt-6 space-y-3">
        {items.map((row) => (
          <li key={row.id}>
            <Link
              to={`/history/${row.id}`}
              className="block rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:border-violet-300 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-violet-500/40"
            >
              <p className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-white">
                {row.analysis_summary}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{row.created_at}</p>
              <p className="mt-2 line-clamp-2 text-xs text-slate-500 dark:text-slate-500">{row.jd_preview}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
