import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApplicationKanban } from '../components/ApplicationKanban'
import {
  hrCandidateDedupeLogs,
  hrCandidateDedupeMerge,
  hrCandidateDedupeReview,
  hrCandidateDedupeSeparate,
  hrCandidateMasters,
  hrCreateApplicationBatch,
  hrDownloadApplicationBatchPdfZip,
  hrDeleteApplicationItem,
  hrDownloadApplicationItemPdf,
  hrDownloadStandardizedResumeText,
  hrDownloadApplicationBatchExcel,
  hrGetApplicationBatch,
  hrGetCompanyProfile,
  hrJobRolesList,
  hrListApplicationBatches,
  hrPatchApplicationBatch,
  hrRunApplicationBatch,
  hrScheduleApplicationResults,
  hrStandardizeApplicationBatch,
  hrUpdateApplicationStage,
} from '../api/client'

const STAGE_LABEL = {
  document_screening: '서류전형',
  interview_1: '1차 면접',
  interview_2: '2차 면접',
  final: '최종',
  hired: '입사',
  rejected: '불합격',
}

const KANBAN_STAGES = ['document_screening', 'interview_1', 'interview_2', 'final', 'hired', 'rejected']

/** 목록·셀렉트에 표시: 이름 + 건수 + (구제목이면 공고요건 일부) + 시각 */
const LEGACY_GENERIC_TITLE = '지원서 분류'

function bundleOptionLabel(b) {
  const n = Array.isArray(b.items) ? b.items.length : 0
  const dt = b.created_at ? new Date(b.created_at) : null
  const dateStr = dt
    ? dt.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
    : ''
  const t = (b.title || '').trim() || '제목 없음'
  const jd = (b.jd_preferred_text || '').trim().replace(/\s+/g, ' ')
  const jdShort = jd.length > 32 ? `${jd.slice(0, 32)}…` : jd
  const generic =
    t === LEGACY_GENERIC_TITLE || t.startsWith('지원서 접수') || t === '제목 없음'
  const parts = [t, `지원서 ${n}건`]
  if (generic && jdShort) parts.push(jdShort)
  if (dateStr) parts.push(dateStr)
  return parts.join(' · ')
}

const DEFAULT_TITLE_PLACEHOLDER = '예: 2026 상반기 백엔드 신입'

function formatJobLine(job) {
  if (!job) return ''
  const parts = [job.department, job.job_title, job.role_grade].map((s) => (s || '').trim()).filter(Boolean)
  return parts.join(' · ')
}

/** 묶음 이름에 한 조각 추가(중복 문자열이면 유지). */
function appendTitlePart(prev, part) {
  const p = (part || '').trim()
  if (!p) return prev || ''
  const base = (prev || '').trim()
  if (!base) return p
  if (base.includes(p)) return base
  return `${base} · ${p}`
}

export function HrApplicationsPage() {
  const [batches, setBatches] = useState([])
  const [error, setError] = useState(null)
  const [title, setTitle] = useState('')
  const [jdPreferred, setJdPreferred] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState(null)
  const [dedupe, setDedupe] = useState([])
  const [candidateMasters, setCandidateMasters] = useState([])
  const [dedupeLogs, setDedupeLogs] = useState([])
  const [dedupeBusy, setDedupeBusy] = useState(false)
  const [mailOpen, setMailOpen] = useState(false)
  const [mailResult, setMailResult] = useState('hired')
  const [mailTargetIds, setMailTargetIds] = useState([])
  const [mailSubject, setMailSubject] = useState('[채용 결과 안내] {name}님, {result} 결과를 안내드립니다.')
  const [mailBody, setMailBody] = useState('안녕하세요 {name}님.\n귀하의 전형 결과는 {result} 입니다.\n감사합니다.')
  const [mailAt, setMailAt] = useState('')
  const [sendMailNow, setSendMailNow] = useState(true)
  const [localItems, setLocalItems] = useState([])
  const [companyProfile, setCompanyProfile] = useState(null)
  const [jobRoles, setJobRoles] = useState([])
  const [pickedJobId, setPickedJobId] = useState('')
  const [pickSourceLoaded, setPickSourceLoaded] = useState(false)
  /** 신규 묶음: 일반 사기업 기본(블라인드 자소서 필터 비적용) */
  const [uploadEmployerSector, setUploadEmployerSector] = useState('private')
  const [uploadIncludePatterns, setUploadIncludePatterns] = useState('구현\n운영\n배포\n성능개선\n트러블슈팅')
  const [uploadExcludePatterns, setUploadExcludePatterns] = useState('학습중\n관심있음\n예정\n희망')
  const [uploadRequireEvidence, setUploadRequireEvidence] = useState(true)
  const [uploadDepartmentName, setUploadDepartmentName] = useState('')
  const [uploadPositionName, setUploadPositionName] = useState('')
  const [uploadPostingPlatform, setUploadPostingPlatform] = useState('')
  const [uploadPostedAt, setUploadPostedAt] = useState('')
  const [uploadDeadlineAt, setUploadDeadlineAt] = useState('')
  /** 선택된 묶음 설정 */
  const [batchEmployerSector, setBatchEmployerSector] = useState('public')
  const [batchIncludePatterns, setBatchIncludePatterns] = useState('')
  const [batchExcludePatterns, setBatchExcludePatterns] = useState('')
  const [batchRequireEvidence, setBatchRequireEvidence] = useState(true)
  const [batchDepartmentName, setBatchDepartmentName] = useState('')
  const [batchPositionName, setBatchPositionName] = useState('')
  const [batchPostingPlatform, setBatchPostingPlatform] = useState('')
  const [batchPostedAt, setBatchPostedAt] = useState('')
  const [batchDeadlineAt, setBatchDeadlineAt] = useState('')

  const refreshList = useCallback(async () => {
    setError(null)
    try {
      const list = await hrListApplicationBatches()
      setBatches(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e?.message || '목록 실패')
    }
  }, [])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const settled = await Promise.allSettled([hrGetCompanyProfile(), hrJobRolesList()])
      if (cancelled) return
      const p = settled[0].status === 'fulfilled' && settled[0].value && typeof settled[0].value === 'object' ? settled[0].value : null
      const jobs =
        settled[1].status === 'fulfilled' && Array.isArray(settled[1].value) ? settled[1].value : []
      setCompanyProfile(p)
      setJobRoles(jobs)
      setPickSourceLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadDetail = async (id) => {
    if (!id) {
      setDetail(null)
      return
    }
    setError(null)
    try {
      const d = await hrGetApplicationBatch(id)
      setDetail(d)
      const [reviewDup, masters, logs] = await Promise.all([
        hrCandidateDedupeReview(id),
        hrCandidateMasters(),
        hrCandidateDedupeLogs(30),
      ])
      setCandidateMasters(Array.isArray(masters) ? masters : [])
      setDedupeLogs(Array.isArray(logs) ? logs : [])
      const groups = Array.isArray(reviewDup?.groups) ? reviewDup.groups : []
      setDedupe(groups)
    } catch (e) {
      setError(e?.message || '상세 실패')
    }
  }

  useEffect(() => {
    void loadDetail(selectedId)
  }, [selectedId])

  useEffect(() => {
    setLocalItems(detail?.items ? [...detail.items] : [])
  }, [detail])

  useEffect(() => {
    if (!detail) return
    setPickedJobId(detail.job_role_id ? String(detail.job_role_id) : '')
    const es = detail.employer_sector === 'private' ? 'private' : 'public'
    setBatchEmployerSector(es)
    setBatchIncludePatterns(detail.preferred_include_patterns || '')
    setBatchExcludePatterns(detail.preferred_exclude_patterns || '')
    setBatchRequireEvidence(detail.preferred_requires_evidence !== false)
    setBatchDepartmentName(detail.department_name || '')
    setBatchPositionName(detail.position_name || '')
    setBatchPostingPlatform(detail.posting_platform || '')
    setBatchPostedAt(
      detail.posted_at ? new Date(detail.posted_at).toISOString().slice(0, 16) : '',
    )
    setBatchDeadlineAt(
      detail.deadline_at ? new Date(detail.deadline_at).toISOString().slice(0, 16) : '',
    )
  }, [detail])

  const upload = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const d = await hrCreateApplicationBatch({
        title,
        jdPreferredText: jdPreferred,
        files,
        jobRoleId: pickedJobId || undefined,
        employerSector: uploadEmployerSector,
        preferredIncludePatterns: uploadIncludePatterns,
        preferredExcludePatterns: uploadExcludePatterns,
        preferredRequiresEvidence: uploadRequireEvidence,
        departmentName: uploadDepartmentName,
        positionName: uploadPositionName,
        postingPlatform: uploadPostingPlatform,
        postedAt: uploadPostedAt ? new Date(uploadPostedAt).toISOString() : undefined,
        deadlineAt: uploadDeadlineAt ? new Date(uploadDeadlineAt).toISOString() : undefined,
      })
      setSelectedId(d.id)
      setFiles([])
      await refreshList()
    } catch (err) {
      setError(err?.message || '업로드 실패')
    } finally {
      setBusy(false)
    }
  }

  const run = async () => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      const d = await hrRunApplicationBatch(selectedId)
      setDetail(d)
      await refreshList()
    } catch (e) {
      setError(e?.message || '분석 실패')
    } finally {
      setBusy(false)
    }
  }

  const xlsx = async () => {
    if (!selectedId) return
    try {
      await hrDownloadApplicationBatchExcel(selectedId)
    } catch (e) {
      setError(e?.message || '엑셀 실패')
    }
  }

  const standardize = async () => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      const r = await hrStandardizeApplicationBatch(selectedId)
      await loadDetail(selectedId)
      alert(`표준화 완료: ${r.updated}건, 스킵 ${r.skipped}건`)
    } catch (e) {
      setError(e?.message || '표준화 실패')
    } finally {
      setBusy(false)
    }
  }

  const openMailPanel = (itemIds, result) => {
    setMailTargetIds(itemIds)
    setMailResult(result)
    setSendMailNow(true)
    setMailOpen(true)
  }

  const onCommitKanbanMove = async (itemId, newStage) => {
    const snapshot = [...localItems]
    setLocalItems((prev) => prev.map((x) => (String(x.id) === String(itemId) ? { ...x, stage: newStage } : x)))
    setError(null)
    try {
      await hrUpdateApplicationStage(itemId, newStage)
      await loadDetail(selectedId)
      if (newStage === 'hired' || newStage === 'rejected') {
        openMailPanel([itemId], newStage)
      }
    } catch (err) {
      setLocalItems(snapshot)
      setError(err?.message || '칸반 이동 실패')
    }
  }

  const openBulkResultMail = (result) => {
    if (!detail?.items?.length) return
    const ids = detail.items.filter((x) => x.stage === result).map((x) => x.id)
    openMailPanel(ids, result)
  }

  const scheduleMail = async (e) => {
    e.preventDefault()
    if (!selectedId) return
    if (!sendMailNow && !mailAt) {
      setError('예약 발송이면 예약 시각을 선택하세요.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload = {
        item_ids: mailTargetIds,
        result: mailResult,
        subject_template: mailSubject,
        body_template: mailBody,
      }
      if (sendMailNow) {
        payload.send_immediately = true
      } else {
        payload.schedule_at = new Date(mailAt).toISOString()
      }
      const r = await hrScheduleApplicationResults(selectedId, payload)
      setMailOpen(false)
      alert(`메일 큐 등록: ${r.queued}건 (이메일 없음 ${r.skipped_no_email}건)`)
      await loadDetail(selectedId)
    } catch (err) {
      setError(err?.message || '결과 메일 예약 실패')
    } finally {
      setBusy(false)
    }
  }

  const pickedJob = pickedJobId ? jobRoles.find((j) => String(j.id) === String(pickedJobId)) : null
  const titleInputPlaceholder = pickedJob ? formatJobLine(pickedJob) : DEFAULT_TITLE_PLACEHOLDER

  const insertCompanyName = () => {
    const name = (companyProfile?.company_name || '').trim()
    if (!name) {
      setError('회사 프로필에 회사명이 없습니다. HR → 회사·직무 데이터에서 입력하세요.')
      return
    }
    setError(null)
    setTitle((t) => appendTitlePart(t, name))
  }

  const insertJobLine = () => {
    const line = formatJobLine(pickedJob)
    if (!line) {
      setError('직무를 선택하세요.')
      return
    }
    setError(null)
    setTitle((t) => appendTitlePart(t, line))
  }

  const insertCompanyAndJob = () => {
    const name = (companyProfile?.company_name || '').trim()
    const line = formatJobLine(pickedJob)
    if (!name && !line) {
      setError('회사명 또는 선택 직무 중 하나 이상 필요합니다.')
      return
    }
    setError(null)
    const combined = [name, line].filter(Boolean).join(' · ')
    setTitle((t) => appendTitlePart(t, combined))
  }

  const removeItem = async (itemId) => {
    if (!window.confirm('이 지원자 카드를 삭제할까요?')) return
    try {
      await hrDeleteApplicationItem(itemId)
      await loadDetail(selectedId)
    } catch (e) {
      setError(e?.message || '카드 삭제 실패')
    }
  }

  const mergeDedupeGroup = async (group) => {
    if (!group?.application_ids?.length || group.application_ids.length < 2) return
    if (!window.confirm(`중복 후보 ${group.application_ids.length}건을 하나의 후보자로 병합할까요?`)) return
    setDedupeBusy(true)
    setError(null)
    try {
      await hrCandidateDedupeMerge({
        item_ids: group.application_ids,
        reason: `UI 병합 처리 (${group.status}, score=${group.score})`,
      })
      await loadDetail(selectedId)
    } catch (e) {
      setError(e?.message || '병합 실패')
    } finally {
      setDedupeBusy(false)
    }
  }

  const separateDedupeGroup = async (group) => {
    if (!group?.application_ids?.length) return
    setDedupeBusy(true)
    setError(null)
    try {
      await hrCandidateDedupeSeparate({
        item_ids: group.application_ids,
        reason: `UI 분리 처리 (${group.status}, score=${group.score})`,
      })
      await loadDetail(selectedId)
    } catch (e) {
      setError(e?.message || '분리 처리 실패')
    } finally {
      setDedupeBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">이력서 정리 · 지원서 분류</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            문서 업로드 → AI 분류·표준화 → 중복(이름+생년월일) 점검 → 칸반 단계 이동 → PDF·메일.{' '}
            <strong className="font-medium text-slate-800 dark:text-slate-200">
              블라인드 자기소개서(학력 직접 언급 등) 필터는 공기업·공공기관 전형에만 적용
            </strong>
            하며, 일반 사기업 묶음에서는 우대 요건 매칭 위주로 분류합니다.
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

      <form onSubmit={upload} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. 지원서 업로드</h2>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          지원서 묶음 이름
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={titleInputPlaceholder}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">회사 프로필 · 직무 목록에서 묶음 이름 채우기</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            직무를 고르면 위 입력란의 <strong className="font-medium text-slate-600 dark:text-slate-300">placeholder</strong>가 해당 직무
            표기로 바뀝니다. 버튼을 누르면 실제 이름 값에 이어 붙입니다.
          </p>
          {pickSourceLoaded && !companyProfile && jobRoles.length === 0 ? (
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
              회사·직무 정보를 불러오지 못했습니다. 로그인 상태를 확인하거나{' '}
              <Link to="/hr/company" className="text-violet-600 underline dark:text-violet-400">
                회사·직무 데이터
              </Link>
              ,{' '}
              <Link to="/hr/job-roles" className="text-violet-600 underline dark:text-violet-400">
                통합 직무소개서
              </Link>
              에서 먼저 등록해 주세요.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <button
                type="button"
                onClick={() => insertCompanyName()}
                disabled={!(companyProfile?.company_name || '').trim()}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:hover:bg-slate-800"
              >
                회사명 넣기
              </button>
              <label className="flex min-w-[12rem] flex-1 flex-col text-xs font-medium text-slate-600 dark:text-slate-400">
                직무 선택
                <select
                  value={pickedJobId}
                  onChange={(e) => setPickedJobId(e.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">직무를 선택하세요…</option>
                  {jobRoles.map((j) => (
                    <option key={j.id} value={j.id}>
                      {formatJobLine(j) || j.id}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => insertJobLine()}
                disabled={!pickedJob}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:hover:bg-slate-800"
              >
                선택 직무 넣기
              </button>
              <button
                type="button"
                onClick={() => insertCompanyAndJob()}
                disabled={!(companyProfile?.company_name || '').trim() && !pickedJob}
                className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-900/50"
              >
                회사명 + 선택 직무 넣기
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          공고·직무처럼 구분되는 이름을 추천합니다. 비워 두면 접수 시각이 들어간 이름이 자동으로 붙습니다.
        </p>
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
          <legend className="px-1 text-sm font-medium text-slate-800 dark:text-slate-200">채용 주체 (AI 분류 기준)</legend>
          <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
            공기업·공공기관: 블라인드 자소서 규정에 맞춘 위험 구절·등급을 함께 봅니다. 일반 사기업: 해당 블라인드 필터는 적용하지 않고 공고 우대 요건 위주로만 봅니다.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="radio"
                name="uploadEmployerSector"
                checked={uploadEmployerSector === 'public'}
                onChange={() => setUploadEmployerSector('public')}
                className="border-slate-400 text-violet-600"
              />
              공기업·공공기관 (블라인드 자소서 필터 적용)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="radio"
                name="uploadEmployerSector"
                checked={uploadEmployerSector === 'private'}
                onChange={() => setUploadEmployerSector('private')}
                className="border-slate-400 text-violet-600"
              />
              일반 사기업 (블라인드 자소서 필터 비적용)
            </label>
          </div>
        </fieldset>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          공고 우대·자격 요건 (텍스트)
          <textarea
            rows={4}
            value={jdPreferred}
            onChange={(e) => setJdPreferred(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
          <legend className="px-1 text-sm font-medium text-slate-800 dark:text-slate-200">공고 기본 정보</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              지원부서
              <input
                value={uploadDepartmentName}
                onChange={(e) => setUploadDepartmentName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              포지션명
              <input
                value={uploadPositionName}
                onChange={(e) => setUploadPositionName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              공고 플랫폼
              <input
                value={uploadPostingPlatform}
                onChange={(e) => setUploadPostingPlatform(e.target.value)}
                placeholder="사람인 / 잡코리아 / 원티드"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                공고일
                <input
                  type="datetime-local"
                  value={uploadPostedAt}
                  onChange={(e) => setUploadPostedAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                마감일
                <input
                  type="datetime-local"
                  value={uploadDeadlineAt}
                  onChange={(e) => setUploadDeadlineAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
            </div>
          </div>
        </fieldset>
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
          <legend className="px-1 text-sm font-medium text-slate-800 dark:text-slate-200">우대 문장 규칙</legend>
          <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">
            예: "배우고 있어요"는 제외, "구현/운영/배포"는 반영. 줄바꿈으로 여러 패턴을 입력하세요.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              가산 패턴
              <textarea
                rows={4}
                value={uploadIncludePatterns}
                onChange={(e) => setUploadIncludePatterns(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              제외 패턴
              <textarea
                rows={4}
                value={uploadExcludePatterns}
                onChange={(e) => setUploadExcludePatterns(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={uploadRequireEvidence}
              onChange={(e) => setUploadRequireEvidence(e.target.checked)}
              className="rounded border-slate-400 text-violet-600"
            />
            행동 동사 + 결과(수치/성과) 증거가 있을 때만 우대 충족으로 인정
          </label>
        </fieldset>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          문서 파일 (PDF, DOCX, TXT, MD, RTF, HWP/HWPX — 한글은 변환 API 권장 / 복수 선택)
          <input
            type="file"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="mt-1 block w-full text-sm text-slate-600 dark:text-slate-400"
          />
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          DOCX 등은 용량 한도 내에서 서버(DB)에 원본이 보관됩니다.「정리본 PDF」는 표준화·추출 텍스트로 만듭니다.「원본→PDF」는 배포 시{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">RESUME_OFFICE_TO_PDF_HTTP_URL</code>에 연결한 외부 변환 API를
          쓰는 방식을 권장합니다(앱 서버에 LibreOffice 설치 불필요). 로컬 개발만 LibreOffice가 있으면 URL 없이도 시도합니다.
        </p>
        <button
          type="submit"
          disabled={busy || files.length === 0}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          지원서 올리고 묶음 만들기
        </button>
      </form>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. 지원서 묶음 선택 · 필터링 · 엑셀</h2>
        <div className="space-y-1.5">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full max-w-3xl rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="">지원서 묶음 선택…</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {bundleOptionLabel(b)}
              </option>
            ))}
          </select>
          <p className="max-w-3xl text-xs text-slate-500 dark:text-slate-400">
            각 줄에 묶음 이름, 지원서 건수, 예전처럼 이름을 안 적었을 때는 공고 요건 앞부분, 접수 시각이 함께 표시됩니다.
          </p>
          {selectedId ? (
            <div className="mt-3 flex max-w-3xl flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/50">
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-300">채용 주체</p>
                <p className="mt-1 text-slate-600 dark:text-slate-400">
                  공공 전형만 블라인드 자소서 필터가 켜집니다. 묶음 생성 이후에도 여기서 바꾼 뒤「설정 저장」을 누르고, 필요하면 AI 분류를 다시 실행하세요.
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name="batchEmployerSector"
                      checked={batchEmployerSector === 'public'}
                      onChange={() => setBatchEmployerSector('public')}
                      className="border-slate-400 text-violet-600"
                    />
                    공기업·공공기관
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name="batchEmployerSector"
                      checked={batchEmployerSector === 'private'}
                      onChange={() => setBatchEmployerSector('private')}
                      className="border-slate-400 text-violet-600"
                    />
                    일반 사기업
                  </label>
                </div>
              </div>
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-300">공고 기본 정보</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    지원부서
                    <input
                      value={batchDepartmentName}
                      onChange={(e) => setBatchDepartmentName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    포지션명
                    <input
                      value={batchPositionName}
                      onChange={(e) => setBatchPositionName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    공고 플랫폼
                    <input
                      value={batchPostingPlatform}
                      onChange={(e) => setBatchPostingPlatform(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      공고일
                      <input
                        type="datetime-local"
                        value={batchPostedAt}
                        onChange={(e) => setBatchPostedAt(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      마감일
                      <input
                        type="datetime-local"
                        value={batchDeadlineAt}
                        onChange={(e) => setBatchDeadlineAt(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                  </div>
                </div>
              </div>
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-300">우대 문장 규칙</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    가산 패턴
                    <textarea
                      rows={3}
                      value={batchIncludePatterns}
                      onChange={(e) => setBatchIncludePatterns(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    제외 패턴
                    <textarea
                      rows={3}
                      value={batchExcludePatterns}
                      onChange={(e) => setBatchExcludePatterns(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={batchRequireEvidence}
                    onChange={(e) => setBatchRequireEvidence(e.target.checked)}
                    className="rounded border-slate-400 text-violet-600"
                  />
                  증거(행동+결과) 필수
                </label>
              </div>
              <p className="font-medium text-slate-700 dark:text-slate-300">이 묶음 ↔ 통합 직무(TO 대비 요약용)</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[12rem] flex-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                  연결 직무
                  <select
                    value={pickedJobId}
                    onChange={(e) => setPickedJobId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">연결 없음</option>
                    {jobRoles.map((j) => (
                      <option key={j.id} value={j.id}>
                        {formatJobLine(j) || j.id}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    setError(null)
                    try {
                      const body = {
                        employer_sector: batchEmployerSector,
                        preferred_include_patterns: batchIncludePatterns,
                        preferred_exclude_patterns: batchExcludePatterns,
                        preferred_requires_evidence: batchRequireEvidence,
                        department_name: batchDepartmentName,
                        position_name: batchPositionName,
                        posting_platform: batchPostingPlatform,
                        posted_at: batchPostedAt ? new Date(batchPostedAt).toISOString() : null,
                        deadline_at: batchDeadlineAt ? new Date(batchDeadlineAt).toISOString() : null,
                        ...(pickedJobId ? { job_role_id: pickedJobId } : { clear_job_role: true }),
                      }
                      await hrPatchApplicationBatch(selectedId, body)
                      await loadDetail(selectedId)
                      await refreshList()
                    } catch (e) {
                      setError(e?.message || '설정 저장 실패')
                    } finally {
                      setBusy(false)
                    }
                  }}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                >
                  설정 저장
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void run()}
            disabled={!selectedId || busy}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            AI 분류 실행
          </button>
          {detail?.employer_sector === 'private' ? (
            <p className="w-full text-xs text-slate-500 dark:text-slate-400">
              이 묶음은 일반 사기업으로 설정되어 있습니다. 블라인드 자소서 필터는 적용되지 않습니다.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void standardize()}
            disabled={!selectedId || busy}
            className="rounded-lg border border-violet-300 px-3 py-2 text-sm hover:bg-violet-50 disabled:opacity-50 dark:border-violet-700 dark:hover:bg-violet-900/30"
          >
            이력서 양식 표준화(AI)
          </button>
          <button
            type="button"
            onClick={() => void xlsx()}
            disabled={!selectedId}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            엑셀보내기
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await hrDownloadApplicationBatchPdfZip(selectedId)
              } catch (e) {
                setError(e?.message || 'PDF ZIP 실패')
              }
            }}
            disabled={!selectedId}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            전체 PDF ZIP
          </button>
          <button
            type="button"
            onClick={() => openBulkResultMail('hired')}
            disabled={!selectedId}
            className="rounded-lg border border-emerald-300 px-3 py-2 text-sm hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:hover:bg-emerald-900/30"
          >
            합격열 메일 예약
          </button>
          <button
            type="button"
            onClick={() => openBulkResultMail('rejected')}
            disabled={!selectedId}
            className="rounded-lg border border-rose-300 px-3 py-2 text-sm hover:bg-rose-50 disabled:opacity-50 dark:border-rose-700 dark:hover:bg-rose-900/30"
          >
            불합격열 메일 예약
          </button>
        </div>

        {detail && (
          <div className="space-y-6 text-left text-sm">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">중복 의심 묶음 (강/약한 키 점수)</h3>
              {dedupe.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">중복 후보 없음</p>
              ) : (
                <ul className="mt-2 space-y-2 text-xs">
                  {dedupe.map((g) => (
                    <li
                      key={(g.application_ids || []).join('-')}
                      className="rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30"
                    >
                      상태: {g.status} · 점수: {Number(g.score || 0).toFixed(2)} · 대상 {(g.application_ids || []).length}건
                      <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">{g.reason || '-'}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(g.applications || []).map((a) => (
                          <span
                            key={a.item_id}
                            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            {(a.candidate_name || '이름없음').trim()} · {(a.source_platform || 'unknown').trim()} · {(a.batch_title || '').trim()}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={dedupeBusy}
                          onClick={() => void mergeDedupeGroup(g)}
                          className="rounded border border-emerald-300 px-1.5 py-0.5 text-[11px] text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                        >
                          병합
                        </button>
                        <button
                          type="button"
                          disabled={dedupeBusy}
                          onClick={() => void separateDedupeGroup(g)}
                          className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-800 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900/40"
                        >
                          분리(중복 아님)
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-slate-500">자동 판단은 후보군 제안용이며, 병합/분리는 채용담당자 확인 후 실행하세요.</p>
              {candidateMasters.length > 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  후보자 마스터: {candidateMasters.length}명 · 최근 병합/분리 로그: {dedupeLogs.length}건
                </p>
              ) : null}
            </div>

            <ApplicationKanban
              stages={KANBAN_STAGES}
              stageLabel={STAGE_LABEL}
              items={localItems}
              onCommitMove={onCommitKanbanMove}
              renderCard={(it) => (
                <>
                  <p className="font-medium text-slate-900 dark:text-white">{it.candidate_name || it.filename}</p>
                  <p className="text-xs text-slate-500">{it.birth_date || '생년월일 없음'}</p>
                  <p className="text-xs text-slate-500">{it.email_extracted || '이메일 없음'}</p>
                  <p className="text-xs text-slate-500">지원경로: {it.source_platform || 'unknown'}</p>
                  <p className="text-xs text-slate-500">
                    추출: {it.pdf_conversion_status}
                    {it.source_ext ? ` (${it.source_ext})` : ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    직무연관도: {Number(it.role_relevance_score || 0).toFixed(2)} · 완성도:{' '}
                    {Math.round(Number(it.resume_completeness_score || 0) * 100)}% · 증거: {it.evidence_level || 'unknown'}
                  </p>
                  {(it.missing_fields || []).length > 0 ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      누락: {(it.missing_fields || []).join(', ')}
                    </p>
                  ) : null}
                  {!it.text_quality_ok && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      텍스트 품질 주의: {it.text_quality_note || '추출 품질 낮음'}
                    </p>
                  )}
                  {!!it.pdf_conversion_note && <p className="text-xs text-slate-500">{it.pdf_conversion_note}</p>}
                  {detail?.employer_sector === 'private' ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      블라인드 자소서 필터: 미적용(사기업 묶음). 우대: {it.preferred_met ? '충족 근거 있음' : '해당 없음/미충족'}
                      {it.preferred_reason ? ` — ${it.preferred_reason}` : ''}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      블라인드 등급: {it.blind_tier || '—'} · 우대: {it.preferred_met ? '충족 근거 있음' : '해당 없음/미충족'}
                    </p>
                  )}
                  {detail?.employer_sector === 'public' && (it.blind_summary || (it.keyword_flags || []).length > 0) ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3">{it.blind_summary}</p>
                  ) : null}
                  {(it.preferred_rule_hits || []).length > 0 ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">가산패턴: {(it.preferred_rule_hits || []).join(', ')}</p>
                  ) : null}
                  {(it.preferred_rule_excluded_hits || []).length > 0 ? (
                    <p className="text-xs text-rose-700 dark:text-rose-300">
                      제외패턴: {(it.preferred_rule_excluded_hits || []).join(', ')}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
                    <button
                      type="button"
                      onClick={() => void hrDownloadStandardizedResumeText(it.id)}
                      className="text-xs text-violet-600 underline dark:text-violet-300"
                    >
                      표준(.txt)
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await hrDownloadApplicationItemPdf(it.id, 'text')
                        } catch (err) {
                          setError(err?.message || '정리본 PDF 실패')
                        }
                      }}
                      className="text-xs text-violet-600 underline dark:text-violet-300"
                    >
                      정리본 PDF
                    </button>
                    {it.has_source_attachment ? (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await hrDownloadApplicationItemPdf(it.id, 'source')
                          } catch (err) {
                            setError(err?.message || '원본→PDF 실패(LibreOffice 필요)')
                          }
                        }}
                        className="text-xs text-slate-600 underline dark:text-slate-400"
                      >
                        원본→PDF
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void removeItem(it.id)}
                      className="text-xs text-rose-600 underline dark:text-rose-400"
                    >
                      삭제
                    </button>
                  </div>
                </>
              )}
            />
          </div>
        )}
      </section>

      {mailOpen && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">결과 메일 초안</h2>
          <p className="mt-1 text-xs text-slate-500">
            대상 {mailTargetIds.length}건 · {"{name}"} / {"{result}"}(발송 시 한글: 입사(합격) 확정·최종 불합격으로 치환)
          </p>
          <form onSubmit={scheduleMail} className="mt-3 space-y-3">
            <input
              value={mailSubject}
              onChange={(e) => setMailSubject(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
            <textarea
              rows={5}
              value={mailBody}
              onChange={(e) => setMailBody(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={sendMailNow}
                onChange={(e) => setSendMailNow(e.target.checked)}
                className="rounded border-slate-300"
              />
              즉시 발송 큐(수 초 내 발송 예약)
            </label>
            {!sendMailNow ? (
              <label className="block text-sm">
                예약 시각
                <input
                  type="datetime-local"
                  value={mailAt}
                  onChange={(e) => setMailAt(e.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
            ) : null}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || mailTargetIds.length === 0}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {sendMailNow ? '메일 보내기' : '예약 전송'}
              </button>
              <button
                type="button"
                onClick={() => setMailOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600"
              >
                닫기
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
