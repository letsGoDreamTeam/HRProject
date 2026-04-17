import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { hrPublicEvaluation, hrPublicEvaluationSubmit } from '../api/client'

const PHASE_HINT = {
  general: '',
  first_interview: '1차 전형: 지원자 원본 이력서를 기준으로 평가해 주세요.',
  second_interview: '2차 전형: 회사 표준 평가·양식에 맞춰 작성해 주세요.',
}

const RECOMMEND_OPTIONS = [
  { value: 'pass', label: '합격' },
  { value: 'hold', label: '보류' },
  { value: 'fail', label: '불합격' },
]

function formatSlotRange(startIso, endIso) {
  if (!startIso || !endIso) return ''
  try {
    const a = new Date(startIso)
    const b = new Date(endIso)
    return `${a.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })} ~ ${b.toLocaleTimeString('ko-KR', { timeStyle: 'short' })}`
  } catch {
    return ''
  }
}

export function PublicEvaluationPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [scores, setScores] = useState({})
  const [criteriaComments, setCriteriaComments] = useState({})
  const [finalSummary, setFinalSummary] = useState('')
  const [overallComment, setOverallComment] = useState('')
  const [recommendation, setRecommendation] = useState('hold')

  const reload = useCallback(async () => {
    if (!token) return
    const d = await hrPublicEvaluation(token)
    setData(d)
    if (d?.already_submitted && d.scores) {
      setScores({ ...d.scores })
      setCriteriaComments({ ...(d.criteria_comments || {}) })
      setFinalSummary(d.final_summary_line || '')
      setOverallComment(d.overall_comment || '')
      setRecommendation(d.recommendation || 'hold')
    } else if (d?.criteria_labels?.length) {
      const initS = {}
      const initC = {}
      for (const lab of d.criteria_labels) {
        initS[lab] = 3
        initC[lab] = ''
      }
      setScores(initS)
      setCriteriaComments(initC)
      setFinalSummary('')
      setOverallComment('')
      setRecommendation('hold')
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
          setCriteriaComments({ ...(d.criteria_comments || {}) })
          setFinalSummary(d.final_summary_line || '')
          setOverallComment(d.overall_comment || '')
          setRecommendation(d.recommendation || 'hold')
        } else if (d?.criteria_labels?.length) {
          const initS = {}
          const initC = {}
          for (const lab of d.criteria_labels) {
            initS[lab] = 3
            initC[lab] = ''
          }
          setScores(initS)
          setCriteriaComments(initC)
          setFinalSummary('')
          setOverallComment('')
          setRecommendation('hold')
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
  const phaseHint = PHASE_HINT[data?.interview_phase] || ''
  const slotLine = useMemo(
    () => formatSlotRange(data?.interview_slot_start_at, data?.interview_slot_end_at),
    [data?.interview_slot_start_at, data?.interview_slot_end_at],
  )

  const submit = async (e) => {
    e.preventDefault()
    if (!token || data?.already_submitted) return
    setBusy(true)
    setError(null)
    try {
      await hrPublicEvaluationSubmit(token, {
        scores,
        criteria_comments: criteriaComments,
        final_summary_line: finalSummary.trim(),
        overall_comment: overallComment,
        recommendation,
      })
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
          {data.applied_position ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-900 dark:text-white">지원 직무</span> {data.applied_position}
            </p>
          ) : null}
          {slotLine ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-900 dark:text-white">면접 일시</span> {slotLine}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-900 dark:text-white">평가자</span> {data.interviewer_name}
          </p>
          {phaseHint ? <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{phaseHint}</p> : null}
          <p className="mt-2 text-xs text-slate-500">
            점수는 참고용입니다. <strong>항목별 코멘트</strong>와 종합 요약을 충분히 적어 주세요.
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
              {data.final_summary_line ? (
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">한 줄 요약: {data.final_summary_line}</p>
              ) : null}
              {data.recommendation ? (
                <p className="text-sm text-violet-700 dark:text-violet-300">
                  추천:{' '}
                  {data.recommendation === 'pass'
                    ? '합격'
                    : data.recommendation === 'hold'
                      ? '보류'
                      : data.recommendation === 'fail'
                        ? '불합격'
                        : data.recommendation}
                </p>
              ) : null}
              {data.criteria_comments && Object.keys(data.criteria_comments).length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">항목별 코멘트</p>
                  <ul className="mt-1 space-y-2 text-sm text-slate-800 dark:text-slate-200">
                    {Object.entries(data.criteria_comments).map(([k, v]) => (
                      <li key={k} className="whitespace-pre-wrap">
                        <span className="font-medium">{k}</span>: {v}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {data.overall_comment ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">추가 코멘트</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{data.overall_comment}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={submit}>
              {data.criteria_labels?.map((lab) => (
                <div key={lab} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                  <label className="block text-sm">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{lab} — 점수 (1~5)</span>
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
                  <label className="mt-2 block text-sm">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{lab} — 코멘트 (서술)</span>
                    <textarea
                      rows={3}
                      value={criteriaComments[lab] ?? ''}
                      onChange={(ev) =>
                        setCriteriaComments((c) => ({
                          ...c,
                          [lab]: ev.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                      placeholder="관찰한 내용·근거를 적어 주세요."
                    />
                  </label>
                </div>
              ))}
              <label className="block text-sm">
                <span className="font-medium text-slate-800 dark:text-slate-200">종합 한 줄 요약 *</span>
                <input
                  type="text"
                  value={finalSummary}
                  onChange={(ev) => setFinalSummary(ev.target.value)}
                  maxLength={500}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="예: 실무 역량 양호, 커뮤니케이션 보완 필요"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800 dark:text-slate-200">추가 코멘트 (선택, 상세)</span>
                <textarea
                  rows={3}
                  value={overallComment}
                  onChange={(ev) => setOverallComment(ev.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">추천 *</legend>
                <div className="flex flex-wrap gap-3">
                  {RECOMMEND_OPTIONS.map((o) => (
                    <label key={o.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
                      <input
                        type="radio"
                        name="recommendation"
                        value={o.value}
                        checked={recommendation === o.value}
                        onChange={() => setRecommendation(o.value)}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
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
