import { Link } from 'react-router-dom'
import { useHrAuth } from '../context/HrAuthContext'

const cards = [
  {
    to: '/hr/calendar',
    title: '📅 일정 관리 (캘린더)',
    desc: '월간 캘린더에서 면접 슬롯을 보고, 일정 추가·응답·예약 현황·평가표로 바로 이동합니다.',
  },
  {
    to: '/hr/schedule-integrated',
    title: '📊 일정 통합 관리 (표)',
    desc: '면접명·지원자 검색, 슬롯별 배정·응답 상태를 표로 보고 엑셀처럼 빠르게 작업합니다.',
  },
  { to: '/hr/company', title: '회사·직무 데이터', desc: '면접 질문 품질을 위해 회사 JD·직무기술서를 저장합니다.' },
  {
    to: '/hr/job-roles',
    title: '통합 직무소개서 (다직무)',
    desc: 'PDF 한 권에 직무가 많을 때 부서·직무별로 나누고 RAG 검색까지.',
  },
  {
    to: '/hr/pipeline',
    title: '🎯 채용 현황 & 파이프라인',
    desc: '부서·직무별 채용 단계 현황 대시보드. 각 배치의 단계별 인원과 진행 상황을 한눈에 확인하고, 드래그 앤 드롭으로 세부 관리.',
  },
  {
    to: '/hr/recruitment-process',
    title: '⚙️ 채용 절차 설정',
    desc: '부서·직무별 면접 라운드를 자유롭게 정의 (1차~10차). 파이프라인 칸반 컬럼에 자동 반영.',
  },
  {
    to: '/hr/applications',
    title: '이력서 정리 · 지원서 분류',
    desc: '업로드 → AI·표준화 → 이름/생년월일 중복 점검 → 칸반·PDF·결과 메일.',
  },
  {
    to: '/hr/recruitment-summary',
    title: '채용 현황 요약 (경영용)',
    desc: '퍼널·총 지원자·직무별 TO 대비·병목·이번 주 액션을 한 화면에.',
  },
  {
    to: '/hr/schedules',
    title: '면접 일정 조율',
    desc: '슬롯·지원자·면접관, 지원자 링크·응답 현황. 일정별로 면접관 평가표·제출·집계·미제출 알림.',
  },
  {
    to: '/hr/video-interview-test',
    title: '🎥 화상면접 회의실',
    desc: '우리 사이트 화면 안에서 바로 화상면접 회의실을 열고 진행합니다.',
  },
  { to: '/hr/interviews', title: '지원자 맞춤 면접 질문', desc: '부서·자소서·포폴 기반 AI 질문 생성.' },
  { to: '/hr/rejections', title: '불합격 통보', desc: '메일·SMS(설정 시) 일괄 예약 발송.' },
]

export function HrHubPage() {
  const { user } = useHrAuth()
  const canManageRoles = user?.is_admin && user?.can_manage_admin_roles !== false

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
              to="/admin/accounts"
              className="block h-full rounded-2xl border border-amber-200 bg-amber-50/80 p-5 transition-colors hover:border-amber-400 dark:border-amber-900/50 dark:bg-amber-950/30 dark:hover:border-amber-600"
            >
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">🛡 계정 및 권한 관리</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-amber-100/90">
                사용자 초대·권한 편집·삭제. 사이드바 메뉴가 있는 <strong>Admin 패널</strong>로 이동합니다.
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

      <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-900/40">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">관리자 권한</h2>
        {canManageRoles ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            다른 계정에 HR 관리자 권한을 주거나 뺄 수 있습니다.{' '}
            <Link to="/admin/accounts" className="font-medium text-violet-600 underline dark:text-violet-400">
              관리자 콘솔 → 이메일로 부여·해지 또는 사용자 목록
            </Link>
            에서 처리하세요.
          </p>
        ) : user?.is_admin ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            이 서버는 <code className="rounded bg-slate-200 px-1 text-xs dark:bg-slate-800">HR_SUPER_ADMIN_EMAILS</code>로
            최고 관리자만 권한을 바꿀 수 있게 되어 있습니다. 권한 변경이 필요하면 해당 담당자에게 요청하세요. (알림
            요약·재시도 등 나머지 관리자 메뉴는 그대로 이용할 수 있습니다.)
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            HR 관리자 메뉴가 필요하면 이미 관리자인 동료에게{' '}
            <strong className="text-slate-800 dark:text-slate-200">관리자 콘솔</strong>에서 권한 부여를 요청하세요.
          </p>
        )}
      </section>
    </div>
  )
}
