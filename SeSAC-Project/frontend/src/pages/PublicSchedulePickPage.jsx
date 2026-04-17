import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  hrPublicBookSlot,
  hrPublicCancelBooking,
  hrPublicChangeBooking,
  hrPublicDeclineInterview,
  hrPublicSchedule,
} from '../api/client'

export function PublicSchedulePickPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const title = useMemo(() => data?.round_title || '면접 시간 선택', [data])

  const reload = useCallback(async () => {
    const d = await hrPublicSchedule(token)
    setData(d)
  }, [token])

  useEffect(() => {
    let cancel = false
    ;(async () => {
      setError(null)
      try {
        const d = await hrPublicSchedule(token)
        if (!cancel) setData(d)
      } catch (e) {
        if (!cancel) setError(e?.message || '링크를 불러올 수 없습니다.')
      }
    })()
    return () => {
      cancel = true
    }
  }, [token])

  const book = async (slotId) => {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      await hrPublicBookSlot(token, slotId)
      setMsg('선택이 완료되었습니다. 최종 안내는 메일/문자로 발송될 수 있습니다.')
      await reload()
    } catch (e) {
      setError(e?.message || '예약 실패')
    } finally {
      setBusy(false)
    }
  }

  const changeSlot = async (slotId) => {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      await hrPublicChangeBooking(token, slotId)
      setMsg('면접 시간을 변경했습니다. 알림이 다시 예약됩니다.')
      await reload()
    } catch (e) {
      setError(e?.message || '변경 실패')
    } finally {
      setBusy(false)
    }
  }

  const declineInterview = async () => {
    if (
      !window.confirm(
        '면접 참석이 어렵다고 응답할까요? 예약된 시간이 있으면 취소되며, 일정이 지원서와 연결되어 있으면 채용 단계가 불합격으로 반영될 수 있습니다.',
      )
    )
      return
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      await hrPublicDeclineInterview(token)
      setMsg('응답이 저장되었습니다. 운영 화면에 곧 반영됩니다.')
      await reload()
    } catch (e) {
      setError(e?.message || '응답 저장 실패')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (!window.confirm('면접 예약을 취소할까요? 미발송 알림은 취소됩니다.')) return
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      await hrPublicCancelBooking(token)
      setMsg('예약이 취소되었습니다.')
      await reload()
    } catch (e) {
      setError(e?.message || '취소 실패')
    } finally {
      setBusy(false)
    }
  }

  const booked = Boolean(data?.already_booked_slot_id)
  const declinedOnly = data?.participation === 'declined' && !booked

  return (
    <div className="mx-auto max-w-lg space-y-6 py-4">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{title}</h1>
      {data && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {data.candidate_name}님,{' '}
          {declinedOnly
            ? '면접 불참으로 응답하셨습니다. 다시 참석하시려면 가능한 시간을 선택해 주세요.'
            : booked
              ? '예약을 변경하거나 취소할 수 있습니다.'
              : '가능한 시간을 선택하거나, 참석이 어려우면 아래에서 알려 주세요.'}{' '}
          (타임존: {data.timezone})
        </p>
      )}
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
      {!data && !error && <p className="text-sm text-slate-500">불러오는 중…</p>}
      {booked && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancel()}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-800 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950/40"
          >
            예약 취소
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void declineInterview()}
            className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-950/40"
          >
            면접 참석 어려움 (불참 응답)
          </button>
        </div>
      )}
      {!booked && !declinedOnly && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void declineInterview()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            면접 참석이 어렵습니다
          </button>
        </div>
      )}
      <ul className="space-y-2">
        {(data?.slots || []).map((s) => {
          const isCurrent = data?.already_booked_slot_id === s.id
          const disabledFirst = busy || s.remaining <= 0
          const disabledChange = declinedOnly
            ? busy || s.remaining <= 0
            : busy || (s.remaining <= 0 && !isCurrent) || (isCurrent && booked)
          const start = new Date(s.start_at).toLocaleString()
          const end = new Date(s.end_at).toLocaleString()
          return (
            <li key={s.id}>
              {booked || declinedOnly ? (
                <button
                  type="button"
                  disabled={disabledChange}
                  onClick={() => void (booked ? changeSlot(s.id) : book(s.id))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm transition-colors hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:border-violet-500/50"
                >
                  <span className="font-medium text-slate-900 dark:text-white">
                    {start} ~ {end}
                  </span>
                  <span className="ml-2 text-xs text-slate-500">남은 자리: {s.remaining}</span>
                  {isCurrent && booked && (
                    <span className="ml-2 text-xs font-medium text-violet-600 dark:text-violet-400">(현재 예약)</span>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={disabledFirst}
                  onClick={() => void book(s.id)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm transition-colors hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:border-violet-500/50"
                >
                  <span className="font-medium text-slate-900 dark:text-white">
                    {start} ~ {end}
                  </span>
                  <span className="ml-2 text-xs text-slate-500">남은 자리: {s.remaining}</span>
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {booked && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          다른 슬롯을 누르면 예약이 변경됩니다. 면접관 알림 등은 새 시간 기준으로 다시 잡힙니다.
        </p>
      )}
      {declinedOnly && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          시간을 다시 고르면 불참 응답이 해제되고 예약이 확정됩니다. 지원서와 연결된 경우 채용 단계도 함께 갱신됩니다.
        </p>
      )}
    </div>
  )
}
