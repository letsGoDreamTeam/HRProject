import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { hrCandidateQuestions, hrJobRolesList } from '../api/client'

export function HrInterviewQuestionsPage() {
  const [department, setDepartment] = useState('')
  const [essay, setEssay] = useState('')
  const [portfolio, setPortfolio] = useState('')
  const [extra, setExtra] = useState('')
  const [jobRoles, setJobRoles] = useState([])
  const [jobRoleId, setJobRoleId] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await hrJobRolesList()
        if (!cancelled) setJobRoles(Array.isArray(rows) ? rows : [])
      } catch {
        if (!cancelled) setJobRoles([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const run = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const data = await hrCandidateQuestions({
        department,
        applicant_essay: essay,
        applicant_portfolio: portfolio,
        extra_context: extra,
        job_role_id: jobRoleId || undefined,
      })
      setResult(data)
    } catch (err) {
      setError(err?.message || '생성 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">지원자 맞춤 면접 질문</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            회사 프로필에 저장한 JD·직무기술서와 함께 지원자 서류를 넣으면 질문 초안을 만듭니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link to="/hr/company" className="text-violet-600 hover:underline dark:text-violet-400">
            회사 프로필
          </Link>
          <Link to="/hr/job-roles" className="text-violet-600 hover:underline dark:text-violet-400">
            통합 직무소개서
          </Link>
          <Link to="/hr" className="text-violet-600 hover:underline dark:text-violet-400">
            HR 홈
          </Link>
        </div>
      </div>

      <form onSubmit={run} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        )}
        {jobRoles.length > 0 && (
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            직무 프로필 (통합 소개서에서 저장한 행, 선택)
            <select
              value={jobRoleId}
              onChange={(e) => setJobRoleId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="">— 안 씀 —</option>
              {jobRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {(r.department || '(부서 미상)') + ' · ' + (r.job_title || '')}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          지원 부서
          <input
            required
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          자기소개서
          <textarea
            rows={8}
            value={essay}
            onChange={(e) => setEssay(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          포트폴리오 / 추가 서류
          <textarea
            rows={6}
            value={portfolio}
            onChange={(e) => setPortfolio(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          추가 컨텍스트 (직무별 메모 등)
          <textarea
            rows={3}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? '생성 중…' : '질문 생성'}
        </button>
      </form>

      {result && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-left dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">결과</h2>
          {result.notes_for_interviewer && (
            <p className="text-sm text-slate-600 dark:text-slate-400">{result.notes_for_interviewer}</p>
          )}
          <ol className="list-inside list-decimal space-y-2 text-sm text-slate-800 dark:text-slate-200">
            {(result.questions || []).map((q, i) => (
              <li key={i} className="leading-relaxed">
                {q}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
