import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useHrAuth } from '../context/HrAuthContext'
import {
  hrAdminDeleteUser,
  hrAdminPatchUser,
  hrAdminUsers,
  hrRegister,
} from '../api/client'

const ROLE_CONFIG = {
  admin: { label: 'SUPER ADMIN', bg: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500' },
  normal: { label: 'MEMBER', bg: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
}

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-cyan-500', 'bg-emerald-500',
  'bg-rose-500', 'bg-amber-500', 'bg-sky-500',
]

const FILTER_TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'ADMIN', label: 'Super Admin' },
  { key: 'MEMBER', label: 'Member' },
]

function formatDate(iso) {
  if (!iso) return '기록 없음'
  try {
    return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export function HrAdminPage() {
  const { user: me, loading: authLoading } = useHrAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [busyId, setBusyId] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)
  const [toastType, setToastType] = useState('ok')
  const [showRegModal, setShowRegModal] = useState(false)
  const [regForm, setRegForm] = useState({ email: '', password: '', full_name: '' })
  const [regBusy, setRegBusy] = useState(false)
  const [regError, setRegError] = useState(null)

  const showToast = (msg, type = 'ok') => {
    setToastMsg(msg)
    setToastType(type)
    setTimeout(() => setToastMsg(null), 3000)
  }

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const data = await hrAdminUsers()
      setUsers(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e?.message || '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!me?.is_admin) return
    void load()
  }, [authLoading, load, me?.is_admin])

  if (authLoading) return (
    <div className="flex h-64 items-center justify-center text-sm text-slate-400">불러오는 중…</div>
  )
  if (!me?.is_admin) return <Navigate to="/hr" replace />

  const canManage = me?.can_manage_admin_roles !== false

  const filtered = users.filter((u) => {
    const roleKey = u.is_admin ? 'ADMIN' : 'MEMBER'
    const matchRole = filter === 'ALL' || filter === roleKey
    const matchSearch =
      !search ||
      (u.full_name || '').includes(search) ||
      u.email.includes(search)
    return matchRole && matchSearch
  })

  const setAdmin = async (userId, isAdmin) => {
    if (!canManage) return
    setBusyId(userId)
    try {
      await hrAdminPatchUser(userId, { is_admin: isAdmin })
      showToast(isAdmin ? '관리자 권한을 부여했습니다.' : '관리자 권한을 해제했습니다.')
      await load()
    } catch (e) {
      showToast(e?.message || '변경 실패', 'err')
    } finally {
      setBusyId(null)
    }
  }

  const deleteUser = async (userId, email) => {
    if (!canManage) return
    if (!window.confirm(`${email} 계정을 삭제할까요?\n\n이 작업은 되돌릴 수 없습니다.`)) return
    setBusyId(userId)
    try {
      await hrAdminDeleteUser(userId)
      showToast(`${email} 계정을 삭제했습니다.`)
      await load()
    } catch (e) {
      showToast(e?.message || '삭제 실패', 'err')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMsg && (
        <div
          className={`fixed right-6 top-6 z-50 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${
            toastType === 'err' ? 'bg-red-600' : 'bg-slate-900'
          }`}
        >
          {toastType === 'err' ? '✕' : '✓'} {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <span className="inline-block rounded-full border border-violet-200 bg-violet-50 px-3 py-0.5 text-[11px] font-semibold tracking-widest text-violet-600">
            ACCESS CONTROL
          </span>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white text-sm">
              🛡
            </span>
            계정 및 권한 관리
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            사내 인사 담당자 및 면접관의 시스템 접근 권한을 안전하게 통제합니다.
          </p>
        </div>
        <button
          onClick={() => { setRegForm({ email: '', password: '', full_name: '' }); setRegError(null); setShowRegModal(true) }}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-slate-800"
        >
          <span>👤+</span> 계정 등록
        </button>
      </div>

      {/* Restrictions notice */}
      {!canManage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          이 서버는 <code className="rounded bg-amber-100 px-1 text-xs">HR_SUPER_ADMIN_EMAILS</code> 설정으로
          최고 관리자만 권한을 변경할 수 있습니다.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="이름, 이메일 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-800 shadow-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? '로딩 중…' : '새로고침'}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-400">
            불러오는 중…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  사용자 정보
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  권한
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  가입일
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  관리
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((u, i) => {
                const isSelf = me?.id === u.id
                const roleKey = u.is_admin ? 'admin' : 'normal'
                const role = ROLE_CONFIG[roleKey]
                const avatarBg = AVATAR_COLORS[i % AVATAR_COLORS.length]
                const initial = (u.full_name || u.email).charAt(0).toUpperCase()
                const adminCount = users.filter((x) => x.is_admin).length
                const canRevoke = canManage && u.is_admin && adminCount > 1 && !isSelf
                const canGrant = canManage && !u.is_admin
                const canDel = canManage && !isSelf && (!u.is_admin || adminCount > 1)

                return (
                  <tr key={u.id} className="group hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${avatarBg} text-sm font-bold text-white`}
                        >
                          {initial}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                            {u.full_name || '(이름 없음)'}
                            {isSelf && (
                              <span className="rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500">
                                나
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${role.bg}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${role.dot}`} />
                        {role.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-500">{formatDate(u.created_at)}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canGrant && (
                          <button
                            disabled={busyId === u.id}
                            onClick={() => void setAdmin(u.id, true)}
                            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            관리자 부여
                          </button>
                        )}
                        {canRevoke && (
                          <button
                            disabled={busyId === u.id}
                            onClick={() => {
                              if (!window.confirm(`${u.email} 관리자 권한을 해제할까요?`)) return
                              void setAdmin(u.id, false)
                            }}
                            className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                          >
                            권한 해제
                          </button>
                        )}
                        {canDel && (
                          <button
                            disabled={busyId === u.id}
                            onClick={() => void deleteUser(u.id, u.email)}
                            className="rounded-lg border border-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-slate-400">
                    {error ? '데이터를 불러올 수 없습니다.' : '검색 결과가 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 계정 등록 모달 */}
      {showRegModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">새 계정 등록</h2>
            <p className="mt-1 text-sm text-slate-500">신규 HR 담당자 계정을 직접 생성합니다.</p>
            {regError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {regError}
              </div>
            )}
            <div className="mt-5 space-y-4">
              {[
                { key: 'full_name', label: '이름', placeholder: '홍길동', type: 'text' },
                { key: 'email', label: '이메일', placeholder: 'user@company.com', type: 'email' },
                { key: 'password', label: '비밀번호 (8자 이상)', placeholder: '••••••••', type: 'password' },
              ].map(({ key, label, placeholder, type }) => (
                <div key={key}>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</label>
                  <input
                    type={type}
                    value={regForm[key]}
                    onChange={(e) => setRegForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowRegModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                disabled={regBusy}
                onClick={async () => {
                  setRegError(null)
                  if (!regForm.email || !regForm.password) {
                    setRegError('이메일과 비밀번호를 입력하세요.')
                    return
                  }
                  setRegBusy(true)
                  try {
                    await hrRegister(regForm.email, regForm.password, regForm.full_name)
                    showToast(`${regForm.email} 계정 등록 완료`)
                    setShowRegModal(false)
                    await load()
                  } catch (e) {
                    setRegError(e?.message || '등록 실패')
                  } finally {
                    setRegBusy(false)
                  }
                }}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {regBusy ? '등록 중…' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats footer */}
      {!loading && users.length > 0 && (
        <div className="flex gap-4 text-xs text-slate-400">
          <span>전체 {users.length}명</span>
          <span>관리자 {users.filter((u) => u.is_admin).length}명</span>
          <span>일반 {users.filter((u) => !u.is_admin).length}명</span>
        </div>
      )}
    </div>
  )
}
