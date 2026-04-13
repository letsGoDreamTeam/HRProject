import { Link } from 'react-router-dom'

const cards = [
  { to: '/apass/record', title: '생기부·포트폴리오 파싱', desc: 'PDF/텍스트에서 세특·동아리·독서 블록 추출' },
  { to: '/apass/fit', title: '인재상 적재 & Fit 분석', desc: '대학 인재상 RAG + 전공 적합도·첨삭 코멘트' },
  { to: '/apass/interview', title: 'AI 모의면접', desc: 'LangGraph 단계별(아이스브레이킹→서류→전공→인성)' },
  { to: '/apass/dashboard/student', title: '수험생 대시보드', desc: '글자수·역량 키워드·Fit 점수 추이' },
  { to: '/apass/dashboard/institution', title: '입학처·교사 대시보드', desc: '적합도 구간별 칸반·리포트 힌트' },
]

export function ApassHomePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">A-PASS</h1>
        <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">
          생기부·포트폴리오 분석, 인재상 RAG, Fit-Score, LangGraph 기반 모의면접, B2C/B2B 대시보드에 연결된 화면입니다.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.to}>
            <Link
              to={c.to}
              className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-violet-400 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-violet-500/50"
            >
              <h2 className="font-semibold text-slate-900 dark:text-white">{c.title}</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{c.desc}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
