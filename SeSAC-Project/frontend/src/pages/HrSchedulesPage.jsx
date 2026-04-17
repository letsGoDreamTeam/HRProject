import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  hrCreateSchedule,
  hrDeleteSchedule,
  hrGetSchedule,
  hrJobRolesList,
  hrListRecruitmentProcess,
  hrListSchedules,
  hrPatchSchedule,
} from '../api/client'

const TZ_OPTIONS = ['Asia/Seoul', 'Asia/Tokyo', 'UTC', 'America/New_York', 'Europe/London']

/** 백엔드 `hr_recruitment_stages.STAGE_LABEL_KO` 와 동일 (표시용) */
const STAGE_KEY_LABEL_KO = {
  document_screening: '서류전형',
  document_review: '서류검토',
  interview_1: '1차 면접',
  interview_2: '2차 면접',
  interview_3: '3차 면접',
  interview_4: '4차 면접',
  interview_5: '5차 면접',
  interview_6: '6차 면접',
  interview_7: '7차 면접',
  interview_8: '8차 면접',
  interview_9: '9차 면접',
  interview_10: '10차 면접',
  interview_n: 'N차 면접',
  final: '최종심사',
  final_pass: '최종합격',
  hired: '입사확정',
  final_fail: '최종불합격',
  rejected: '불합격',
}

const STAGE_KEY_SORT_ORDER = [
  'document_screening',
  'document_review',
  'interview_1',
  'interview_2',
  'interview_3',
  'interview_4',
  'interview_5',
  'interview_6',
  'interview_7',
  'interview_8',
  'interview_9',
  'interview_10',
  'interview_n',
  'final',
  'final_pass',
  'hired',
  'rejected',
  'final_fail',
]

function stageKeySortIndex(key) {
  const i = STAGE_KEY_SORT_ORDER.indexOf(key)
  return i >= 0 ? i : 800 + String(key).charCodeAt(0)
}

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
  return { name: '', email: '', phone: '', applied_position: '', application_filter_item_id: '' }
}

function emptyInterviewer() {
  return { name: '', email: '', phone: '' }
}

export function HrSchedulesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [list, setList] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editingHasBookings, setEditingHasBookings] = useState(false)

  const [title, setTitle] = useState('1차 면접')
  const [department, setDepartment] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [stageKey, setStageKey] = useState('')
  const [timezone, setTimezone] = useState('Asia/Seoul')
  const [hrNotifyEmail, setHrNotifyEmail] = useState('')
  /** 슬롯당 지원자: single = 1:1, multiple = 슬롯 정원만큼 동시 면접 */
  const [intervieweePerSlot, setIntervieweePerSlot] = useState('single')
  /** 1차: 원본 이력서 / 2차: 회사 표준 평가 안내 */
  const [interviewPhase, setInterviewPhase] = useState('general')
  const [slots, setSlots] = useState(() => [emptySlot(), emptySlot()])
  const [candidates, setCandidates] = useState(() => [emptyCandidate(), emptyCandidate()])
  const [interviewers, setInterviewers] = useState(() => [emptyInterviewer()])
  const [jsonPaste, setJsonPaste] = useState('')
  const [jsonMsg, setJsonMsg] = useState(null)
  const [departmentOptions, setDepartmentOptions] = useState([])
  /** 직무소개서 행 (부서–직무 매핑용) */
  const [jobRoleRows, setJobRoleRows] = useState([])
  /** 채용 절차에서 수집한 단계 { key, displayLabel, title } */
  const [stageKeyChoices, setStageKeyChoices] = useState([])

  const stageSelectOptions = useMemo(() => {
    const list = [...stageKeyChoices]
    const cur = (stageKey || '').trim()
    if (cur && !list.some((x) => x.key === cur)) {
      const ko = STAGE_KEY_LABEL_KO[cur]
      list.push({
        key: cur,
        displayLabel: ko ? `${ko} (${cur})` : cur,
        title: `저장값: ${cur}`,
      })
    }
    list.sort(
      (a, b) =>
        stageKeySortIndex(a.key) - stageKeySortIndex(b.key) || a.key.localeCompare(b.key, 'en'),
    )
    return list
  }, [stageKeyChoices, stageKey])

  const filteredJobTitleOptions = useMemo(() => {
    const list = Array.isArray(jobRoleRows) ? jobRoleRows : []
    const dep = (department || '').trim()
    let titles
    if (dep) {
      titles = list
        .filter((x) => (x?.department || '').trim() === dep)
        .map((x) => (x?.job_title || '').trim())
        .filter(Boolean)
    } else {
      titles = list.map((x) => (x?.job_title || '').trim()).filter(Boolean)
    }
    const uniq = [...new Set(titles)]
    const cur = (jobTitle || '').trim()
    if (cur && !uniq.includes(cur)) uniq.push(cur)
    uniq.sort((a, b) => a.localeCompare(b, 'ko'))
    return uniq
  }, [jobRoleRows, department, jobTitle])

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

  // 부서/직무/차수 옵션은 DB에서 조회하여 드롭다운 제공 (직무는 선택된 부서에 한해 필터)
  useEffect(() => {
    hrJobRolesList()
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : []
        const deps = [...new Set(list.map((x) => (x?.department || '').trim()).filter(Boolean))]
        deps.sort((a, b) => a.localeCompare(b, 'ko'))
        setDepartmentOptions(deps)
        setJobRoleRows(list)
      })
      .catch(() => {})

    hrListRecruitmentProcess()
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : []
        const byKey = new Map()
        for (const p of list) {
          const processName = (p?.name || '').trim() || '채용 절차'
          for (const s of Array.isArray(p?.stages) ? p.stages : []) {
            const k = (s?.key || '').trim()
            if (!k) continue
            const cfgLabel = (s?.label || '').trim()
            if (!byKey.has(k)) {
              byKey.set(k, { key: k, configLabel: '', processNames: [] })
            }
            const meta = byKey.get(k)
            if (cfgLabel && !meta.configLabel) meta.configLabel = cfgLabel
            if (!meta.processNames.includes(processName)) meta.processNames.push(processName)
          }
        }
        let choices = [...byKey.values()].map((meta) => {
          const primary = meta.configLabel || STAGE_KEY_LABEL_KO[meta.key] || meta.key
          const displayLabel = primary !== meta.key ? `${primary} (${meta.key})` : String(meta.key)
          const title =
            meta.processNames.length > 0
              ? `절차 템플릿: ${meta.processNames.join(', ')} · 시스템 저장값(key): ${meta.key}`
              : `시스템 저장값(key): ${meta.key}`
          return { key: meta.key, displayLabel, title }
        })
        if (choices.length === 0) {
          choices = STAGE_KEY_SORT_ORDER.filter((k) => STAGE_KEY_LABEL_KO[k]).map((key) => ({
            key,
            displayLabel: `${STAGE_KEY_LABEL_KO[key]} (${key})`,
            title: `채용 절차 설정에 단계가 없어 기본 목록을 표시합니다. 저장값: ${key}`,
          }))
        }
        choices.sort(
          (a, b) =>
            stageKeySortIndex(a.key) - stageKeySortIndex(b.key) || a.key.localeCompare(b.key, 'en'),
        )
        setStageKeyChoices(choices)
      })
      .catch(() => {})
  }, [])

  const resetForm = useCallback(() => {
    setEditingId(null)
    setEditingHasBookings(false)
    setTitle('1차 면접')
    setDepartment('')
    setJobTitle('')
    setStageKey('')
    setTimezone('Asia/Seoul')
    setHrNotifyEmail('')
    setIntervieweePerSlot('single')
    setInterviewPhase('general')
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
      .map((c) => {
        const rawItem = (c.application_filter_item_id || '').trim()
        const itemId =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawItem)
            ? rawItem
            : null
        return {
          name: (c.name || '').trim(),
          email: (c.email || '').trim(),
          phone: (c.phone || '').trim(),
          applied_position: (c.applied_position || '').trim(),
          ...(itemId ? { application_filter_item_id: itemId } : {}),
        }
      })

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
      department: (department || '').trim(),
      job_title: (jobTitle || '').trim(),
      stage_key: (stageKey || '').trim(),
      timezone: timezone || 'Asia/Seoul',
      hr_notify_email: (hrNotifyEmail || '').trim(),
      interview_phase: interviewPhase,
      interviewee_per_slot: perSlot,
      slots: slotPayload,
      candidates: candPayload,
      interviewers: invPayload,
    }
  }

  const startEdit = useCallback(async (roundId) => {
    setError(null)
    setBusy(true)
    try {
      const d = await hrGetSchedule(roundId)
      setEditingId(roundId)
      setEditingHasBookings(Boolean(d.has_bookings))
      setTitle(d.title || '면접 일정')
      setDepartment(d.department || '')
      setJobTitle(d.job_title || '')
      setStageKey(d.stage_key || '')
      setTimezone(d.timezone || 'Asia/Seoul')
      setHrNotifyEmail(d.hr_notify_email || '')
      setIntervieweePerSlot(d.interviewee_per_slot === 'multiple' ? 'multiple' : 'single')
      setInterviewPhase(
        d.interview_phase === 'second_interview'
          ? 'second_interview'
          : d.interview_phase === 'first_interview'
            ? 'first_interview'
            : 'general',
      )
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
            applied_position: c.applied_position || '',
            application_filter_item_id: c.application_filter_item_id || '',
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
  }, [])

  /** 일정 통합 관리 등에서 ?edit= 라운드ID 로 들어오면 해당 일정 수정 폼을 바로 연다 */
  const editFromUrl = (searchParams.get('edit') || '').trim()
  useEffect(() => {
    if (!editFromUrl) return
    void (async () => {
      try {
        await startEdit(editFromUrl)
      } finally {
        setSearchParams(
          (prev) => {
            const n = new URLSearchParams(prev)
            n.delete('edit')
            return n
          },
          { replace: true },
        )
      }
    })()
  }, [editFromUrl, startEdit, setSearchParams])

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
            department: (department || '').trim(),
            job_title: (jobTitle || '').trim(),
            stage_key: (stageKey || '').trim(),
            timezone: timezone || 'Asia/Seoul',
            hr_notify_email: (hrNotifyEmail || '').trim(),
            interview_phase: interviewPhase,
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
      if (typeof o.department === 'string') setDepartment(o.department)
      if (typeof o.job_title === 'string') setJobTitle(o.job_title)
      if (typeof o.stage_key === 'string') setStageKey(o.stage_key)
      if (typeof o.timezone === 'string') setTimezone(o.timezone)
      if (typeof o.hr_notify_email === 'string') setHrNotifyEmail(o.hr_notify_email)
      if (o.interview_phase === 'first_interview' || o.interview_phase === 'second_interview' || o.interview_phase === 'general') {
        setInterviewPhase(o.interview_phase)
      }
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
            applied_position: c.applied_position || '',
            application_filter_item_id: c.application_filter_item_id || '',
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
        <div className="flex flex-wrap gap-3 text-sm">
          <Link to="/hr/schedule-integrated" className="text-violet-600 hover:underline dark:text-violet-400">
            일정 표
          </Link>
          <Link to="/hr/calendar" className="text-violet-600 hover:underline dark:text-violet-400">
            캘린더 보기
          </Link>
          <Link to="/hr" className="text-violet-600 hover:underline dark:text-violet-400">
            ← HR 홈
          </Link>
        </div>
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
              담당 부서
              <select
                value={department}
                onChange={(e) => {
                  const v = e.target.value
                  setDepartment(v)
                  setJobTitle((jt) => {
                    const dep = (v || '').trim()
                    const list = Array.isArray(jobRoleRows) ? jobRoleRows : []
                    const allowed = dep
                      ? new Set(
                          list
                            .filter((x) => (x?.department || '').trim() === dep)
                            .map((x) => (x?.job_title || '').trim())
                            .filter(Boolean),
                        )
                      : null
                    if (!allowed) return jt
                    const cur = (jt || '').trim()
                    return cur && allowed.has(cur) ? jt : ''
                  })
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">부서를 선택하세요</option>
                {departmentOptions.map((dep) => (
                  <option key={dep} value={dep}>{dep}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              담당 직무
              <select
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">직무를 선택하세요</option>
                {filteredJobTitleOptions.map((job) => (
                  <option key={job} value={job}>{job}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              <span className="block">연결 채용 단계</span>
              <span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">
                파이프라인·지원서 단계와 같은 <span className="font-mono">key</span>를 고르면 일정·상태가 맞물립니다.
              </span>
              <select
                value={stageKey}
                onChange={(e) => setStageKey(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">단계를 선택하세요</option>
                {stageSelectOptions.map((opt) => (
                  <option key={opt.key} value={opt.key} title={opt.title}>
                    {opt.displayLabel}
                  </option>
                ))}
              </select>
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 sm:col-span-2">
              면접 전형 구분 (평가·이력서 안내)
              <select
                value={interviewPhase}
                onChange={(e) => setInterviewPhase(e.target.value)}
                className="mt-1 w-full max-w-xl rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="general">일반</option>
                <option value="first_interview">1차 — 원본 이력서 중심</option>
                <option value="second_interview">2차 — 회사 표준 양식·평가</option>
              </select>
              <span className="mt-1 block text-xs font-normal text-slate-500">
                1차는 지원자 제출 이력서를, 2차는 사내 표준화된 자료·평가표 운영에 맞추는 경우 선택하세요.
              </span>
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
                <li key={idx} className="space-y-2 rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
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
                  </div>
                  <input
                    placeholder="지원 직무 (면접 평가표에 자동 표시)"
                    value={c.applied_position}
                    onChange={(e) => {
                      const v = e.target.value
                      setCandidates((arr) => arr.map((x, i) => (i === idx ? { ...x, applied_position: v } : x)))
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <input
                    placeholder="지원서 항목 UUID (선택·HR 지원자 목록에서 복사 — 링크 응답 시 채용 단계 자동 반영)"
                    value={c.application_filter_item_id || ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setCandidates((arr) =>
                        arr.map((x, i) => (i === idx ? { ...x, application_filter_item_id: v } : x)),
                      )
                    }}
                    disabled={structuralLocked}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
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
                  {(r.department || r.job_title || r.stage_key) && (
                    <p className="text-xs text-violet-700">
                      {(r.department || '부서 미지정')} / {(r.job_title || '직무 미지정')} / {(r.stage_key || '차수 미지정')}
                    </p>
                  )}
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
                  {(r.candidates || []).map((c) => {
                    const pickHref = `${origin}${c.pick_url_path || ''}`
                    return (
                      <li key={c.id} className="break-all">
                        <span className="font-sans text-slate-700 dark:text-slate-300">{c.name}: </span>
                        <a
                          href={pickHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-violet-700 underline decoration-violet-400 underline-offset-2 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100"
                        >
                          {pickHref}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
