import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  hrCreateSchedule,
  hrDeleteSchedule,
  hrGetSchedule,
  hrListSchedules,
  hrPatchSchedule,
} from '../api/client'

const TZ_OPTIONS = ['Asia/Seoul', 'Asia/Tokyo', 'UTC', 'America/New_York', 'Europe/London']

function localInputToIso(value) {
  if (!value || !String(value).trim()) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** ISO 문자열 → datetime-local (로컬 표시) */
function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function emptySlot() {
  return { start: '', end: '', capacity: 1 }
}

function emptyCandidate() {
  return { name: '', email: '', phone: '' }
}

function emptyInterviewer() {
  return { name: '', email: '', phone: '' }
}

export function HrSchedulesPage() {
  const [list, setList] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editingHasBookings, setEditingHasBookings] = useState(false)

  const [title, setTitle] = useState('1차 면접')
  const [timezone, setTimezone] = useState('Asia/Seoul')
  const [hrNotifyEmail, setHrNotifyEmail] = useState('')
  /** 슬롯당 지원자: single = 1:1, multiple = 슬롯 정원만큼 동시 면접 */
  const [intervieweePerSlot, setIntervieweePerSlot] = useState('single')
  const [slots, setSlots] = useState(() => [emptySlot(), emptySlot()])
  const [candidates, setCandidates] = useState(() => [emptyCandidate(), emptyCandidate()])
  const [interviewers, setInterviewers] = useState(() => [emptyInterviewer()])
  const [jsonPaste, setJsonPaste] = useState('')
  const [jsonMsg, setJsonMsg] = useState(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const rows = await hrListSchedules()
      setList(Array.isArray(rows) ? rows : [])
    } catch (e) {
      setError(e?.message || '목록 실패')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const resetForm = useCallback(() => {
    setEditingId(null)
    setEditingHasBookings(false)
    setTitle('1차 면접')
    setTimezone('Asia/Seoul')
    setHrNotifyEmail('')
    setIntervieweePerSlot('single')
    setSlots([emptySlot(), emptySlot()])
    setCandidates([emptyCandidate(), emptyCandidate()])
    setInterviewers([emptyInterviewer()])
    setJsonPaste('')
    setJsonMsg(null)
  }, [])

  const buildPayload = () => {
    const perSlot = intervieweePerSlot === 'multiple' ? 'multiple' : 'single'
    const slotPayload = slots
      .map((s) => {
        const rawCap = Math.min(50, Math.max(1, parseInt(String(s.capacity), 10) || 1))
        return {
          start_at: localInputToIso(s.start),
          end_at: localInputToIso(s.end),
          capacity: perSlot === 'single' ? 1 : rawCap,
        }
      })
      .filter((s) => s.start_at && s.end_at)

    const candPayload = candidates
      .filter((c) => (c.name || '').trim())
      .map((c) => ({
        name: (c.name || '').trim(),
        email: (c.email || '').trim(),
        phone: (c.phone || '').trim(),
      }))

    const invPayload = interviewers
      .filter((i) => (i.name || '').trim())
      .map((i) => ({
        name: (i.name || '').trim(),
        email: (i.email || '').trim(),
        phone: (i.phone || '').trim(),
      }))

    if (slotPayload.length === 0) {
      throw new Error('면접 슬롯을 하나 이상 입력하세요. (시작·종료 일시)')
    }
    for (const s of slotPayload) {
      if (new Date(s.end_at) <= new Date(s.start_at)) {
        throw new Error('각 슬롯에서 종료 시간은 시작보다 뒤여야 합니다.')
      }
    }
    if (candPayload.length === 0) {
      throw new Error('지원자를 한 명 이상 입력하세요. (이름 필수)')
    }

    const capSum = slotPayload.reduce((a, s) => a + s.capacity, 0)
    if (candPayload.length > capSum) {
      throw new Error(
        `지원자 ${candPayload.length}명인데, 현재 면접 방식·슬롯 정원 합은 ${capSum}명입니다. 슬롯을 늘리거나 다인원으로 바꾸세요.`,
      )
    }

    return {
      title: (title || '').trim() || '면접 일정',
      timezone: timezone || 'Asia/Seoul',
      hr_notify_email: (hrNotifyEmail || '').trim(),
      interviewee_per_slot: perSlot,
      slots: slotPayload,
      candidates: candPayload,
      interviewers: invPayload,
    }
  }

  const startEdit = async (roundId) => {
    setError(null)
    setBusy(true)
    try {
      const d = await hrGetSchedule(roundId)
      setEditingId(roundId)
      setEditingHasBookings(Boolean(d.has_bookings))
      setTitle(d.title || '면접 일정')
      setTimezone(d.timezone || 'Asia/Seoul')
      setHrNotifyEmail(d.hr_notify_email || '')
      setIntervieweePerSlot(d.interviewee_per_slot === 'multiple' ? 'multiple' : 'single')
      if (Array.isArray(d.slots) && d.slots.length) {
        setSlots(
          d.slots.map((s) => ({
            start: isoToLocalInput(s.start_at),
            end: isoToLocalInput(s.end_at),
            capacity: s.capacity ?? 1,
          })),
        )
      } else {
        setSlots([emptySlot()])
      }
      if (Array.isArray(d.candidates) && d.candidates.length) {
        setCandidates(
          d.candidates.map((c) => ({
            name: c.name || '',
            email: c.email || '',
            phone: c.phone || '',
          })),
        )
      } else {
        setCandidates([emptyCandidate()])
      }
      if (Array.isArray(d.interviewers) && d.interviewers.length) {
        setInterviewers(
          d.interviewers.map((i) => ({
            name: i.name || '',
            email: i.email || '',
            phone: i.phone || '',
          })),
        )
      } else {
        setInterviewers([emptyInterviewer()])
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e?.message || '일정을 불러올 수 없습니다.')
    } finally {
      setBusy(false)
    }
  }

  const removeRound = async (roundId) => {
    if (!window.confirm('이 면접 일정을 삭제할까요? 지원자 링크는 더 이상 동작하지 않습니다.')) return
    setBusy(true)
    setError(null)
    try {
      await hrDeleteSchedule(roundId)
      if (editingId === roundId) resetForm()
      await refresh()
    } catch (e) {
      setError(e?.message || '삭제 실패')
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (editingId) {
        if (editingHasBookings) {
          await hrPatchSchedule(editingId, {
            title: (title || '').trim() || '면접 일정',
            timezone: timezone || 'Asia/Seoul',
            hr_notify_email: (hrNotifyEmail || '').trim(),
            interviewee_per_slot: intervieweePerSlot === 'multiple' ? 'multiple' : 'single',
          })
        } else {
          const full = buildPayload()
          await hrPatchSchedule(editingId, full)
        }
        resetForm()
      } else {
        const payload = buildPayload()
        await hrCreateSchedule(payload)
        resetForm()
      }
      await refresh()
    } catch (err) {
      setError(err?.message || (editingId ? '수정 실패' : '생성 실패'))
    } finally {
      setBusy(false)
    }
  }

  const applyJsonToForm = () => {
    if (editingHasBookings) {
      setJsonMsg('예약이 있는 일정은 JSON 반영으로 슬롯을 바꿀 수 없습니다.')
      return
    }
    setJsonMsg(null)
    try {
      const o = JSON.parse(jsonPaste)
      if (typeof o.title === 'string') setTitle(o.title)
      if (typeof o.timezone === 'string') setTimezone(o.timezone)
      if (typeof o.hr_notify_email === 'string') setHrNotifyEmail(o.hr_notify_email)
      const jsonMode =
        o.interviewee_per_slot === 'multiple' || o.interviewee_per_slot === 'single'
          ? o.interviewee_per_slot
          : null
      if (Array.isArray(o.slots) && o.slots.length) {
        setSlots(
          o.slots.map((s) => ({
            start: s.start_at ? isoToLocalInput(s.start_at) : s.start_at?.slice?.(0, 16) || '',
            end: s.end_at ? isoToLocalInput(s.end_at) : s.end_at?.slice?.(0, 16) || '',
            capacity: jsonMode === 'single' ? 1 : s.capacity ?? 1,
          })),
        )
      } else if (jsonMode === 'single') {
        setSlots((arr) => arr.map((x) => ({ ...x, capacity: 1 })))
      }
      if (jsonMode) setIntervieweePerSlot(jsonMode)
      if (Array.isArray(o.candidates) && o.candidates.length) {
        setCandidates(
          o.candidates.map((c) => ({
            name: c.name || '',
            email: c.email || '',
            phone: c.phone || '',
          })),
        )
      }
      if (Array.isArray(o.interviewers)) {
        setInterviewers(
          o.interviewers.length
            ? o.interviewers.map((i) => ({
                name: i.name || '',
                email: i.email || '',
                phone: i.phone || '',
              }))
            : [emptyInterviewer()],
        )
      }
      setJsonMsg('폼에 반영했습니다.')
    } catch {
      setJsonMsg('JSON을 파싱할 수 없습니다.')
    }
  }

  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''

  const structuralLocked = Boolean(editingId && editingHasBookings)

  const capacityPreview = useMemo(() => {
    const filled = slots.filter((s) => localInputToIso(s.start) && localInputToIso(s.end))
    const sum = filled.reduce((acc, s) => {
      const cap =
        intervieweePerSlot === 'single'
          ? 1
          : Math.min(50, Math.max(1, parseInt(String(s.capacity), 10) || 1))
      return acc + cap
    }, 0)
    const named = candidates.filter((c) => (c.name || '').trim()).length
    return { slotRows: filled.length, sum, named }
  }, [slots, candidates, intervieweePerSlot])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">면접 일정 조율</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            폼으로 등록·수정합니다. 예약이 생긴 일정은 제목·타임존·담당 메일·면접 방식(조건부)만 바꿀 수 있습니다. 지원자에게 링크를 전달하세요.
          </p>
        </div>
        <Link to="/hr" className="text-sm text-violet-600 hover:underline dark:text-violet-400">
          ← HR 홈
        </Link>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      )}

      {editingId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3 text-sm dark:border-violet-900/40 dark:bg-violet-950/30">
          <span className="font-medium text-violet-900 dark:text-violet-100">
            일정 수정 중
            {structuralLocked && (
              <span className="ml-2 font-normal text-violet-800 dark:text-violet-200">
                (예약 있음 → 슬롯·지원자·면접관 변경 불가)
              </span>
            )}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => resetForm()}
            className="rounded-lg border border-violet-300 px-3 py-1 text-xs text-violet-900 hover:bg-white/80 dark:border-violet-700 dark:text-violet-100 dark:hover:bg-violet-900/40"
          >
            수정 취소
          </button>
        </div>
      )}

      <form onSubmit={submit} className="space-y-8 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">기본 정보</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              일정 제목
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              타임존
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              >
                {TZ_OPTIONS.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 sm:col-span-2">
              인사 담당자 알림 메일 (선택)
              <input
                type="email"
                value={hrNotifyEmail}
                onChange={(e) => setHrNotifyEmail(e.target.value)}
                placeholder="hr@company.com"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">면접 방식 (슬롯당 지원자)</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            1:1은 슬롯마다 한 명만 배정됩니다(정원은 자동으로 1). 다인원은 같은 시간대에 정원만큼 동시에 면접할 때 사용합니다.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-2 text-slate-800 dark:text-slate-200">
              <input
                type="radio"
                name="interviewee_per_slot"
                value="single"
                checked={intervieweePerSlot === 'single'}
                onChange={() => {
                  setIntervieweePerSlot('single')
                  setSlots((arr) => arr.map((x) => ({ ...x, capacity: 1 })))
                }}
                className="text-violet-600"
              />
              1:1 (슬롯당 1명)
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-slate-800 dark:text-slate-200">
              <input
                type="radio"
                name="interviewee_per_slot"
                value="multiple"
                checked={intervieweePerSlot === 'multiple'}
                onChange={() => setIntervieweePerSlot('multiple')}
                className="text-violet-600"
              />
              다인원 (슬롯 정원만큼)
            </label>
          </div>
          {structuralLocked && intervieweePerSlot === 'single' && (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              예약이 있는 상태에서 1:1로 두려면, 저장된 모든 슬롯 정원이 이미 1이어야 합니다. 그렇지 않으면 서버에서 거절됩니다.
            </p>
          )}
          {capacityPreview.slotRows > 0 && (
            <p
              className={
                capacityPreview.named > capacityPreview.sum
                  ? 'text-xs font-medium text-amber-800 dark:text-amber-200'
                  : 'text-xs text-slate-600 dark:text-slate-400'
              }
            >
              유효 슬롯 {capacityPreview.slotRows}개 · 정원 합 {capacityPreview.sum}명 · 이름 있는 지원자{' '}
              {capacityPreview.named}명
              {capacityPreview.named > capacityPreview.sum ? ' → 정원 합보다 지원자가 많습니다.' : ''}
            </p>
          )}
        </section>

        <fieldset
          disabled={structuralLocked}
          className={structuralLocked ? 'space-y-8 opacity-60' : 'space-y-8'}
        >
          {structuralLocked && (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              예약된 지원자가 있어 슬롯·지원자·면접관은 고칠 수 없습니다. 바꾸려면 새 일정을 만든 뒤 이 일정을 삭제하세요.
            </p>
          )}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">면접 슬롯</h2>
              <button
                type="button"
                disabled={structuralLocked}
                onClick={() => setSlots((s) => [...s, emptySlot()])}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                슬롯 추가
              </button>
            </div>
            <ul className="space-y-3">
              {slots.map((s, idx) => (
                <li
                  key={idx}
                  className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800"
                >
                  <label className="min-w-[10rem] flex-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                    시작
                    <input
                      type="datetime-local"
                      value={s.start}
                      onChange={(e) => {
                        const v = e.target.value
                        setSlots((arr) => arr.map((x, i) => (i === idx ? { ...x, start: v } : x)))
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <label className="min-w-[10rem] flex-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                    종료
                    <input
                      type="datetime-local"
                      value={s.end}
                      onChange={(e) => {
                        const v = e.target.value
                        setSlots((arr) => arr.map((x, i) => (i === idx ? { ...x, end: v } : x)))
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <label className="w-20 text-xs font-medium text-slate-600 dark:text-slate-400">
                    정원
                    <input
                      type="number"
                      min={1}
                      max={50}
                      disabled={intervieweePerSlot === 'single'}
                      title={intervieweePerSlot === 'single' ? '1:1 모드에서는 슬롯당 1명으로 고정됩니다.' : undefined}
                      value={intervieweePerSlot === 'single' ? 1 : s.capacity}
                      onChange={(e) => {
                        const v = e.target.value
                        setSlots((arr) => arr.map((x, i) => (i === idx ? { ...x, capacity: v } : x)))
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={structuralLocked || slots.length <= 1}
                    onClick={() => setSlots((arr) => arr.filter((_, i) => i !== idx))}
                    className="mb-0.5 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">지원자</h2>
              <button
                type="button"
                disabled={structuralLocked}
                onClick={() => setCandidates((c) => [...c, emptyCandidate()])}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                행 추가
              </button>
            </div>
            <ul className="space-y-3">
              {candidates.map((c, idx) => (
                <li
                  key={idx}
                  className="grid gap-2 rounded-xl border border-slate-100 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] dark:border-slate-800"
                >
                  <input
                    placeholder="이름 *"
                    value={c.name}
                    onChange={(e) => {
                      const v = e.target.value
                      setCandidates((arr) => arr.map((x, i) => (i === idx ? { ...x, name: v } : x)))
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <input
                    type="email"
                    placeholder="이메일"
                    value={c.email}
                    onChange={(e) => {
                      const v = e.target.value
                      setCandidates((arr) => arr.map((x, i) => (i === idx ? { ...x, email: v } : x)))
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <input
                    placeholder="전화 (SMS용)"
                    value={c.phone}
                    onChange={(e) => {
                      const v = e.target.value
                      setCandidates((arr) => arr.map((x, i) => (i === idx ? { ...x, phone: v } : x)))
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    disabled={structuralLocked || candidates.length <= 1}
                    onClick={() => setCandidates((arr) => arr.filter((_, i) => i !== idx))}
                    className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">면접관 (리마인더 수신)</h2>
              <button
                type="button"
                disabled={structuralLocked}
                onClick={() => setInterviewers((inv) => [...inv, emptyInterviewer()])}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                행 추가
              </button>
            </div>
            <ul className="space-y-3">
              {interviewers.map((inv, idx) => (
                <li
                  key={idx}
                  className="grid gap-2 rounded-xl border border-slate-100 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] dark:border-slate-800"
                >
                  <input
                    placeholder="이름 *"
                    value={inv.name}
                    onChange={(e) => {
                      const v = e.target.value
                      setInterviewers((arr) => arr.map((x, i) => (i === idx ? { ...x, name: v } : x)))
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <input
                    type="email"
                    placeholder="이메일"
                    value={inv.email}
                    onChange={(e) => {
                      const v = e.target.value
                      setInterviewers((arr) => arr.map((x, i) => (i === idx ? { ...x, email: v } : x)))
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <input
                    placeholder="전화 (SMS)"
                    value={inv.phone}
                    onChange={(e) => {
                      const v = e.target.value
                      setInterviewers((arr) => arr.map((x, i) => (i === idx ? { ...x, phone: v } : x)))
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    disabled={structuralLocked || interviewers.length <= 1}
                    onClick={() => setInterviewers((arr) => arr.filter((_, i) => i !== idx))}
                    className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {busy ? '처리 중…' : editingId ? '변경 저장' : '일정 생성'}
          </button>
        </div>

        <details className="rounded-xl border border-dashed border-slate-200 p-4 dark:border-slate-700">
          <summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-400">
            JSON 붙여넣기 (고급)
          </summary>
          <textarea
            rows={8}
            value={jsonPaste}
            onChange={(e) => setJsonPaste(e.target.value)}
            disabled={structuralLocked}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="button"
            disabled={structuralLocked}
            onClick={() => applyJsonToForm()}
            className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            폼에 반영
          </button>
          {jsonMsg && <p className="mt-2 text-xs text-violet-700 dark:text-violet-300">{jsonMsg}</p>}
        </details>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-left dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">생성된 일정</h2>
        <ul className="mt-4 space-y-6 text-sm">
          {list.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{r.title}</p>
                  <p className="text-xs text-slate-500">
                    타임존: {r.timezone}
                    {r.interviewee_per_slot === 'multiple' ? (
                      <span className="ml-2 rounded bg-sky-100 px-1.5 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100">
                        다인원 슬롯
                      </span>
                    ) : (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        1:1
                      </span>
                    )}
                    {typeof r.slot_total_capacity === 'number' && typeof r.candidate_count === 'number' && (
                      <span className="ml-2 text-slate-500">
                        정원 합 {r.slot_total_capacity}명 · 지원자 {r.candidate_count}명
                      </span>
                    )}
                    {r.has_bookings ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                        예약 있음
                      </span>
                    ) : (
                      <span className="ml-2 text-slate-400">예약 없음</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={`/hr/schedules/${r.id}/status`}
                    className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-900/50"
                  >
                    응답 현황
                  </Link>
                  <Link
                    to={`/hr/schedules/${r.id}/evaluations`}
                    className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100 dark:hover:bg-sky-900/50"
                  >
                    면접 평가
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void startEdit(r.id)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeRound(r.id)}
                    className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-800 hover:bg-red-50 dark:border-red-900/50 dark:text-red-200 dark:hover:bg-red-950/30"
                  >
                    삭제
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">지원자 선택 링크</p>
                <ul className="space-y-1 font-mono text-xs text-violet-700 dark:text-violet-300">
                  {(r.candidates || []).map((c) => (
                    <li key={c.id}>
                      {c.name}: {origin}
                      {c.pick_url_path}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
