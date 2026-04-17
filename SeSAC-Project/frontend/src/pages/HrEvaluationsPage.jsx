import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  hrEvaluationsAggregate,
  hrEvaluationsRemindPending,
  hrEvaluationsSetup,
  hrEvaluationsStatus,
} from '../api/client'

function criteriaFromLines(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
}

export function HrEvaluationsPage() {
  const { roundId } = useParams()
  const [criteriaText, setCriteriaText] = useState(
    '직무적합도\n경험/성과\n커뮤니케이션\n조직적합도',
  )
  const [status, setStatus] = useState(null)
  const [aggregate, setAggregate] = useState(null)
  const [aggCandidateId, setAggCandidateId] = useState('')
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const loadStatus = useCallback(async () => {
    if (!roundId) return
    setError(null)
    const s = await hrEvaluationsStatus(roundId)
    setStatus(s)
  }, [roundId])

  useEffect(() => {
    void loadStatus().catch((e) => setError(e?.message || '현황 로드 실패'))
  }, [loadStatus])

  useEffect(() => {
    if (status?.candidates?.length && aggCandidateId === '') {
      setAggCandidateId(String(status.candidates[0].candidate_id))
    }
  }, [status, aggCandidateId])

  const loadAggregate = useCallback(async () => {
    if (!roundId || !aggCandidateId) {
      setAggregate(null)
      return
    }
    setError(null)
    try {
      const a = await hrEvaluationsAggregate(roundId, aggCandidateId)
      setAggregate(a)
    } catch (e) {
      setAggregate(null)
      setError(e?.message || '집계 로드 실패')
    }
  }, [roundId, aggCandidateId])

  useEffect(() => {
    void loadAggregate()
  }, [loadAggregate])

  const setup = async () => {
    if (!roundId) return
    const criteria = criteriaFromLines(criteriaText)
    if (!criteria.length) {
      setError('평가 항목을 한 줄에 하나씩 입력하세요.')
      return
    }
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const r = await hrEvaluationsSetup(roundId, { criteria })
      setMsg(
        `평가표 반영: 신규 ${r.created_pairs}건, 미제출 항목 기준 갱신 ${r.updated_pending_criteria}건. 면접관에게는 아래「미제출 알림」으로 링크를 보내세요.`,
      )
      await loadStatus()
    } catch (e) {
      setError(e?.message || '설정 실패')
    } finally {
      setBusy(false)
    }
  }

  const remind = async () => {
    if (!roundId) return
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const r = await hrEvaluationsRemindPending(roundId)
      setMsg(
        `미제출 면접관 알림 큐: 이메일 ${r.emails_queued}건, SMS ${r.sms_queued}건. 연락처 없음 ${r.skipped_no_contact}건.`,
      )
    } catch (e) {
      setError(e?.message || '알림 실패')
    } finally {
      setBusy(false)
    }
  }

  const averages = useMemo(() => {
    if (!aggregate?.submissions?.length || !aggregate.criteria?.length) return {}
    const acc = {}
    const n = {}
    for (const lab of aggregate.criteria) {
      acc[lab] = 0
      n[lab] = 0
    }
    for (const sub of aggregate.submissions) {
      for (const lab of aggregate.criteria) {
        const v = sub.scores?.[lab]
        if (typeof v === 'number') {
          acc[lab] += v
          n[lab] += 1
        }
      }
    }
    const out = {}
    for (const lab of aggregate.criteria) {
      out[lab] = n[lab] ? (acc[lab] / n[lab]).toFixed(2) : '—'
    }
    return out
  }, [aggregate])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">면접 평가표</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            지원자·면접관 조합별 링크 생성, 제출 현황·미제출 알림, 지원자별 점수·항목별 코멘트·합격/보류/불합격 집계.
          </p>
        </div>
        <Link to="/hr/schedules" className="text-sm text-violet-600 hover:underline dark:text-violet-400">
          ← 면접 일정
        </Link>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      )}
      {msg && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
          {msg}
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">1. 평가 항목 · 평가표 생성</h2>
        <p className="mt-1 text-xs text-slate-500">
          한 줄에 평가 기준 하나(최대 12개). 생성 시 지원자×면접관마다 고유 링크가 생깁니다.
        </p>
        <textarea
          rows={5}
          value={criteriaText}
          onChange={(e) => setCriteriaText(e.target.value)}
          className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void setup()}
          className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          평가표 생성·갱신
        </button>
      </section>

      {status && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">2. 제출 현황</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remind()}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/40"
            >
              미제출 면접관에게 링크 알림 (큐)
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">일정: {status.title}</p>
          <div className="mt-4 space-y-6 overflow-x-auto">
            {status.candidates.map((c) => (
              <div key={c.candidate_id}>
                <p className="font-medium text-slate-900 dark:text-white">{c.candidate_name}</p>
                <table className="mt-2 min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
                      <th className="py-1 pr-3">면접관</th>
                      <th className="py-1 pr-3">상태</th>
                      <th className="py-1">링크</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.interviewers.map((row) => (
                      <tr key={row.interviewer_id} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 pr-3">{row.interviewer_name}</td>
                        <td className="py-1.5 pr-3">
                          {row.status === 'submitted' && (
                            <span className="text-emerald-700 dark:text-emerald-300">제출</span>
                          )}
                          {row.status === 'pending' && (
                            <span className="text-amber-700 dark:text-amber-300">미제출</span>
                          )}
                          {row.status === 'not_issued' && (
                            <span className="text-slate-400">미발급</span>
                          )}
                        </td>
                        <td className="py-1.5">
                          {row.eval_url_absolute ? (
                            <button
                              type="button"
                              className="text-violet-600 underline dark:text-violet-400"
                              onClick={() => void navigator.clipboard.writeText(row.eval_url_absolute)}
                            >
                              URL 복사
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}

      {status?.candidates?.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">3. 지원자별 집계 (제출분)</h2>
          <label className="mt-3 block text-sm">
            <span className="text-slate-600 dark:text-slate-400">지원자 선택</span>
            <select
              className="mt-1 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              value={aggCandidateId}
              onChange={(e) => setAggCandidateId(e.target.value)}
            >
              {status.candidates.map((c) => (
                <option key={c.candidate_id} value={c.candidate_id}>
                  {c.candidate_name}
                </option>
              ))}
            </select>
          </label>
          {aggregate && (
            <div className="mt-4 space-y-4">
              {aggregate.criteria?.length > 0 && aggregate.submissions?.length > 0 && (
                <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                  <p className="font-medium text-slate-800 dark:text-slate-200">항목별 평균 (제출 면접관 기준)</p>
                  <ul className="mt-2 space-y-1">
                    {aggregate.criteria.map((lab) => (
                      <li key={lab} className="flex justify-between">
                        <span>{lab}</span>
                        <span className="font-mono">{averages[lab]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {aggregate.submissions?.length === 0 ? (
                <p className="text-sm text-slate-500">아직 제출된 평가가 없습니다.</p>
              ) : (
                aggregate.submissions.map((sub, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-700 dark:bg-slate-950/30"
                  >
                    <p className="font-semibold text-slate-900 dark:text-white">{sub.interviewer_name}</p>
                    <p className="text-xs text-slate-500">
                      {sub.submitted_at ? new Date(sub.submitted_at).toLocaleString('ko-KR') : ''}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {Object.entries(sub.scores || {}).map(([k, v]) => (
                        <li key={k} className="flex justify-between">
                          <span>{k}</span>
                          <span className="font-mono">{v}</span>
                        </li>
                      ))}
                    </ul>
                    {sub.final_summary_line ? (
                      <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                        한 줄 요약: {sub.final_summary_line}
                      </p>
                    ) : null}
                    {sub.recommendation ? (
                      <p className="mt-1 text-xs text-violet-700 dark:text-violet-300">
                        추천:{' '}
                        {sub.recommendation === 'pass'
                          ? '합격'
                          : sub.recommendation === 'hold'
                            ? '보류'
                            : sub.recommendation === 'fail'
                              ? '불합격'
                              : sub.recommendation}
                      </p>
                    ) : null}
                    {sub.criteria_comments && Object.keys(sub.criteria_comments).length > 0 ? (
                      <div className="mt-2 rounded border border-slate-100 p-2 text-xs dark:border-slate-800">
                        <p className="font-medium text-slate-700 dark:text-slate-300">항목별 코멘트</p>
                        <ul className="mt-1 space-y-1">
                          {Object.entries(sub.criteria_comments).map(([k, v]) => (
                            <li key={k}>
                              <span className="font-medium">{k}</span>:{' '}
                              <span className="whitespace-pre-wrap text-slate-600 dark:text-slate-400">{v}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {sub.overall_comment ? (
                      <p className="mt-2 whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                        추가 코멘트: {sub.overall_comment}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
