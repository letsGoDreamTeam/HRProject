import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { hrGetSchedule, hrGetScheduleBookingStatus, hrListSchedules } from '../api/client'

const TZ_DEFAULT = 'Asia/Seoul'

async function mapLimit(items, limit, mapper) {
  const out = []
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit)
    const part = await Promise.all(chunk.map(mapper))
    out.push(...part)
  }
  return out
}

/** 표시용 유형(한글) */
function inferTagLabel(round, title) {
  const t = (title || '').toLowerCase()
  if (t.includes('코딩') || t.includes('coding') || t.includes('코드')) return '코딩 테스트'
  if (round?.interview_phase === 'second_interview') return '2차 면접'
  if (round?.interview_phase === 'first_interview') return '1차 면접'
  return '면접'
}

function locationPill(round) {
  const blob = `${round?.title || ''} ${round?.job_title || ''}`.toLowerCase()
  if (blob.includes('온라인') || blob.includes('online') || blob.includes('화상') || blob.includes('remote'))
    return { label: '온라인 세션', className: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100' }
  const dep = (round?.department || '').trim()
  if (dep) return { label: dep.slice(0, 24), className: 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100' }
  return { label: '장소 협의', className: 'border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100' }
}

function formatScheduleCell(startIso, endIso, timeZone) {
  try {
    const tz = timeZone || TZ_DEFAULT
    const d0 = new Date(startIso)
    const d1 = new Date(endIso)
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d0)
    const t0 = new Intl.DateTimeFormat('ko-KR', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d0)
    const t1 = new Intl.DateTimeFormat('ko-KR', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d1)
    return { line1: dateStr, line2: `${t0} - ${t1}` }
  } catch {
    return { line1: startIso, line2: '' }
  }
}

function sortKey(startIso) {
  const t = new Date(startIso).getTime()
  return Number.isNaN(t) ? 0 : t
}

function buildTableRows(roundsList, details) {
  const rows = []
  for (const pack of details) {
    const { listRound, detail, bookStat } = pack
    if (!detail?.slots?.length) continue
    const tz = (detail.timezone || listRound?.timezone || TZ_DEFAULT).trim() || TZ_DEFAULT
    const title = (detail.title || listRound?.title || '면접 일정').trim()
    const tagLabel = inferTagLabel(detail, title)
    const loc = locationPill(detail)
    const perSlotMode = (detail.interviewee_per_slot || 'single') === 'multiple' ? 'multiple' : 'single'
    const statusByCandId = {}
    for (const c of bookStat?.candidates || []) {
      statusByCandId[String(c.id)] = c.status
    }
    const cands = detail.candidates || []
    const sortedSlots = [...detail.slots].sort((a, b) => sortKey(a.start_at) - sortKey(b.start_at))
    const slotTotal = sortedSlots.length
    sortedSlots.forEach((slot, idx) => {
      const sid = String(slot.id)
      const assigned = cands
        .filter((c) => c.booked_slot_id && String(c.booked_slot_id) === sid)
        .map((c) => ({
          id: String(c.id),
          name: (c.name || '').trim() || '이름 없음',
          initial: ((c.name || '?').trim()[0] || '?').toUpperCase(),
          status: statusByCandId[String(c.id)] || 'confirmed',
        }))
      const { line1, line2 } = formatScheduleCell(slot.start_at, slot.end_at, tz)
      rows.push({
        key: `${detail.id}-${slot.id}`,
        roundId: detail.id,
        slotId: slot.id,
        title,
        tagLabel,
        slotOrdinal: idx + 1,
        slotTotal,
        perSlotMode,
        scheduleLine1: line1,
        scheduleLine2: line2,
        sortAt: sortKey(slot.start_at),
        timezone: tz,
        candidates: assigned,
        remaining: slot.remaining,
        capacity: slot.capacity,
        location: loc,
      })
    })
  }
  rows.sort((a, b) => a.sortAt - b.sortAt)
  return rows
}

function fmtBookingRange(startIso, endIso, tz) {
  if (!startIso || !endIso) return '—'
  try {
    const o = { timeZone: tz || TZ_DEFAULT, dateStyle: 'medium', timeStyle: 'short' }
    const a = new Date(startIso).toLocaleString('ko-KR', o)
    const b = new Date(endIso).toLocaleString('ko-KR', { ...o, dateStyle: undefined })
    return `${a} ~ ${b}`
  } catch {
    return `${startIso} ~ ${endIso}`
  }
}

function applicantStatusOrder(status) {
  if (status === 'pending') return 0
  if (status === 'declined') return 1
  return 2
}

/** 라운드별 booking-status 응답을 합쳐 지원자 1행 = 1명 */
function buildApplicantRows(packs) {
  const rows = []
  for (const pack of packs) {
    const bs = pack.bookStat
    if (!bs?.candidates?.length) continue
    const tz = (bs.timezone || TZ_DEFAULT).trim() || TZ_DEFAULT
    for (const c of bs.candidates) {
      rows.push({
        key: `${bs.round_id}-${c.id}`,
        roundId: bs.round_id,
        roundTitle: (bs.title || '').trim() || '면접 일정',
        timezone: tz,
        candidateId: c.id,
        name: (c.name || '').trim() || '이름 없음',
        email: (c.email || '').trim(),
        phone: (c.phone || '').trim(),
        status: c.status,
        slotStartAt: c.slot_start_at,
        slotEndAt: c.slot_end_at,
        pickUrl: (c.pick_url_absolute || '').trim(),
      })
    }
  }
  rows.sort((a, b) => {
    const o = applicantStatusOrder(a.status) - applicantStatusOrder(b.status)
    if (o !== 0) return o
    const rt = a.roundTitle.localeCompare(b.roundTitle, 'ko')
    if (rt !== 0) return rt
    return a.name.localeCompare(b.name, 'ko')
  })
  return rows
}

export function HrScheduleIntegratedPage() {
  const [query, setQuery] = useState('')
  const [viewTab, setViewTab] = useState('slots')
  const [rows, setRows] = useState([])
  const [applicantRows, setApplicantRows] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copyHint, setCopyHint] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const list = await hrListSchedules()
      const rounds = Array.isArray(list) ? list : []
      const packs = await mapLimit(rounds, 5, async (r) => {
        const id = r.id
        try {
          const [detail, bookStat] = await Promise.all([
            hrGetSchedule(id),
            hrGetScheduleBookingStatus(id).catch(() => null),
          ])
          return { listRound: r, detail, bookStat }
        } catch {
          return { listRound: r, detail: null, bookStat: null }
        }
      })
      setRows(buildTableRows(rounds, packs))
      setApplicantRows(buildApplicantRows(packs))
    } catch (e) {
      setError(e?.message || '데이터를 불러오지 못했습니다.')
      setRows([])
      setApplicantRows([])
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      const blob = [
        row.title,
        row.tagLabel,
        row.scheduleLine1,
        row.scheduleLine2,
        row.location.label,
        ...row.candidates.map((c) => c.name),
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [rows, query])

  const filteredApplicants = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return applicantRows
    return applicantRows.filter((r) => {
      const statusKo =
        r.status === 'confirmed' ? '확정' : r.status === 'declined' ? '불참' : '미선택'
      const slotText = fmtBookingRange(r.slotStartAt, r.slotEndAt, r.timezone)
      const blob = [r.roundTitle, r.name, r.email, r.phone, statusKo, slotText].join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [applicantRows, query])

  const copyPickUrl = async (url, rowKey) => {
    if (!url) {
      setCopyHint({ key: rowKey, ok: false })
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopyHint({ key: rowKey, ok: true })
    } catch {
      setCopyHint({ key: rowKey, ok: false })
    }
    window.setTimeout(() => setCopyHint(null), 2200)
  }

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col">
      <div className="flex flex-wrap items-start gap-3 pb-6">
        <span className="mt-1 text-2xl" aria-hidden>
          📋
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">일정 통합 관리</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            면접 라운드·슬롯·지원자 응답을 한곳에서 봅니다.{' '}
            <strong className="text-slate-700 dark:text-slate-300">시간 슬롯</strong> 탭은 재고·예약 현황,{' '}
            <strong className="text-slate-700 dark:text-slate-300">지원자</strong> 탭은 미선택·확정·불참을 사람 단위로
            모읍니다. 약 8초마다 갱신됩니다.
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="면접명, 지원자명, 이메일…"
          className="w-full flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
        />
        <Link
          to="/hr/schedules"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:from-violet-500 hover:to-indigo-500"
        >
          <span className="text-lg leading-none">+</span>
          신규 일정 등록
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-lg shadow-slate-200/30 dark:border-slate-800 dark:bg-slate-900/40 dark:shadow-none">
        <div
          className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50/80 px-2 py-2 dark:border-slate-800 dark:bg-slate-900/60"
          role="tablist"
          aria-label="표 보기 전환"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewTab === 'slots'}
            onClick={() => setViewTab('slots')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              viewTab === 'slots'
                ? 'bg-white text-violet-800 shadow-sm dark:bg-slate-800 dark:text-violet-200'
                : 'text-slate-600 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-slate-800/50'
            }`}
          >
            시간 슬롯별
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewTab === 'applicants'}
            onClick={() => setViewTab('applicants')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              viewTab === 'applicants'
                ? 'bg-white text-violet-800 shadow-sm dark:bg-slate-800 dark:text-violet-200'
                : 'text-slate-600 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-slate-800/50'
            }`}
          >
            지원자별
          </button>
        </div>
        <p className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
          {viewTab === 'slots' ? (
            <>
              각 행은 <strong className="text-slate-600 dark:text-slate-300">가능한 시간 슬롯 1개</strong>입니다. 같은
              면접이라도 슬롯 수만큼 여러 줄이 보일 수 있습니다.
            </>
          ) : (
            <>
              등록된 면접마다 응답 API로 모은 <strong className="text-slate-600 dark:text-slate-300">지원자 1명당 1행</strong>
              입니다. 미선택이 위쪽에 모이며, 재안내·링크 복사는 라운드「응답」화면에서 할 수 있습니다.
            </>
          )}
        </p>

        <div className="overflow-x-auto">
          {viewTab === 'slots' ? (
            <table className="min-w-[900px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/80">
                  <th className="px-5 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                    면접명 · 유형
                  </th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">가능 시간</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                    <span className="block">예약 지원자</span>
                    <span className="mt-0.5 block text-[10px] font-normal text-slate-400 dark:text-slate-500">
                      링크로 이 슬롯 선택 시
                    </span>
                  </th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">장소</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">바로가기</th>
                </tr>
              </thead>
              <tbody>
                {loading && !rows.length ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                      불러오는 중…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                      {rows.length === 0
                        ? '등록된 면접 슬롯이 없습니다. 신규 일정 등록으로 추가하세요.'
                        : '검색 조건에 맞는 일정이 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr
                      key={row.key}
                      className="border-b border-slate-100 transition-colors hover:bg-slate-50/80 dark:border-slate-800/80 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-5 py-4 align-top">
                        <p className="font-semibold text-slate-900 dark:text-white">{row.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          시간 슬롯 {row.slotOrdinal}/{row.slotTotal}
                          {row.perSlotMode === 'multiple' ? ' · 다인원 슬롯' : ' · 1:1 슬롯'}
                        </p>
                        <span className="mt-1 inline-block rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {row.tagLabel}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-top text-slate-700 dark:text-slate-200">
                        <p className="font-medium">{row.scheduleLine1}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{row.scheduleLine2}</p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          정원 {row.capacity ?? '—'}명 · 잔여 {row.remaining ?? '—'}명
                        </p>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          {row.candidates.length === 0 ? (
                            <div className="max-w-[11rem] text-xs leading-snug text-slate-500 dark:text-slate-400">
                              <span className="font-medium text-slate-600 dark:text-slate-300">예약 없음</span>
                              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                                아직 이 시간을 고른 지원자가 없습니다. 링크로 응답하면 이 칸에 이름이 나타납니다.
                              </p>
                            </div>
                          ) : (
                            row.candidates.map((c) => (
                              <span
                                key={c.id}
                                title={
                                  c.status === 'confirmed'
                                    ? `${c.name} · 시간 확정`
                                    : c.status === 'declined'
                                      ? `${c.name} · 불참`
                                      : `${c.name} · 미선택`
                                }
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ${
                                  c.status === 'confirmed'
                                    ? 'bg-gradient-to-br from-emerald-500 to-teal-600 ring-2 ring-emerald-200/80 dark:ring-emerald-900'
                                    : c.status === 'declined'
                                      ? 'bg-gradient-to-br from-slate-400 to-slate-600 ring-2 ring-slate-300 dark:ring-slate-600'
                                      : 'bg-gradient-to-br from-amber-400 to-orange-500 ring-2 ring-amber-200/80 dark:ring-amber-900'
                                }`}
                              >
                                {c.initial}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${row.location.className}`}
                        >
                          {row.location.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            to={`/hr/schedules/${row.roundId}/status`}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            응답
                          </Link>
                          <Link
                            to={`/hr/schedules/${row.roundId}/evaluations`}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            평가
                          </Link>
                          <Link
                            to={`/hr/schedules?edit=${encodeURIComponent(row.roundId)}`}
                            className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-900/50"
                          >
                            편집
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="min-w-[920px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/80">
                  <th className="px-5 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">면접 일정</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">이름</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">상태</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">예약 시간</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">연락처</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">선택 링크</th>
                  <th className="px-5 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">바로가기</th>
                </tr>
              </thead>
              <tbody>
                {loading && !applicantRows.length ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                      불러오는 중…
                    </td>
                  </tr>
                ) : filteredApplicants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                      {applicantRows.length === 0
                        ? '집계할 지원자가 없습니다. 일정에 지원자를 등록한 뒤, 응답 API가 정상일 때 여기에 나타납니다.'
                        : '검색 조건에 맞는 지원자가 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  filteredApplicants.map((r) => (
                    <tr
                      key={r.key}
                      className="border-b border-slate-100 transition-colors hover:bg-slate-50/80 dark:border-slate-800/80 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-5 py-4 align-top font-medium text-slate-900 dark:text-white">{r.roundTitle}</td>
                      <td className="px-5 py-4 align-top text-slate-800 dark:text-slate-200">{r.name}</td>
                      <td className="px-5 py-4 align-top">
                        {r.status === 'confirmed' ? (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                            확정
                          </span>
                        ) : r.status === 'declined' ? (
                          <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                            불참
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                            미선택
                          </span>
                        )}
                      </td>
                      <td className="max-w-[14rem] px-5 py-4 align-top text-xs text-slate-700 dark:text-slate-300">
                        {r.status === 'confirmed'
                          ? fmtBookingRange(r.slotStartAt, r.slotEndAt, r.timezone)
                          : '—'}
                      </td>
                      <td className="px-5 py-4 align-top text-xs text-slate-600 dark:text-slate-400">
                        <span className="block break-all">{r.email || '—'}</span>
                        <span className="mt-1 block">{r.phone || '—'}</span>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <button
                          type="button"
                          onClick={() => void copyPickUrl(r.pickUrl, r.key)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          URL 복사
                        </button>
                        {copyHint?.key === r.key && (
                          <p className="mt-1 text-[10px] text-slate-500">
                            {copyHint.ok ? '복사했습니다.' : '복사에 실패했습니다.'}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <Link
                          to={`/hr/schedules/${r.roundId}/status`}
                          className="inline-flex rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-900/50"
                        >
                          응답·재안내
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs text-slate-500 dark:text-slate-500">
        <Link to="/hr/calendar" className="font-medium text-violet-600 hover:underline dark:text-violet-400">
          월간 캘린더
        </Link>
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <Link to="/hr/pipeline" className="font-medium text-violet-600 hover:underline dark:text-violet-400">
          채용 파이프라인
        </Link>
      </div>

      <footer className="mt-auto pt-10 text-center text-[11px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-600">
        
      </footer>
    </div>
  )
}
