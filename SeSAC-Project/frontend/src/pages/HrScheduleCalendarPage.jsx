import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { hrListSchedules } from '../api/client'

const DISPLAY_TZ = 'Asia/Seoul'
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토']

const TAG_STYLES = [
  'border border-rose-200/90 bg-rose-100/95 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/60 dark:text-rose-100',
  'border border-sky-200/90 bg-sky-100/95 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/60 dark:text-sky-100',
  'border border-violet-200/90 bg-violet-100/95 text-violet-950 dark:border-violet-900/50 dark:bg-violet-950/60 dark:text-violet-100',
  'border border-amber-200/90 bg-amber-100/95 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/60 dark:text-amber-100',
]

function ymdInTz(isoOrDate, timeZone) {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function cellKeyForGregorian(year, monthIndex, day, timeZone) {
  const localNoon = new Date(year, monthIndex, day, 12, 0, 0)
  return ymdInTz(localNoon, timeZone)
}

function todayYmd(timeZone) {
  return ymdInTz(new Date(), timeZone)
}

function monthMatrix(year, monthIndex) {
  const first = new Date(year, monthIndex, 1)
  const pad = first.getDay()
  const cells = []
  let n = 1 - pad
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, monthIndex, n)
    cells.push({
      day: n,
      inMonth: d.getMonth() === monthIndex,
      date: d,
    })
    n += 1
  }
  return cells
}

function styleForRoundId(roundId) {
  let h = 0
  for (let i = 0; i < roundId.length; i++) h = (h + roundId.charCodeAt(i) * (i + 1)) % 997
  return TAG_STYLES[h % TAG_STYLES.length]
}

function formatMonthTitle(year, monthIndex) {
  const d = new Date(year, monthIndex, 1)
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', timeZone: DISPLAY_TZ }).format(d)
}

function formatFocusedHeading(ymd, timeZone) {
  if (!ymd) return '—'
  const [y, m, day] = ymd.split('-').map((x) => parseInt(x, 10))
  const d = new Date(y, m - 1, day, 12, 0, 0)
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

/** YYYY-MM-DD → 해당 일의 서울 기준 키와 달력 표시용 연·월(0-based) */
function applyCalendarDateFromYmd(ymd, setters) {
  const parts = String(ymd || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!parts) return false
  const y = parseInt(parts[1], 10)
  const mo = parseInt(parts[2], 10)
  const da = parseInt(parts[3], 10)
  if (!y || mo < 1 || mo > 12 || da < 1 || da > 31) return false
  const localNoon = new Date(y, mo - 1, da, 12, 0, 0)
  const key = ymdInTz(localNoon, DISPLAY_TZ)
  if (!key) return false
  setters.setViewYear(y)
  setters.setViewMonth(mo - 1)
  setters.setSelectedYmd(key)
  return true
}

function formatSlotRange(startIso, endIso, timeZone) {
  try {
    const o = { timeZone, hour: '2-digit', minute: '2-digit' }
    const a = new Date(startIso).toLocaleString('ko-KR', { ...o, weekday: 'short' })
    const b = new Date(endIso).toLocaleString('ko-KR', o)
    return `${a} ~ ${b}`
  } catch {
    return `${startIso} ~ ${endIso}`
  }
}

export function HrScheduleCalendarPage() {
  const [viewYear, setViewYear] = useState(() => {
    const p = todayYmd(DISPLAY_TZ).split('-').map((x) => parseInt(x, 10))
    return p[0] || new Date().getFullYear()
  })
  const [viewMonth, setViewMonth] = useState(() => {
    const p = todayYmd(DISPLAY_TZ).split('-').map((x) => parseInt(x, 10))
    return Math.min(11, Math.max(0, (p[1] || 1) - 1))
  })
  const [selectedYmd, setSelectedYmd] = useState(() => todayYmd(DISPLAY_TZ))
  const [rounds, setRounds] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setError(null)
    try {
      const rows = await hrListSchedules()
      setRounds(Array.isArray(rows) ? rows : [])
    } catch (e) {
      setError(e?.message || '일정을 불러오지 못했습니다.')
      setRounds([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      void load()
    }, 8000)
    return () => window.clearInterval(t)
  }, [load])

  const eventsByYmd = useMemo(() => {
    const map = new Map()
    for (const r of rounds) {
      const tz = (r.timezone || DISPLAY_TZ).trim() || DISPLAY_TZ
      const title = (r.title || '면접 일정').trim()
      const roundSlots = [...(r.slots || [])].sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
      const firstSlotIdByDay = new Map()
      for (const s0 of roundSlots) {
        const k0 = ymdInTz(s0.start_at, DISPLAY_TZ)
        if (k0 && !firstSlotIdByDay.has(k0)) firstSlotIdByDay.set(k0, String(s0.id))
      }

      for (const s of roundSlots) {
        const key = ymdInTz(s.start_at, DISPLAY_TZ)
        if (!key) continue
        const sid = String(s.id)
        const candidates = r.candidates || []
        const assignedNames = []
        const pendingNames = []
        const declinedNames = []
        const otherSlotNames = []
        for (const c of candidates) {
          const nm = (c.name || '').trim() || '이름 없음'
          if (c.declined) {
            declinedNames.push(nm)
            continue
          }
          const bid = c.booked_slot_id != null ? String(c.booked_slot_id) : ''
          if (bid === sid) assignedNames.push(nm)
          else if (!bid) pendingNames.push(nm)
          else otherSlotNames.push(nm)
        }
        const showDeclinedOnThisCard = firstSlotIdByDay.get(key) === sid
        const ev = {
          id: `${r.id}-${s.id}`,
          roundId: r.id,
          slotId: s.id,
          title,
          department: r.department || '',
          jobTitle: r.job_title || '',
          startAt: s.start_at,
          endAt: s.end_at,
          timezone: tz,
          remaining: s.remaining,
          capacity: s.capacity,
          style: styleForRoundId(String(r.id)),
          assignedNames,
          pendingNames,
          declinedNames: showDeclinedOnThisCard ? declinedNames : [],
          otherSlotNames,
        }
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(ev)
      }
    }
    for (const [, list] of map) {
      list.sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
    }
    return map
  }, [rounds])

  const cells = useMemo(() => monthMatrix(viewYear, viewMonth), [viewYear, viewMonth])
  const todayKey = todayYmd(DISPLAY_TZ)

  const goToToday = () => {
    const t = todayYmd(DISPLAY_TZ)
    applyCalendarDateFromYmd(t, { setViewYear, setViewMonth, setSelectedYmd })
  }

  const onPickJumpDate = (e) => {
    const v = e.target.value
    if (!v) return
    applyCalendarDateFromYmd(v, { setViewYear, setViewMonth, setSelectedYmd })
  }

  const focusedEvents = selectedYmd ? eventsByYmd.get(selectedYmd) || [] : []

  const prevMonth = () => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1)
        return 11
      }
      return m - 1
    })
  }

  const nextMonth = () => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1)
        return 0
      }
      return m + 1
    })
  }

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">일정 관리</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            면접 일정을 계획하고 합격자를 배정하세요.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/hr/schedules"
            className="hr-btn-primary"
          >
            <span className="text-lg leading-none">+</span>
            Add Schedule
          </Link>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      )}

      <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_min(100%,380px)]">
        <section className="hr-panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {formatMonthTitle(viewYear, viewMonth)}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={goToToday}
                className="hr-btn-ghost text-xs"
              >
                오늘
              </button>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <span className="whitespace-nowrap">날짜 이동</span>
                <input
                  type="date"
                  value={selectedYmd && /^\d{4}-\d{2}-\d{2}$/.test(selectedYmd) ? selectedYmd : ''}
                  onChange={onPickJumpDate}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <div className="ml-auto flex gap-1 sm:ml-0">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="hr-btn-ghost px-2.5 py-1 text-sm"
                  aria-label="이전 달"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="hr-btn-ghost px-2.5 py-1 text-sm"
                  aria-label="다음 달"
                >
                  ›
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-slate-100 dark:bg-slate-800">
            {WEEKDAYS_KO.map((w) => (
              <div
                key={w}
                className="bg-slate-50 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/80 dark:text-slate-400"
              >
                {w}
              </div>
            ))}
            {cells.map((cell, idx) => {
              const key = cellKeyForGregorian(viewYear, viewMonth, cell.day, DISPLAY_TZ)
              const isSelected = key && selectedYmd === key
              const isToday = key && todayKey === key
              const dayEvents = key ? eventsByYmd.get(key) || [] : []
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => key && setSelectedYmd(key)}
                  className={`min-h-[5.5rem] bg-white p-1.5 text-left align-top transition-colors hover:bg-sky-50/80 dark:bg-slate-950/40 dark:hover:bg-slate-800/60 ${
                    isSelected ? 'ring-2 ring-inset ring-sky-400 dark:ring-sky-500' : ''
                  } ${!cell.inMonth ? 'opacity-40' : ''}`}
                >
                  <span
                    className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg text-sm font-medium ${
                      isToday
                        ? 'bg-sky-500 text-white dark:bg-sky-600'
                        : cell.inMonth
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-400'
                    }`}
                  >
                    {cell.date.getDate()}
                  </span>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <span
                        key={ev.id}
                        className={`truncate rounded-md px-1 py-0.5 text-[10px] font-medium leading-tight ${ev.style}`}
                        title={ev.title}
                      >
                        {ev.title}
                      </span>
                    ))}
                    {dayEvents.length > 2 ? (
                      <span className="text-[10px] font-medium text-slate-500">+{dayEvents.length - 2}</span>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-[22px] bg-gradient-to-br from-slate-900 to-indigo-950 p-6 text-white shadow-xl shadow-indigo-950/30">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-sky-300/90">Focused date</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{formatFocusedHeading(selectedYmd, DISPLAY_TZ)}</p>
            <p className="mt-2 text-sm text-slate-300">선택한 날짜의 면접 슬롯과 바로가기입니다.</p>
          </div>

          <div className="hr-panel flex-1 p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">이 날의 일정</h3>
            {loading && !rounds.length ? (
              <p className="mt-4 text-sm text-slate-500">불러오는 중…</p>
            ) : focusedEvents.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">등록된 면접 슬롯이 없습니다.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {focusedEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/40"
                  >
                    <p className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${ev.style}`}>{ev.title}</p>
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                      {formatSlotRange(ev.startAt, ev.endAt, ev.timezone)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      잔여 {ev.remaining ?? '—'} / 정원 {ev.capacity ?? '—'}
                      {(ev.department || ev.jobTitle) && (
                        <>
                          <br />
                          {[ev.department, ev.jobTitle].filter(Boolean).join(' · ')}
                        </>
                      )}
                    </p>
                    <div className="mt-2 space-y-1.5 border-t border-slate-200/80 pt-2 text-[11px] dark:border-slate-700/80">
                      <p className="text-slate-700 dark:text-slate-200">
                        <span className="font-semibold text-slate-600 dark:text-slate-400">이 시간 예약</span>{' '}
                        {ev.assignedNames?.length ? ev.assignedNames.join(', ') : '—'}
                      </p>
                      {ev.pendingNames?.length ? (
                        <p className="text-amber-900 dark:text-amber-100/90">
                          <span className="font-semibold">시간 미선택</span> {ev.pendingNames.join(', ')}
                        </p>
                      ) : null}
                      {ev.otherSlotNames?.length ? (
                        <p className="text-slate-600 dark:text-slate-400">
                          <span className="font-semibold text-slate-500 dark:text-slate-500">다른 슬롯 예약</span>{' '}
                          {ev.otherSlotNames.join(', ')}
                        </p>
                      ) : null}
                      {ev.declinedNames?.length ? (
                        <p className="text-slate-500 dark:text-slate-500">
                          <span className="font-semibold">불참</span> {ev.declinedNames.join(', ')}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link
                        to={`/hr/schedules/${ev.roundId}/status`}
                        className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
                      >
                        응답·예약 현황
                      </Link>
                      <Link
                        to={`/hr/schedules/${ev.roundId}/evaluations`}
                        className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
                      >
                        평가표
                      </Link>
                      <Link
                        to={`/hr/schedules?edit=${encodeURIComponent(ev.roundId)}`}
                        className="text-xs font-medium text-slate-500 hover:underline"
                      >
                        일정 편집
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <footer className="mt-auto pt-10 text-center text-[11px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-600">
        
      </footer>
    </div>
  )
}
