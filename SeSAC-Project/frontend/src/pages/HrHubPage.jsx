import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useHrAuth } from '../context/HrAuthContext'

const cards = [
  { to: '/hr/company', title: '회사·직무 데이터', desc: '면접 질문 품질을 위해 회사 JD·직무기술서를 저장합니다.' },
  {
    to: '/hr/job-roles',
    title: '통합 직무소개서 (다직무)',
    desc: 'PDF 한 권에 직무가 많을 때 부서·직무별로 나누고 RAG 검색까지.',
  },
  { to: '/hr/applications', title: '지원서 분류', desc: 'PDF 업로드 → 블라인드·우대 분류 → 엑셀보내기.' },
  {
    to: '/hr/schedules',
    title: '면접 일정 조율',
    desc: '슬롯·지원자·면접관, 지원자 링크·응답 현황. 일정별로 면접관 평가표·제출·집계·미제출 알림.',
  },
  { to: '/hr/interviews', title: '지원자 맞춤 면접 질문', desc: '부서·자소서·포폴 기반 AI 질문 생성.' },
  { to: '/hr/rejections', title: '불합격 통보', desc: '메일·SMS(설정 시) 일괄 예약 발송.' },
]

export function HrHubPage() {
  const navigate = useNavigate()
  const { user, deleteAccount } = useHrAuth()
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const submitDeleteAccount = async (e) => {
    e.preventDefault()
    setDeleteError(null)
    if (!deletePassword.trim()) {
      setDeleteError('비밀번호를 입력하세요.')
      return
    }
    if (
      !window.confirm(
        '정말 탈퇴할까요? 회사 프로필, 직무·일정, 지원서 분류 등 이 계정의 HR 데이터가 모두 삭제되며 되돌릴 수 없습니다.',
      )
    ) {
      return
    }
    setDeleteBusy(true)
    try {
      await deleteAccount(deletePassword)
      navigate('/hr/login', { replace: true })
    } catch (err) {
      setDeleteError(err?.message || '탈퇴 처리에 실패했습니다.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">채용 운영 (HR)</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {user?.email} · 관리자: {user?.is_admin ? '예' : '아니오'}
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {user?.is_admin && (
          <li>
            <Link
              to="/hr/admin"
              className="block h-full rounded-2xl border border-amber-200 bg-amber-50/80 p-5 transition-colors hover:border-amber-400 dark:border-amber-900/50 dark:bg-amber-950/30 dark:hover:border-amber-600"
            >
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">관리자 콘솔</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-amber-100/90">
                사용자·알림 전송 포기 건 재시도 등
              </p>
            </Link>
          </li>
        )}
        {cards.map((c) => (
          <li key={c.to}>
            <Link
              to={c.to}
              className="block h-full rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-violet-400 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-violet-500/50"
            >
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{c.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{c.desc}</p>
            </Link>
          </li>
        ))}
      </ul>

      <section className="rounded-2xl border border-red-200 bg-red-50/40 p-5 dark:border-red-900/40 dark:bg-red-950/20">
        <h2 className="text-base font-semibold text-red-900 dark:text-red-100">회원 탈퇴</h2>
        <p className="mt-1 text-sm text-red-800/90 dark:text-red-200/90">
          비밀번호를 확인한 뒤 계정과 연결된 HR 데이터를 삭제합니다. 유일한 관리자 계정은 다른 관리자를 지정하기 전에는
          탈퇴할 수 없습니다.
        </p>
        <form onSubmit={submitDeleteAccount} className="mt-4 flex max-w-md flex-col gap-3">
          {deleteError && (
            <p className="rounded border border-red-300 bg-white px-2 py-1.5 text-xs text-red-800 dark:border-red-800 dark:bg-slate-950 dark:text-red-200">
              {deleteError}
            </p>
          )}
          <label className="block text-sm font-medium text-red-900 dark:text-red-100">
            비밀번호 확인
            <input
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-slate-900 dark:border-red-900/50 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <button
            type="submit"
            disabled={deleteBusy}
            className="w-fit rounded-lg border border-red-400 bg-white px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-900/30"
          >
            {deleteBusy ? '처리 중…' : '회원 탈퇴'}
          </button>
        </form>
      </section>
    </div>
  )
}
