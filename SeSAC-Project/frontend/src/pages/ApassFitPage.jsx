import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apassAnalyzeFit, apassIngestUniversity } from '../api/client'

const STORAGE_KEY = 'apass_record'

const emptySections = { seuteuk: '', club: '', reading: '', other: '' }

export function ApassFitPage() {
  const [sections, setSections] = useState(emptySections)
  const [uni, setUni] = useState('가칭대학교')
  const [dept, setDept] = useState('컴퓨터공학과')
  const [docText, setDocText] = useState(
    '본 학과는 수학적 사고력과 팀 협업을 중시한다. 창의적 문제 해결, 오픈소스 협업 경험, 윤리 의식을 갖춘 인재를 선호한다.',
  )
  const [ingestMsg, setIngestMsg] = useState(null)
  const [fitResult, setFitResult] = useState(null)
  const [loadingIngest, setLoadingIngest] = useState(false)
  const [loadingFit, setLoadingFit] = useState(false)
  const [err, setErr] = useState(null)
  const [locale, setLocale] = useState('ko')

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw)
      if (data?.sections) setSections(data.sections)
    } catch {
      /* ignore */
    }
  }, [])

  const ingest = useCallback(async () => {
    setErr(null)
    setIngestMsg(null)
    setLoadingIngest(true)
    try {
      const r = await apassIngestUniversity({
        university_name: uni,
        department: dept,
        document_text: docText,
      })
      setIngestMsg(`적재 완료: 컬렉션 ${r.collection_key}, 청크 ${r.chunks_indexed}개`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '적재 실패')
    } finally {
      setLoadingIngest(false)
    }
  }, [uni, dept, docText])

  const runFit = useCallback(async () => {
    setErr(null)
    setFitResult(null)
    setLoadingFit(true)
    try {
      const r = await apassAnalyzeFit({
        target_university: uni,
        target_department: dept,
        sections,
        locale,
      })
      setFitResult(r)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '분석 실패')
    } finally {
      setLoadingFit(false)
    }
  }, [uni, dept, sections, locale])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">인재상 적재 & Fit 분석</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            동일한 대학·학과 키로 인재상 텍스트를 임베딩한 뒤, 아래 블록과 RAG 비교로 Fit-Score를 산출합니다.
          </p>
        </div>
        <Link to="/apass" className="text-sm text-violet-600 hover:underline dark:text-violet-300">
          ← A-PASS 홈
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="font-semibold text-slate-900 dark:text-white">1) 인재상·요강 텍스트 적재</h2>
          <input
            value={uni}
            onChange={(e) => setUni(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            placeholder="대학명"
          />
          <input
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            placeholder="학과명"
          />
          <textarea
            value={docText}
            onChange={(e) => setDocText(e.target.value)}
            rows={10}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          />
          <button
            type="button"
            disabled={loadingIngest}
            onClick={() => void ingest()}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-700"
          >
            {loadingIngest ? '임베딩 중…' : '인재상 적재'}
          </button>
          {ingestMsg && <p className="text-sm text-emerald-700 dark:text-emerald-400">{ingestMsg}</p>}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="font-semibold text-slate-900 dark:text-white">2) 학생 블록 (파싱 결과 편집 가능)</h2>
          {['seuteuk', 'club', 'reading', 'other'].map((k) => (
            <label key={k} className="block text-xs font-medium uppercase text-slate-500">
              {k}
              <textarea
                value={sections[k]}
                onChange={(e) => setSections((s) => ({ ...s, [k]: e.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
              />
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-slate-600 dark:text-slate-400">
              출력 언어{' '}
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="ml-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
              >
                <option value="ko">한국어</option>
                <option value="en">English</option>
              </select>
            </label>
            <button
              type="button"
              disabled={loadingFit}
              onClick={() => void runFit()}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {loadingFit ? '분석 중…' : 'Fit 분석 실행'}
            </button>
          </div>
        </div>
      </div>

      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}

      {fitResult && (
        <div className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/50 p-6 dark:border-violet-900/40 dark:bg-violet-950/20">
          <div className="flex flex-wrap items-baseline gap-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Fit 결과</h2>
            <span className="text-3xl font-bold text-violet-600 dark:text-violet-300">{fitResult.fit_score}</span>
            <span className="text-sm text-slate-600 dark:text-slate-400">/ 100</span>
          </div>
          <p className="leading-relaxed text-slate-800 dark:text-slate-200">{fitResult.coaching_comment}</p>
          <ul className="space-y-3">
            {fitResult.competency_mapping.map((c, i) => (
              <li key={i} className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
                <span className="font-medium text-violet-700 dark:text-violet-300">{c.domain}</span>
                <p className="mt-1 text-slate-700 dark:text-slate-300">{c.summary}</p>
                <p className="mt-1 text-xs text-slate-500">근거: {c.evidence_quote}</p>
              </li>
            ))}
          </ul>
          {fitResult.rag_snippets_used?.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">RAG 발췌</h3>
              <ul className="mt-2 list-inside list-disc text-xs text-slate-600 dark:text-slate-400">
                {fitResult.rag_snippets_used.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
