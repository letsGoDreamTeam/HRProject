import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'

/** 이메일 등에 `/careers/{토큰}` 형태로 보낸 경우 → 실제 일정 선택 화면으로 통일 */
export function CareersTokenRedirect() {
  const { token } = useParams()
  if (!token?.trim()) {
    return <Navigate to="/careers" replace />
  }
  return <Navigate to={`/schedule/pick/${encodeURIComponent(token.trim())}`} replace />
}

function extractTokenFromPaste(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  const m =
    s.match(/\/schedule\/pick\/([^/?#]+)/i) ||
    s.match(/\/careers\/([^/?#]+)/i) ||
    s.match(/pick\/([^/?#]+)/i)
  if (m?.[1]) return decodeURIComponent(m[1])
  if (/^[A-Za-z0-9_-]{16,80}$/.test(s)) return s
  return null
}

/**
 * 지원자용 안내 페이지 (토큰 없음).
 * 실제 시간 선택·불참 응답은 담당자가 보낸 개인 링크(`/schedule/pick/...`)에서만 가능합니다.
 */
export function CareersLandingPage() {
  const navigate = useNavigate()
  const [paste, setPaste] = useState('')
  const [err, setErr] = useState(null)

  const go = () => {
    setErr(null)
    const tok = extractTokenFromPaste(paste)
    if (!tok) {
      setErr('전체 URL을 붙여넣거나, 링크 끝의 긴 토큰만 입력해 주세요.')
      return
    }
    navigate(`/schedule/pick/${encodeURIComponent(tok)}`)
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <header className="border-b border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-sm font-bold text-white">
            A
          </div>
          <div>
            <span className="text-lg font-bold text-slate-900 dark:text-white">A-RECRUIT</span>
            <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">Careers</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">지원자 일정 안내</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          이 화면은 <strong>개인 초대가 없을 때</strong> 안내용으로만 쓰입니다. 면접 시간을 고르거나 참석 여부를 알리려면
          채용 담당자가 보낸 <strong>이메일·문자 속 링크</strong>를 그대로 눌러 주세요. 링크에는 본인만 쓸 수 있는 보안
          토큰이 포함되어 있습니다.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">이미 링크를 받으셨나요?</h2>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            아래에 <strong>전체 주소</strong>를 붙여넣거나, 주소 마지막의 <strong>토큰 문자열</strong>만 넣고 이동하면
            일정 선택 페이지로 연결됩니다.
          </p>
          <textarea
            value={paste}
            onChange={(e) => {
              setPaste(e.target.value)
              setErr(null)
            }}
            rows={3}
            placeholder="예: https://...(도메인).../schedule/pick/xxxxxxxx 또는 토큰만"
            className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          {err && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{err}</p>}
          <button
            type="button"
            onClick={() => void go()}
            className="mt-4 w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
          >
            일정 선택 페이지로 이동
          </button>
        </div>

        <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
          <Link to="/hr" className="text-violet-600 hover:underline dark:text-violet-400">
            채용 담당자(HR) 로그인
          </Link>
        </p>
      </main>
    </div>
  )
}
