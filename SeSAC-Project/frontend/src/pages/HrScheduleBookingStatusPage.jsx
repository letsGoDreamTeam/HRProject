import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { hrGetScheduleBookingStatus, hrRemindPendingCandidates } from '../api/client'

function fmtRange(startIso, endIso, tz) {
  if (!startIso || !endIso) return '—'
  try {
    const o = { timeZone: tz || 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }
    const a = new Date(startIso).toLocaleString('ko-KR', o)
    const b = new Date(endIso).toLocaleString('ko-KR', { ...o, dateStyle: undefined })
    return `${a} ~ ${b}`
  } catch {
    return `${startIso} ~ ${endIso}`
  }
}

export function HrScheduleBookingStatusPage() {
  const { roundId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [remindMsg, setRemindMsg] = useState(null)
  const pollRef = useRef(null)

  const load = useCallback(async () => {
    if (!roundId) return
    setError(null)
    setRemindMsg(null)
    try {
      const row = await hrGetScheduleBookingStatus(roundId)
      setData(row)
    } catch (e) {
      setData(null)
      setError(e?.message || '불러오기 실패')
    }
  }, [roundId])

  useEffect(() => {
    void load()
  }, [load])

  /** 면접자 링크 응답이 HR 화면에 곧바로 보이도록 주기적으로 새로고침합니다. */
  useEffect(() => {
    if (!roundId) return undefined
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void load()
    }
    pollRef.current = window.setInterval(tick, 5000)
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [roundId, load])

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setRemindMsg('링크를 복사했습니다.')
    } catch {
      setRemindMsg('복사에 실패했습니다. 직접 선택해 복사해 주세요.')
    }
  }

  const remind = async () => {
    if (!roundId) return
    setBusy(true)
    setError(null)
    setRemindMsg(null)
    try {
      const r = await hrRemindPendingCandidates(roundId)
      setRemindMsg(
        `미선택 지원자 알림 큐: 이메일 ${r.emails_queued}건, SMS ${r.sms_queued}건. 연락처 없음 스킵 ${r.skipped_no_contact}명.`,
      )
      await load()
    } catch (e) {
      setError(e?.message || '재안내 실패')
    } finally {
      setBusy(false)
    }
  }

  const tz = data?.timezone || 'Asia/Seoul'

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">면접 응답·예약 현황</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            지원자별 확정·불참·미선택과 슬롯별 잔여 정원을 한눈에 보고, 아직 시간을 고르지 않은 분에게 링크 재안내를 큐에 넣을
            수 있습니다. 이 페이지는 약 5초마다 자동으로 최신 응답을 불러옵니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            to="/hr/schedules"
            className="text-violet-600 hover:underline dark:text-violet-400"
          >
            ← 면접 일정
          </Link>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      )}
      {remindMsg && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
          {remindMsg}
        </p>
      )}
      {roundId && (
        <p className="text-xs text-slate-500 dark:text-slate-400">백그라운드 탭에서는 자동 새로고침이 잠시 멈춥니다.</p>
      )}

      {!data && !error && <p className="text-sm text-slate-500">불러오는 중…</p>}

      {data && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{data.title}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              타임존 {data.timezone} · 확정 {data.confirmed_count}명 · 미선택 {data.pending_count}명
              {typeof data.declined_count === 'number' ? ` · 불참 응답 ${data.declined_count}명` : ''}
            </p>
            <button
              type="button"
              disabled={busy || data.pending_count === 0}
              onClick={() => void remind()}
              className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {busy ? '처리 중…' : '미선택 지원자에게 재안내 (메일/SMS 큐)'}
            </button>
            {data.pending_count === 0 && (
              <p className="mt-2 text-xs text-slate-500">미선택 지원자가 없으면 재안내할 수 없습니다.</p>
            )}
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">지원자</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700">
                    <th className="py-2 pr-4">이름</th>
                    <th className="py-2 pr-4">상태</th>
                    <th className="py-2 pr-4">예약 시간</th>
                    <th className="py-2 pr-4">연락처</th>
                    <th className="py-2">선택 링크</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.candidates || []).map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2 pr-4 font-medium text-slate-900 dark:text-white">{c.name}</td>
                      <td className="py-2 pr-4">
                        {c.status === 'confirmed' ? (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                            확정
                          </span>
                        ) : c.status === 'declined' ? (
                          <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                            불참
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                            미선택
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">
                        {c.status === 'confirmed'
                          ? fmtRange(c.slot_start_at, c.slot_end_at, tz)
                          : '—'}
                      </td>
                      <td className="py-2 pr-4 text-xs text-slate-600 dark:text-slate-400">
                        {c.email || '—'}
                        <br />
                        {c.phone || '—'}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => void copy(c.pick_url_absolute)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          전체 URL 복사
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">슬롯별 예약</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700">
                    <th className="py-2 pr-4">시간</th>
                    <th className="py-2 pr-4">정원</th>
                    <th className="py-2 pr-4">예약</th>
                    <th className="py-2">남은 자리</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.slots || []).map((s) => (
                    <tr key={s.slot_id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">
                        {fmtRange(s.start_at, s.end_at, tz)}
                      </td>
                      <td className="py-2 pr-4">{s.capacity}</td>
                      <td className="py-2 pr-4">{s.booked}</td>
                      <td className="py-2">{s.remaining}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
