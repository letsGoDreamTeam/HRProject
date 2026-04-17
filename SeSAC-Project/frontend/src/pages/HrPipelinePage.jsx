import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  hrGenConfirmUrl,
  hrGetApplicationBatch,
  hrGetSchedule,
  hrListApplicationBatches,
  hrListRecruitmentProcess,
  hrListSchedules,
  hrMe,
  hrSendStagePassNotify,
  hrUpdateApplicationStage,
} from '../api/client'

/**
 * 백엔드 stage 값 → 한국어 표시명 + 스타일
 * stage가 여러 종류 있을 수 있으므로(interview_1, interview_2, interview_n 등)
 * 모든 알려진 값을 정의하고, buildDynamicStages()로 실제 데이터 기반 컬럼을 생성합니다.
 */
const STAGE_META = {
  document_screening: {
    label: '서류 접수',
    color: 'text-slate-600',
    dot: 'bg-slate-400',
    headerBg: 'bg-slate-50',
    order: 0,
  },
  document_review: {
    label: '서류 검토',
    color: 'text-sky-600',
    dot: 'bg-sky-500',
    headerBg: 'bg-sky-50',
    order: 1,
  },
  interview_1: {
    label: '1차 면접',
    color: 'text-blue-600',
    dot: 'bg-blue-500',
    headerBg: 'bg-blue-50',
    order: 2,
  },
  interview_2: {
    label: '2차 면접',
    color: 'text-indigo-600',
    dot: 'bg-indigo-500',
    headerBg: 'bg-indigo-50',
    order: 3,
  },
  interview_3: {
    label: '3차 면접',
    color: 'text-violet-600',
    dot: 'bg-violet-500',
    headerBg: 'bg-violet-50',
    order: 4,
  },
  interview_4: {
    label: '4차 면접',
    color: 'text-purple-600',
    dot: 'bg-purple-500',
    headerBg: 'bg-purple-50',
    order: 5,
  },
  interview_5: {
    label: '5차 면접',
    color: 'text-fuchsia-600',
    dot: 'bg-fuchsia-500',
    headerBg: 'bg-fuchsia-50',
    order: 6,
  },
  interview_6: {
    label: '6차 면접',
    color: 'text-pink-600',
    dot: 'bg-pink-500',
    headerBg: 'bg-pink-50',
    order: 7,
  },
  interview_7: {
    label: '7차 면접',
    color: 'text-rose-600',
    dot: 'bg-rose-500',
    headerBg: 'bg-rose-50',
    order: 8,
  },
  interview_8: {
    label: '8차 면접',
    color: 'text-orange-600',
    dot: 'bg-orange-500',
    headerBg: 'bg-orange-50',
    order: 9,
  },
  interview_9: {
    label: '9차 면접',
    color: 'text-amber-600',
    dot: 'bg-amber-500',
    headerBg: 'bg-amber-50',
    order: 10,
  },
  interview_10: {
    label: '10차 면접',
    color: 'text-yellow-600',
    dot: 'bg-yellow-500',
    headerBg: 'bg-yellow-50',
    order: 11,
  },
  interview_n: {
    label: 'N차 면접',
    color: 'text-violet-600',
    dot: 'bg-violet-500',
    headerBg: 'bg-violet-50',
    order: 12,
  },
  final: {
    label: '최종 면접',
    color: 'text-amber-600',
    dot: 'bg-amber-500',
    headerBg: 'bg-amber-50',
    order: 5,
  },
  final_pass: {
    label: '최종 합격',
    color: 'text-emerald-600',
    dot: 'bg-emerald-500',
    headerBg: 'bg-emerald-50',
    order: 6,
  },
  hired: {
    label: '입사 확정',
    color: 'text-teal-600',
    dot: 'bg-teal-500',
    headerBg: 'bg-teal-50',
    order: 7,
  },
  final_fail: {
    label: '최종 불합격',
    color: 'text-orange-500',
    dot: 'bg-orange-400',
    headerBg: 'bg-orange-50',
    order: 8,
  },
  rejected: {
    label: '불합격',
    color: 'text-red-500',
    dot: 'bg-red-400',
    headerBg: 'bg-red-50',
    order: 9,
  },
}

/** 알 수 없는 스테이지의 기본 스타일 */
function unknownStageMeta(key) {
  return {
    label: key,
    color: 'text-slate-500',
    dot: 'bg-slate-400',
    headerBg: 'bg-slate-50',
    order: 99,
  }
}

/**
 * 채용절차 설정의 stages 배열을 칸반 컬럼 배열로 변환.
 * 채용절차 설정에서 HR이 정의한 단계만 표시 — 하드코딩 없음.
 */
function buildStagesFromConfig(processConfig) {
  if (!processConfig || !Array.isArray(processConfig.stages)) return []
  return processConfig.stages.map((s) => ({
    ...(STAGE_META[s.key] ?? unknownStageMeta(s.key)),
    key: s.key,
    label: s.label, // 설정에서 인사팀이 정한 이름 우선
  }))
}

/**
 * 배치 제목에 process config의 department가 포함되는지 확인하여
 * 가장 적합한 채용절차 설정을 자동 선택합니다.
 */
function autoMatchConfig(batchTitle, processConfigs) {
  if (!batchTitle || !processConfigs?.length) return null
  const title = batchTitle.toLowerCase()
  return (
    processConfigs.find((p) => p.department && title.includes(p.department.toLowerCase())) ||
    null
  )
}

/** 배치 제목으로 채용절차 설정 1건을 고름(수동 선택 없음). 부서명 → 절차 이름 순. */
function resolveProcessConfigForBatch(batch, processConfigs) {
  if (!batch || !processConfigs?.length) return null
  const byDep = autoMatchConfig(batch.title, processConfigs)
  if (byDep) return byDep
  const t = (batch.title || '').toLowerCase()
  return (
    processConfigs.find((p) => {
      const n = (p.name || '').trim().toLowerCase()
      return n.length >= 2 && t.includes(n)
    }) || null
  )
}

const STAGE_KEYS_ORDERED = Object.keys(STAGE_META).sort((a, b) => STAGE_META[a].order - STAGE_META[b].order)

/** 절차 자동매칭 실패 시: 지원자가 있는 단계 ± 한 칸 앞까지 칸반 열 구성 */
function buildStagesFromItemsAndOrder(items) {
  if (!items?.length) {
    const key = 'document_screening'
    const m = STAGE_META[key]
    return [{ ...m, key, label: m.label }]
  }
  const present = new Set(items.map((it) => (it.stage || 'document_screening').trim() || 'document_screening'))
  const indices = [...present].map((k) => STAGE_KEYS_ORDERED.indexOf(k)).filter((i) => i >= 0)
  const unknownKeys = [...present].filter((k) => !STAGE_KEYS_ORDERED.includes(k))
  let lo = indices.length ? Math.min(...indices) : 0
  let hi = indices.length ? Math.max(...indices) : 0
  hi = Math.min(STAGE_KEYS_ORDERED.length - 1, hi + 1)
  lo = Math.max(0, lo)
  const slice = STAGE_KEYS_ORDERED.slice(lo, hi + 1)
  const out = slice.map((key) => {
    const m = STAGE_META[key] ?? unknownStageMeta(key)
    return { ...m, key, label: m.label }
  })
  for (const key of unknownKeys) {
    const m = unknownStageMeta(key)
    out.push({ ...m, key, label: m.label })
  }
  return out
}

/** 이메일 알림을 보내지 않는 단계 */
const SKIP_NOTIFY_STAGES = new Set(['document_screening'])

/** 일시 → 'YYYY년 M월 D일 HH시 MM분' */
function fmtDateTimeKo(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}시 ${String(d.getMinutes()).padStart(2, '0')}분`
}

async function copyTextRobust(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fallback으로 진행
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** 합격 메일 수신 주소: API notify_email → DB 추출값 → 표준화 JSON email */
function pickNotifyEmail(item) {
  const a = (item?.notify_email || '').trim()
  if (a) return a
  const b = (item?.email_extracted || '').trim()
  if (b) return b
  const sr = item?.standardized_resume
  if (sr && typeof sr === 'object' && !Array.isArray(sr)) {
    const e = String(sr.email || '').trim()
    if (e) return e
  }
  return ''
}

function PassNotifyModal({
  item,
  stageLabel,
  stageKey,
  contextDepartment,
  contextJobTitle,
  hrAccountEmail,
  onSend,
  onSkip,
}) {
  const [notifyAt, setNotifyAt] = useState('')
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState(null)
  const [sentUrl, setSentUrl] = useState(null)
  const [sentDone, setSentDone] = useState(false)
  const [copied, setCopied] = useState(false)
  const [preToken, setPreToken] = useState(null)        // 미리 생성된 토큰
  const [confirmUrl, setConfirmUrl] = useState(null)    // 미리 생성된 URL
  const [urlLoading, setUrlLoading] = useState(true)
  const isRejectionStage = stageKey === 'rejected' || stageKey === 'final_fail'
  const [scheduleList, setScheduleList] = useState([])
  const [schedulePickUrl, setSchedulePickUrl] = useState('')
  const [selectedRound, setSelectedRound] = useState(null)
  const [deliveryNote, setDeliveryNote] = useState('')

  const name = item?.candidate_name?.trim() || '지원자'
  const notifyEmail = useMemo(
    () => pickNotifyEmail(item),
    [item?.id, item?.notify_email, item?.email_extracted, item?.standardized_resume],
  )

  // 모달이 열릴 때 실제 확인 링크 미리 생성
  useEffect(() => {
    if (!item?.id) return
    if (isRejectionStage) { setUrlLoading(false); return }
    hrGenConfirmUrl(String(item.id), window.location.origin)
      .then((res) => {
        setPreToken(res.token)
        setConfirmUrl(res.confirm_url)
      })
      .catch(() => {}) // 실패해도 placeholder로 fallback
      .finally(() => setUrlLoading(false))
  }, [item?.id, isRejectionStage])

  useEffect(() => {
    if (isRejectionStage) return
    hrListSchedules()
      .then((rows) => setScheduleList(Array.isArray(rows) ? rows : []))
      .catch(() => {})
  }, [isRejectionStage])

  /** 면접 일정과 연동: 부서·단계 키가 같으면 됨(일정의 job_title은 채용절차 '이름'과 다를 수 있어 제외) */
  const scheduleMatchCandidates = scheduleList.filter((r) => {
    const depOk = contextDepartment ? (r?.department || '').trim() === contextDepartment : true
    const stageOk = stageKey ? (r?.stage_key || '').trim() === stageKey : true
    return depOk && stageOk
  })
  const matchedRound = scheduleMatchCandidates[0] || null
  const scheduleMatchAmbiguous = scheduleMatchCandidates.length > 1

  useEffect(() => {
    if (!matchedRound?.id) { setSchedulePickUrl(''); setSelectedRound(null); return }
    hrGetSchedule(matchedRound.id)
      .then((d) => {
        setSelectedRound(d || null)
        const cands = Array.isArray(d?.candidates) ? d.candidates : []
        const byEmail = notifyEmail
          ? cands.find((c) => (c.email || '').trim().toLowerCase() === notifyEmail.toLowerCase())
          : null
        const byName = cands.find((c) => (c.name || '').trim() === name)
        const target = byEmail || byName
        if (!target?.pick_url_path) { setSchedulePickUrl(''); return }
        setSchedulePickUrl(`${window.location.origin}${target.pick_url_path}`)
      })
      .catch(() => {
        setSelectedRound(null)
        setSchedulePickUrl('')
      })
  }, [matchedRound?.id, notifyEmail, name])

  const stageHint = (() => {
    if (stageKey?.startsWith('interview_')) {
      const n = stageKey.split('_')[1]
      return `${n}차`
    }
    return stageLabel
  })()
  const usePickLink = !isRejectionStage && Boolean(matchedRound)

  const linkPreviewLine = isRejectionStage
    ? null
    : usePickLink
      ? (confirmUrl
          ? `👉 참석/불참석 선택 링크: ${confirmUrl}\n(참석 선택 시 시간대 선택 화면으로 이동)`
          : '👉 참석/불참석 선택 링크: 생성 중...')
      : (urlLoading
          ? '👉 확인 링크: 생성 중...'
          : (confirmUrl ? `👉 확인 링크: ${confirmUrl}` : '👉 [일정 확인 링크가 첨부됩니다]'))

  const previewBody = [
    `${name}님, 안녕하세요.`,
    '',
    '이번 채용 전형에 지원해 주셔서 감사합니다.',
    '',
    isRejectionStage
      ? '채용 전형 결과를 안내드립니다.'
      : '축하합니다! 다음 단계 전형에 선발되셨습니다.',
    '',
    `✅ 단계: ${stageLabel}`,
    notifyAt ? `📨 메일 발송 예정: ${fmtDateTimeKo(notifyAt)}` : '📨 메일 발송: 즉시',
    location ? `📍 장소: ${location}` : null,
    note ? note : null,
    '',
    linkPreviewLine,
    '',
    '감사합니다.',
  ]
    .filter((l) => l !== null)
    .join('\n')

  const handleSend = async () => {
    if (!notifyEmail) {
      setErr(
        '지원자 이메일을 찾을 수 없습니다. 지원서 표준화를 다시 실행하거나, 이력서에 이메일이 있는지 확인해 주세요.',
      )
      return
    }
    setSending(true)
    setErr(null)
    setDeliveryNote('')
    try {
      const result = await onSend({
        stage_label: stageLabel,
        next_stage_key: stageKey,
        notify_at: notifyAt || null,
        scheduled_at: null,
        location,
        note,
        site_base_url: window.location.origin,
        pre_token: preToken || null,
        schedule_pick_url: schedulePickUrl || null,
      })
      if (result?.confirm_url) setSentUrl(result.confirm_url)
      else if (confirmUrl) setSentUrl(confirmUrl)
      setDeliveryNote((result && result.delivery_note) || '')
      setSentDone(true)
    } catch (e) {
      setErr(e?.message || '발송 실패')
    } finally {
      setSending(false)
    }
  }

  // ── 발송 완료 화면 ──────────────────────────────────────────
  if (sentDone) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
          <div className="flex flex-col items-center gap-3 px-8 pt-8 pb-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-3xl">
              📧
            </div>
            <div className="text-xl font-bold text-slate-900">발송 완료!</div>
            <div className="text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{name}</span>님에게<br />
              {isRejectionStage ? '결과 안내 이메일이 발송 예약되었습니다.' : '합격 알림 이메일이 발송 예약되었습니다.'}
            </div>
            {deliveryNote ? (
              <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600">
                {deliveryNote}
              </p>
            ) : null}
          </div>

          {sentUrl && (
            <div className="mx-6 mb-6 space-y-3">
              <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-base">🔗</span>
                  <span className="text-xs font-bold text-violet-800">지원자 일정 확인 링크</span>
                </div>
                <div className="mb-3 break-all rounded-lg border border-violet-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-700 leading-relaxed select-all">
                  {sentUrl}
                </div>
                <button
                  onClick={async () => {
                    const ok = await copyTextRobust(sentUrl)
                    if (!ok) return
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className={`w-full rounded-xl py-2.5 text-sm font-bold transition-colors ${
                    copied
                      ? 'bg-emerald-500 text-white'
                      : 'bg-violet-600 text-white hover:bg-violet-700'
                  }`}
                >
                  {copied ? '✓ 복사됨!' : '📋 링크 복사'}
                </button>
              </div>
              <p className="text-center text-[11px] text-slate-400">
                이메일 전송이 어려운 경우 이 링크를 직접 지원자에게 전달하세요.
              </p>
            </div>
          )}

          <div className="border-t border-slate-100 px-6 py-4">
            <button
              onClick={onSkip}
              className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── 발송 전 입력 화면 ────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">
        {/* 헤더 */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4 flex-shrink-0">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xl">🎉</span>
          <div>
            <div className="text-base font-bold text-slate-900">
              {isRejectionStage ? '결과 안내 이메일 발송' : '합격 알림 이메일 발송'}
            </div>
            <div className="text-xs text-slate-500">
              {isRejectionStage ? '지원자에게 전형 결과를 안내합니다.' : '지원자에게 다음 단계 합격 및 일정을 안내합니다.'}
            </div>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
          {/* 수신자 정보 */}
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 w-16 flex-shrink-0">받는 사람</span>
              <span className="font-semibold text-slate-800">{name}</span>
            </div>
            <div className="mt-1 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 w-16 flex-shrink-0">이메일</span>
                {notifyEmail ? (
                  <span className="font-mono text-xs text-slate-700">{notifyEmail}</span>
                ) : (
                  <span className="text-xs font-medium text-amber-700">지원서에서 찾지 못함</span>
                )}
              </div>
              {!notifyEmail && hrAccountEmail ? (
                <p className="pl-16 text-[11px] leading-relaxed text-slate-500">
                  채용 시스템에 로그인한 계정(가입 이메일):{' '}
                  <span className="font-mono font-medium text-slate-700">{hrAccountEmail}</span>
                  <br />
                  합격 메일은 지원자 주소로만 보낼 수 있습니다. 표준화를 다시 실행하거나 이력서에 이메일을 적어 주세요.
                </p>
              ) : null}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-slate-500 w-16 flex-shrink-0">다음 단계</span>
              <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">{stageLabel}</span>
            </div>
          </div>

          {/* 메일 예약 발송 + 장소 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                메일 예약 발송 시간 <span className="font-normal text-slate-400">(선택)</span>
              </label>
              <input
                type="datetime-local"
                value={notifyAt}
                onChange={(e) => setNotifyAt(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                장소 <span className="font-normal text-slate-400">(선택)</span>
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="예: 본사 5층 대회의실"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </div>
          </div>

          {/* 시간 선택 링크 (면접 일정 조율에서 설정한 메타로 자동 연동) */}
          {!isRejectionStage && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold leading-relaxed text-slate-700">
                합격 메일에 넣을 <span className="text-violet-700">면접 시간 고르기 링크</span>는{' '}
                <span className="text-violet-700">면접 일정 조율(/hr/schedules)</span>에 만든 일정 중, 아래{' '}
                <strong className="text-slate-800">부서</strong>와 <strong className="text-slate-800">단계 키(stage_key)</strong>가
                같은 일정을 자동으로 찾아 붙입니다. (채용절차 설정의 &quot;이름&quot;은 직무와 다를 수 있어 비교에 쓰지 않습니다.)
              </div>
              <div className="mt-2 rounded-lg bg-slate-50 px-2 py-2 text-[11px] text-slate-600">
                지금 카드 기준 — 부서: {contextDepartment || '미지정'} · 단계: {stageKey || stageHint}
                {contextJobTitle ? (
                  <span className="mt-1 block text-slate-500">
                    (참고) 채용절차 이름: {contextJobTitle}
                  </span>
                ) : null}
              </div>
              {scheduleMatchAmbiguous && matchedRound ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-800">
                  같은 부서·단계 일정이 {scheduleMatchCandidates.length}개 있어 첫 번째만 연동했습니다. 필요하면 일정을 구분해
                  주세요.
                </p>
              ) : null}
              {matchedRound ? (
                <div className="mt-2 space-y-2">
                  <div className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] text-slate-700">
                    연동 일정: <span className="font-semibold">{matchedRound.title}</span>
                    {(matchedRound.job_title || '').trim() ? (
                      <span className="text-slate-500"> · 직무 {matchedRound.job_title}</span>
                    ) : null}
                  </div>
                  {selectedRound?.slots?.length > 0 && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] text-slate-600">
                      <div className="mb-1 font-semibold text-slate-700">연동된 시간대</div>
                      <ul className="space-y-1">
                        {selectedRound.slots.map((s) => (
                          <li key={s.id}>
                            • {fmtDateTimeKo(s.start_at)} ~ {fmtDateTimeKo(s.end_at)} (잔여 {s.remaining ?? 0}/{s.capacity ?? 1})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="rounded-lg bg-slate-50 px-2 py-2 text-[11px] text-slate-500">
                    {schedulePickUrl
                      ? `참석 후 이동할 시간대 선택 링크: ${schedulePickUrl}`
                      : '연동 일정에는 있지만 현재 지원자(이메일/이름)가 등록되지 않아 링크를 만들 수 없습니다.'}
                  </div>
                </div>
              ) : (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] leading-relaxed text-amber-800">
                  조건에 맞는 면접 일정이 없습니다.{' '}
                  <span className="font-semibold">면접 일정</span>에서 이 지원서 배치와 같은{' '}
                  <strong>부서</strong>·<strong>단계 키</strong>(예: {stageKey || 'interview_1'})로 일정을 저장했는지
                  확인해 주세요. (직무 필드는 꼭 같을 필요 없습니다.)
                </div>
              )}
            </div>
          )}

          {/* 추가 안내 */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">
              추가 안내 메시지 <span className="font-normal text-slate-400">(선택)</span>
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 신분증 지참 필수입니다."
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          {/* 미리보기 */}
          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-700">이메일 미리보기</div>
            <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
              {previewBody}
            </pre>
          </div>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>
          )}
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4 flex-shrink-0">
          <button
            onClick={onSkip}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            나중에
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !notifyEmail || (!isRejectionStage && !schedulePickUrl)}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {sending ? '발송 중…' : '📧 이메일 발송'}
          </button>
        </div>
      </div>
    </div>
  )
}

// blind_tier → 배지 색상
const TIER_COLOR = {
  A: 'text-emerald-600 bg-emerald-50',
  B: 'text-blue-600 bg-blue-50',
  C: 'text-amber-600 bg-amber-50',
  D: 'text-red-500 bg-red-50',
}

function tierBadge(tier) {
  const t = (tier || '').toUpperCase()
  const cls = TIER_COLOR[t] || 'text-slate-500 bg-slate-100'
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>Tier {t || '?'}</span>
}

/**
 * stageOptions: 현재 채용절차 설정의 [{key, label}] 배열.
 * 이 목록만 드롭다운에 표시합니다 — 하드코딩된 전체 목록 사용 안 함.
 */
function CandidateCard({ item, onMoveStage, stageOptions = [] }) {
  const name = item.candidate_name?.trim() || '이름 없음'
  const desc = item.blind_summary?.trim() || item.preferred_reason?.trim() || ''
  const passed = item.preferred_met
  const currentMeta = STAGE_META[item.stage] ?? unknownStageMeta(item.stage)

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 text-sm truncate">{name}</div>
          <div className="text-[11px] text-slate-400 truncate" title={item.filename}>
            {item.filename || '파일 없음'}
          </div>
        </div>
        {/* 채용절차 설정에서 정의한 단계만 드롭다운에 표시 */}
        {onMoveStage && stageOptions.length > 0 && (
          <select
            value={item.stage || stageOptions[0]?.key}
            onChange={(e) => {
              e.stopPropagation()
              onMoveStage(item.id, e.target.value)
            }}
            onClick={(e) => e.stopPropagation()}
            title="단계 이동"
            className="flex-shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 outline-none hover:border-violet-300 focus:border-violet-400 cursor-pointer"
          >
            {stageOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {desc && (
        <p className="mt-2 text-xs text-slate-500 leading-relaxed line-clamp-2">{desc}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {tierBadge(item.blind_tier)}
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            passed ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
          }`}
        >
          {passed ? '✓ 우대 충족' : '✕ 미충족'}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`text-[10px] font-medium ${currentMeta.color}`}>
          현재: {currentMeta.label}
        </span>
        {item.confirm_status === 'accepted' && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            ✓ 참석 확인됨
          </span>
        )}
        {item.confirm_status === 'declined' && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
            ✗ 불참석
          </span>
        )}
        {item.confirm_status === 'pending' && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            ⏳ {item.latest_confirm_stage_label ? `${item.latest_confirm_stage_label} 답변 대기중` : '답변 대기중'}
          </span>
        )}
      </div>
      {item.latest_confirm_token && (
        <ConfirmLinkBar token={item.latest_confirm_token} />
      )}
    </div>
  )
}

function ConfirmLinkBar({ token }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/confirm/${token}`
  return (
    <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-1.5">
      <span className="text-xs">🔗</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-violet-700" title={url}>
        {url}
      </span>
      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation()
          const ok = await copyTextRobust(url)
          if (!ok) return
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className={`flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold transition-colors ${
          copied ? 'bg-emerald-500 text-white' : 'bg-violet-600 text-white hover:bg-violet-700'
        }`}
      >
        {copied ? '✓' : '복사'}
      </button>
    </div>
  )
}

function DraggableCard({ item, onMoveStage, stageOptions }) {
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({ id: item.id })
  const declined = item.confirm_status === 'declined'
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : declined ? 0.55 : 1,
    transition: isDragging ? undefined : 'transform 180ms cubic-bezier(0.25, 1, 0.5, 1)',
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border shadow-sm transition-all ${
        declined
          ? 'border-slate-200 bg-slate-50 hover:border-slate-300'
          : 'border-slate-200 bg-white hover:border-violet-200 hover:shadow-md'
      }`}
    >
      <div
        {...listeners}
        {...attributes}
        className="flex cursor-grab items-center gap-1 border-b border-slate-100 px-3 py-1.5 active:cursor-grabbing"
        title="드래그하여 단계 이동"
      >
        <span className="text-slate-300 text-sm">⠿</span>
        <span className="text-[10px] text-slate-300">드래그</span>
      </div>
      <div className="p-3">
        <CandidateCard item={item} onMoveStage={onMoveStage} stageOptions={stageOptions} />
      </div>
    </div>
  )
}

function KanbanColumn({ stage, items, onMoveStage, stageOptions }) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.key })
  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-col rounded-2xl border overflow-hidden transition-all ${
        isOver ? 'border-violet-300 ring-2 ring-violet-200' : 'border-slate-200'
      } bg-white`}
    >
      <div className={`flex items-center gap-2 border-b border-slate-100 px-4 py-3 ${stage.headerBg}`}>
        <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
        <span className={`text-xs font-bold ${stage.color}`}>{stage.label}</span>
        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-slate-500 shadow-sm border border-slate-200">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto p-3" style={{ maxHeight: '60vh' }}>
        {items.map((item) => (
          <DraggableCard key={item.id} item={item} onMoveStage={onMoveStage} stageOptions={stageOptions} />
        ))}
        {items.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-xs text-slate-300">
            여기에 드롭
          </div>
        )}
      </div>
    </div>
  )
}

export function HrPipelinePage() {
  const { batchId: urlBatchId } = useParams()
  const [batches, setBatches] = useState([])
  const [selectedBatchId, setSelectedBatchId] = useState(urlBatchId || '')
  const [items, setItems] = useState([])
  const [loadingBatches, setLoadingBatches] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [error, setError] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [search, setSearch] = useState('')
  const [processConfigs, setProcessConfigs] = useState([])
  const [notifyTarget, setNotifyTarget] = useState(null) // { item, stageLabel, stageKey }
  const [toastMsg, setToastMsg] = useState(null)
  const [hrAccountEmail, setHrAccountEmail] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // 배치 목록 로드
  const loadBatches = useCallback(async () => {
    setLoadingBatches(true)
    setError(null)
    try {
      const data = await hrListApplicationBatches()
      const list = Array.isArray(data) ? data : []
      setBatches(list)
      if (urlBatchId) {
        setSelectedBatchId(String(urlBatchId))
      } else if (list.length > 0 && !selectedBatchId) {
        setSelectedBatchId(String(list[0].id))
      }
    } catch (e) {
      setError(e?.message || '배치 목록 불러오기 실패')
    } finally {
      setLoadingBatches(false)
    }
  }, [selectedBatchId])

  // 선택된 배치의 아이템 로드
  const loadItems = useCallback(async (batchId) => {
    if (!batchId) return
    setLoadingItems(true)
    setError(null)
    try {
      const batch = await hrGetApplicationBatch(batchId)
      setItems(Array.isArray(batch?.items) ? batch.items : [])
    } catch (e) {
      setError(e?.message || '지원서 불러오기 실패')
      setItems([])
    } finally {
      setLoadingItems(false)
    }
  }, [])

  // 채용절차 설정 로드
  useEffect(() => {
    hrListRecruitmentProcess()
      .then((data) => setProcessConfigs(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    hrMe()
      .then((u) => setHrAccountEmail(String(u?.email || '').trim()))
      .catch(() => setHrAccountEmail(''))
  }, [])

  useEffect(() => {
    void loadBatches()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedBatchId) void loadItems(selectedBatchId)
  }, [selectedBatchId, loadItems])

  /** 드래그 or 드롭다운 - 공통 단계 변경 로직 */
  const commitMoveStage = async (itemId, targetStage) => {
    const item = items.find((x) => String(x.id) === String(itemId))
    if (!item || (item.stage || 'document_screening') === targetStage) return

    // 답변 대기중이면 현재 단계 유지 (중복 이동 방지)
    if (item.confirm_status === 'pending') {
      setToastMsg('⏳ 이미 답변 대기중입니다. 지원자 응답 전에는 단계를 이동할 수 없습니다.')
      setTimeout(() => setToastMsg(null), 3000)
      return
    }

    // 종료/예외 단계는 즉시 이동
    if (SKIP_NOTIFY_STAGES.has(targetStage)) {
      setItems((prev) =>
        prev.map((x) => (String(x.id) === String(itemId) ? { ...x, stage: targetStage } : x)),
      )
      try {
        await hrUpdateApplicationStage(String(itemId), targetStage)
      } catch (e) {
        setError(e?.message || '단계 변경 실패')
        setItems((prev) =>
          prev.map((x) => (String(x.id) === String(itemId) ? { ...x, stage: item.stage } : x)),
        )
      }
      return
    }

    // 일반 면접 단계는 현재 단계에서 알림/응답 대기 (즉시 stage 변경하지 않음)
    const batch = batches.find((b) => String(b.id) === selectedBatchId)
    const cfg = resolveProcessConfigForBatch(batch, processConfigs)
    const stageLabel =
      cfg?.stages?.find((s) => s.key === targetStage)?.label ||
      STAGE_META[targetStage]?.label ||
      targetStage
    setNotifyTarget({
      item,
      stageLabel,
      stageKey: targetStage,
      contextDepartment: (cfg?.department || '').trim(),
      contextJobTitle: (cfg?.name || '').trim(),
    })
  }

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null)
    if (!over) return
    void commitMoveStage(String(active.id), String(over.id))
  }

  const activeItem = items.find((x) => String(x.id) === activeId) || null

  const filtered = items.filter((x) => {
    if (!search) return true
    const name = (x.candidate_name || '').toLowerCase()
    const file = (x.filename || '').toLowerCase()
    const q = search.toLowerCase()
    return name.includes(q) || file.includes(q)
  })

  const selectedBatch = useMemo(
    () => batches.find((b) => String(b.id) === selectedBatchId) || null,
    [batches, selectedBatchId],
  )

  const resolvedProcessConfig = useMemo(
    () => resolveProcessConfigForBatch(selectedBatch, processConfigs),
    [selectedBatch, processConfigs],
  )

  const dynamicStages = useMemo(() => {
    if (resolvedProcessConfig?.stages?.length)
      return buildStagesFromConfig(resolvedProcessConfig)
    return buildStagesFromItemsAndOrder(items)
  }, [resolvedProcessConfig, items])

  const stageOptions = useMemo(
    () => dynamicStages.map((s) => ({ key: s.key, label: s.label })),
    [dynamicStages],
  )

  const stageMap = {}
  dynamicStages.forEach((s) => {
    stageMap[s.key] = filtered.filter((x) => (x.stage || 'document_screening') === s.key)
  })

  return (
    <div className="flex flex-col gap-5 min-h-dvh bg-slate-50 px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/hr/pipeline"
            className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
          >
            ← 채용 현황으로
          </Link>
          <div>
            <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-0.5 text-[11px] font-bold tracking-widest text-blue-600">
              DRAG &amp; DROP ATS
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">지원자 파이프라인</h1>
          <p className="mt-1 text-sm text-slate-500">
            지원자 카드를 드래그하여 진행 단계를 이동시키세요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {processConfigs.length === 0 ? (
            <a
              href="/hr/recruitment-process"
              className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
            >
              ⚙ 채용절차 설정
            </a>
          ) : null}

          {/* 배치 선택 */}
          <select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            disabled={loadingBatches}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-violet-400 max-w-xs"
          >
            {loadingBatches ? (
              <option>불러오는 중…</option>
            ) : batches.length === 0 ? (
              <option value="">배치 없음</option>
            ) : (
              batches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {(b.title || '제목 없음').trim()} ({Array.isArray(b.items) ? b.items.length : 0}건)
                </option>
              ))
            )}
          </select>

          {/* 검색 */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              placeholder="이름 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-36 rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 shadow-sm outline-none focus:border-violet-400"
            />
          </div>

          <button
            onClick={() => selectedBatchId && void loadItems(selectedBatchId)}
            disabled={loadingItems}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingItems ? '로딩…' : '새로고침'}
          </button>
          {selectedBatchId ? (
            <Link
              to={`/hr/pipeline/${selectedBatchId}/insights`}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              AI 인사이트 대시보드
            </Link>
          ) : null}
        </div>
      </div>

      {/* Batch meta */}
      {selectedBatch && (
        <div className="text-xs text-slate-400">
          배치: <span className="font-medium text-slate-600">{selectedBatch.title || '제목 없음'}</span>
          {selectedBatch.created_at && (
            <span className="ml-2">
              · 생성일:{' '}
              {new Date(selectedBatch.created_at).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          )}
          <span className="ml-2">· 총 {items.length}명</span>
          {resolvedProcessConfig ? (
            <span className="ml-2 text-violet-600 dark:text-violet-400">
              · 단계 템플릿: <span className="font-medium">{resolvedProcessConfig.name}</span>
            </span>
          ) : processConfigs.length > 0 ? (
            <span className="ml-2 text-slate-500">
              · 배치 제목에 부서·절차명이 없어, 지원자가 있는 단계만 열로 표시합니다.
            </span>
          ) : null}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loadingBatches && batches.length === 0 && (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-white">
          <div className="text-4xl">📭</div>
          <div className="text-sm font-medium text-slate-600">업로드된 지원서 배치가 없습니다.</div>
          <a
            href="/hr/applications"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            지원서 업로드하기
          </a>
        </div>
      )}

      {/* Kanban board */}
      {batches.length > 0 && selectedBatchId && dynamicStages.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={({ active }) => setActiveId(String(active.id))}
          onDragCancel={() => setActiveId(null)}
          onDragEnd={handleDragEnd}
        >
          {loadingItems ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
              불러오는 중…
            </div>
          ) : (
            <div
              className="grid gap-4 pb-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
            >
              {dynamicStages.map((stage) => (
                <KanbanColumn
                  key={stage.key}
                  stage={stage}
                  items={stageMap[stage.key] || []}
                  onMoveStage={commitMoveStage}
                  stageOptions={stageOptions}
                />
              ))}
            </div>
          )}

          <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
            {activeItem ? (
              <div className="w-56 cursor-grabbing rounded-xl border border-violet-300 bg-white p-3.5 shadow-2xl">
                <CandidateCard item={activeItem} stageOptions={stageOptions} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* 합격 알림 이메일 모달 */}
      {notifyTarget && (
        <PassNotifyModal
          item={notifyTarget.item}
          stageLabel={notifyTarget.stageLabel}
          stageKey={notifyTarget.stageKey}
          contextDepartment={notifyTarget.contextDepartment}
          contextJobTitle={notifyTarget.contextJobTitle}
          hrAccountEmail={hrAccountEmail}
          onSend={async (payload) => {
            const result = await hrSendStagePassNotify(String(notifyTarget.item.id), payload)
            setToastMsg('📧 단계 안내 이메일 발송 예약 완료')
            setTimeout(() => setToastMsg(null), 3000)
            return result
          }}
          onSkip={() => {
            setNotifyTarget(null)
            // 발송 후 카드에 토큰·confirm_status 반영을 위해 데이터 새로고침
            if (selectedBatchId) void loadItems(selectedBatchId)
          }}
        />
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-2xl">
          {toastMsg}
        </div>
      )}
    </div>
  )
}
