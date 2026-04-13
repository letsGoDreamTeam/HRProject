import { getHrToken } from '../utils/hrTokenStorage'

/**
 * VITE_API_BASE_URL: FastAPI 루트만 (예: http://127.0.0.1:8000). 끝의 /api는 제거됨.
 * 프론트와 같은 origin(예: http://localhost:5173)으로 넣으면 /api가 Vite에만 닿아 404 → 자동으로 무시하고 상대 경로(프록시) 사용.
 */
function normalizeApiBase(raw) {
  let s = raw == null ? '' : String(raw).trim()
  if (!s) return ''
  s = s.replace(/\/+$/, '')
  if (/\/api$/i.test(s)) s = s.replace(/\/api$/i, '')
  return s.replace(/\/+$/, '')
}

/** Vite가 자주 쓰는 포트(0.0.0.0 바인딩 후 LAN IP로 접속하는 경우 포함) */
const DEVISH_PORTS = new Set(['3000', '5173', '5174', '4173', '4174'])

function isRfc1918Ipv4(hostname) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!m) return false
  const o = [1, 2, 3, 4].map((i) => Number(m[i]))
  if (o.some((n) => Number.isNaN(n) || n > 255)) return false
  const [a, b] = o
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && o[1] === 168) return true
  return false
}

/** localhost / 127.0.0.1 / LAN 사설 IP + 개발용 포트 */
function isLikelyLocalViteClient() {
  if (typeof window === 'undefined' || !window.location) return false
  const { hostname, port } = window.location
  if (!DEVISH_PORTS.has(port)) return false
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true
  return isRfc1918Ipv4(hostname)
}

/** 백엔드가 같은 머신에서 0.0.0.0:8000 일 때, LAN에서는 페이지 hostname 으로 붙어야 함 */
function directLocalBackendOrigin() {
  if (typeof window === 'undefined' || !window.location) return 'http://127.0.0.1:8000'
  const { hostname, protocol } = window.location
  const proto = protocol === 'https:' ? 'https:' : 'http:'
  const rawPort = String(import.meta.env.VITE_API_FALLBACK_PORT ?? '8000').trim()
  const apiPort = rawPort.replace(/\D/g, '') || '8000'
  const apiHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' ? '127.0.0.1' : hostname
  return `${proto}//${apiHost}:${apiPort}`
}

/** 에러 안내용 (기록 페이지 등) */
export function getDefaultBackendBaseForUi() {
  return directLocalBackendOrigin()
}

function getApiBase() {
  const raw = import.meta.env.VITE_API_BASE_URL
  let base = normalizeApiBase(raw)

  if (typeof window !== 'undefined' && window.location?.origin && base) {
    try {
      const resolved = new URL(base, window.location.href)
      if (resolved.origin === window.location.origin) {
        base = ''
      }
    } catch {
      base = ''
    }
  }

  if (!base && isLikelyLocalViteClient()) {
    return directLocalBackendOrigin()
  }
  return base
}

/** path는 `/api/...` 로 시작 (쿼리 포함 가능) */
function apiUrl(path) {
  const base = getApiBase()
  const p = path.startsWith('/') ? path : `/${path}`
  if (!base) return p
  return `${base}${p}`
}

async function parseError(res) {
  try {
    const j = await res.json()
    if (j && typeof j.detail === 'string') return j.detail
    if (Array.isArray(j.detail)) {
      return j.detail.map((x) => (x && typeof x === 'object' ? x.msg : null)).filter(Boolean).join(', ')
    }
  } catch {
    /* ignore */
  }
  return res.statusText || '요청 실패'
}

export async function extractJdFromPdf(file) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(apiUrl('/api/jd/from-pdf'), {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function analyzeJd(jdText) {
  const res = await fetch(apiUrl('/api/analyze'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jd_text: jdText }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function analyzeAndSave(jdText) {
  const res = await fetch(apiUrl('/api/analyze/save'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jd_text: jdText }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function fetchHistory(limit = 20) {
  const res = await fetch(apiUrl(`/api/history?limit=${limit}`))
  if (!res.ok) throw new Error(`${await parseError(res)} (HTTP ${res.status})`)
  return res.json()
}

export async function fetchHistoryItem(id) {
  const res = await fetch(apiUrl(`/api/history/${id}`))
  if (!res.ok) throw new Error(`${await parseError(res)} (HTTP ${res.status})`)
  return res.json()
}

/** --- A-PASS --- */
export async function apassParseRecord({ file, fullText }) {
  const fd = new FormData()
  if (file) fd.append('file', file)
  if (fullText) fd.append('full_text', fullText)
  const res = await fetch(apiUrl('/api/apass/parse-record'), {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function apassIngestUniversity(body) {
  const res = await fetch(apiUrl('/api/apass/ingest-university'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function apassAnalyzeFit(body) {
  const res = await fetch(apiUrl('/api/apass/analyze-fit'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function apassInterviewStart(body) {
  const res = await fetch(apiUrl('/api/apass/interview/start'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function apassInterviewTurn(body) {
  const res = await fetch(apiUrl('/api/apass/interview/turn'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function apassDashboardStudent() {
  const res = await fetch(apiUrl('/api/apass/dashboard/student'))
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function apassDashboardInstitution() {
  const res = await fetch(apiUrl('/api/apass/dashboard/institution'))
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

/** --- HR (인증·채용 운영) --- 토큰은 sessionStorage (탭 닫으면 로그아웃) */

function hrAuthHeaders() {
  const t = getHrToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function hrJson(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: { ...hrAuthHeaders() } }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(apiUrl(path), opts)
  if (!res.ok) throw new Error(await parseError(res))
  if (res.status === 204) return null
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) return null
  return res.json()
}

export async function hrRegister(email, password, fullName) {
  const res = await fetch(apiUrl('/api/hr/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, full_name: fullName || '' }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function hrLogin(email, password) {
  const res = await fetch(apiUrl('/api/hr/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function hrLogout() {
  try {
    await fetch(apiUrl('/api/hr/auth/logout'), { method: 'POST', headers: { ...hrAuthHeaders() } })
  } catch {
    /* ignore */
  }
}

export async function hrDeleteAccount(password) {
  return hrJson('/api/hr/auth/delete-account', { method: 'POST', body: { password } })
}

export async function hrMe() {
  return hrJson('/api/hr/auth/me')
}

export async function hrGetCompanyProfile() {
  return hrJson('/api/hr/company-profile')
}

export async function hrPutCompanyProfile(payload) {
  return hrJson('/api/hr/company-profile', { method: 'PUT', body: payload })
}

/** PDF 통합 문서 → 회사명·공고·직무기술서·조직문화 (LLM 분리, 폼만 채움) */
export async function hrParseCompanyProfilePdf(file) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(apiUrl('/api/hr/company-profile/from-pdf'), {
    method: 'POST',
    headers: { ...hrAuthHeaders() },
    body: fd,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function hrJobRolesList() {
  return hrJson('/api/hr/job-roles')
}

export async function hrJobRolesFromPdf(file) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(apiUrl('/api/hr/job-roles/from-pdf'), {
    method: 'POST',
    headers: { ...hrAuthHeaders() },
    body: fd,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function hrJobRolesBulkReplace(payload) {
  return hrJson('/api/hr/job-roles/bulk', { method: 'PUT', body: payload })
}

export async function hrJobRolesDelete(id) {
  return hrJson(`/api/hr/job-roles/${id}`, { method: 'DELETE' })
}

export async function hrJobRolesRagSearch(query, topK = 8) {
  const q = encodeURIComponent(query || '')
  return hrJson(`/api/hr/job-roles/rag-search?query=${q}&top_k=${topK}`)
}

export async function hrListApplicationBatches() {
  return hrJson('/api/hr/applications/batches')
}

export async function hrCreateApplicationBatch({ title, jdPreferredText, files }) {
  const fd = new FormData()
  fd.append('title', title || '지원서 분류')
  fd.append('jd_preferred_text', jdPreferredText || '')
  for (const f of files || []) fd.append('files', f)
  const res = await fetch(apiUrl('/api/hr/applications/batches'), {
    method: 'POST',
    headers: { ...hrAuthHeaders() },
    body: fd,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function hrGetApplicationBatch(id) {
  return hrJson(`/api/hr/applications/batches/${id}`)
}

export async function hrRunApplicationBatch(id) {
  return hrJson(`/api/hr/applications/batches/${id}/run`, { method: 'POST' })
}

export async function hrStandardizeApplicationBatch(id) {
  return hrJson(`/api/hr/applications/batches/${id}/standardize`, { method: 'POST' })
}

export async function hrApplicationDedupeScan(id) {
  return hrJson(`/api/hr/applications/batches/${id}/dedupe`)
}

export async function hrUpdateApplicationStage(itemId, stage) {
  return hrJson(`/api/hr/applications/items/${itemId}/stage`, { method: 'PATCH', body: { stage } })
}

export async function hrDeleteApplicationItem(itemId) {
  return hrJson(`/api/hr/applications/items/${itemId}`, { method: 'DELETE' })
}

export async function hrScheduleApplicationResults(batchId, payload) {
  return hrJson(`/api/hr/applications/batches/${batchId}/results/schedule`, { method: 'POST', body: payload })
}

export async function hrDownloadStandardizedResumeText(itemId) {
  const res = await fetch(apiUrl(`/api/hr/applications/items/${itemId}/standardized.txt`), {
    headers: { ...hrAuthHeaders() },
  })
  if (!res.ok) throw new Error(await parseError(res))
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `standardized_${itemId}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

export async function hrDownloadApplicationBatchExcel(batchId) {
  const res = await fetch(apiUrl(`/api/hr/applications/batches/${batchId}/export.xlsx`), {
    headers: { ...hrAuthHeaders() },
  })
  if (!res.ok) throw new Error(await parseError(res))
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `applications_${batchId}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export async function hrListSchedules() {
  return hrJson('/api/hr/schedules')
}

export async function hrCreateSchedule(payload) {
  return hrJson('/api/hr/schedules', { method: 'POST', body: payload })
}

export async function hrGetSchedule(id) {
  return hrJson(`/api/hr/schedules/${id}`)
}

export async function hrGetScheduleBookingStatus(id) {
  return hrJson(`/api/hr/schedules/${id}/booking-status`)
}

export async function hrRemindPendingCandidates(id) {
  return hrJson(`/api/hr/schedules/${id}/remind-pending`, { method: 'POST' })
}

export async function hrEvaluationsSetup(roundId, payload) {
  return hrJson(`/api/hr/schedules/${roundId}/evaluations/setup`, { method: 'POST', body: payload })
}

export async function hrEvaluationsStatus(roundId) {
  return hrJson(`/api/hr/schedules/${roundId}/evaluations/status`)
}

export async function hrEvaluationsAggregate(roundId, candidateId) {
  return hrJson(`/api/hr/schedules/${roundId}/evaluations/aggregate/${candidateId}`)
}

export async function hrEvaluationsRemindPending(roundId) {
  return hrJson(`/api/hr/schedules/${roundId}/evaluations/remind-pending`, { method: 'POST' })
}

export async function hrPatchSchedule(id, payload) {
  return hrJson(`/api/hr/schedules/${id}`, { method: 'PATCH', body: payload })
}

export async function hrDeleteSchedule(id) {
  return hrJson(`/api/hr/schedules/${id}`, { method: 'DELETE' })
}

export async function hrPublicSchedule(token) {
  const res = await fetch(apiUrl(`/api/public/schedule/${encodeURIComponent(token)}`))
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function hrPublicBookSlot(token, slotId) {
  const res = await fetch(apiUrl(`/api/public/schedule/${encodeURIComponent(token)}/book`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot_id: slotId }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function hrPublicChangeBooking(token, slotId) {
  const res = await fetch(apiUrl(`/api/public/schedule/${encodeURIComponent(token)}/booking`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot_id: slotId }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function hrPublicCancelBooking(token) {
  const res = await fetch(apiUrl(`/api/public/schedule/${encodeURIComponent(token)}/booking`), {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function hrPublicEvaluation(token) {
  const res = await fetch(apiUrl(`/api/public/evaluation/${encodeURIComponent(token)}`))
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function hrPublicEvaluationSubmit(token, payload) {
  const res = await fetch(apiUrl(`/api/public/evaluation/${encodeURIComponent(token)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function hrAdminUsers() {
  return hrJson('/api/hr/admin/users')
}

export async function hrAdminPatchUser(userId, payload) {
  return hrJson(`/api/hr/admin/users/${userId}`, { method: 'PATCH', body: payload })
}

/** 이메일로 관리자 권한 부여·해지 payload: { email, is_admin: true|false } */
export async function hrAdminPatchUserByEmail(payload) {
  return hrJson('/api/hr/admin/users/by-email', { method: 'PATCH', body: payload })
}

export async function hrAdminNotificationSummary() {
  return hrJson('/api/hr/admin/notifications/summary')
}

export async function hrAdminRecentFailures(limit = 30) {
  const res = await fetch(apiUrl(`/api/hr/admin/notifications/recent-failures?limit=${limit}`), {
    headers: { ...hrAuthHeaders() },
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function hrAdminRetryNotification(id) {
  return hrJson(`/api/hr/admin/notifications/${id}/retry`, { method: 'POST' })
}

export async function hrCandidateQuestions(body) {
  return hrJson('/api/hr/interviews/candidate-questions', { method: 'POST', body })
}

export async function hrSendRejections(body) {
  return hrJson('/api/hr/rejections/send', { method: 'POST', body })
}
