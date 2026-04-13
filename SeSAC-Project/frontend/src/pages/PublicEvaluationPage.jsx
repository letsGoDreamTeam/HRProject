import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { hrPublicEvaluation, hrPublicEvaluationSubmit } from '../api/client'

export function PublicEvaluationPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [scores, setScores] = useState({})
  const [comment, setComment] = useState('')

  const reload = useCallback(async () => {
    if (!token) return
    const d = await hrPublicEvaluation(token)
    setData(d)
    if (d?.already_submitted && d.scores) {
      setScores({ ...d.scores })
      setComment(d.overall_comment || '')
    } else if (d?.criteria_labels?.length) {
      const init = {}
      for (const lab of d.criteria_labels) init[lab] = 3
      setScores(init)
      setComment('')
    }
  }, [token])

  useEffect(() => {
    let cancel = false
    ;(async () => {
      setError(null)
      try {
        if (!token) throw new Error('토큰이 없습니다.')
        const d = await hrPublicEvaluation(token)
        if (cancel) return
        setData(d)
        if (d?.already_submitted && d.scores) {
          setScores({ ...d.scores })
          setComment(d.overall_comment || '')
        } else if (d?.criteria_labels?.length) {
          const init = {}
          for (const lab of d.criteria_labels) init[lab] = 3
          setScores(init)
          setComment('')
        }
      } catch (e) {
        if (!cancel) setError(e?.message || '불러오기 실패')
      }
    })()
    return () => {
      cancel = true
    }
  }, [token])

  const title = useMemo(() => data?.round_title || '면접 평가', [data])

  const submit = async (e) => {
    e.preventDefault()
    if (!token || data?.already_submitted) return
    setBusy(true)
    setError(null)
    try {
      await hrPublicEvaluationSubmit(token, { scores, overall_comment: comment })
      await reload()
    } catch (err) {
      setError(err?.message || '제출 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      )}
      {!data && !error && <p className="text-sm text-slate-500">불러오는 중…</p>}
      {data && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-900 dark:text-white">지원자</span> {data.candidate_name}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-900 dark:text-white">평가자</span> {data.interviewer_name}
          </p>
          {data.already_submitted ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">제출이 완료되었습니다.</p>
              <ul className="space-y-2 text-sm">
                {data.criteria_labels?.map((lab) => (
                  <li key={lab} className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800">
                    <span>{lab}</span>
                    <span className="font-mono font-semibold">{data.scores?.[lab] ?? '—'}</span>
                  </li>
                ))}
              </ul>
              {data.overall_comment ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">코멘트</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">
                    {data.overall_comment}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={submit}>
              {data.criteria_labels?.map((lab) => (
                <label key={lab} className="block text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{lab}</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    value={scores[lab] ?? 3}
                    onChange={(ev) => setScores((s) => ({ ...s, [lab]: Number(ev.target.value) }))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}점
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="block text-sm">
                <span className="font-medium text-slate-800 dark:text-slate-200">종합 코멘트</span>
                <textarea
                  rows={4}
                  value={comment}
                  onChange={(ev) => setComment(ev.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="면접 소감·권장 여부 등"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {busy ? '제출 중…' : '평가 제출'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
