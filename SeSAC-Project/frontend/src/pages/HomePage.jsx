import { useCallback, useRef, useState } from 'react'
import { analyzeAndSave, analyzeJd, extractJdFromPdf } from '../api/client'
import { PdfJsViewer } from '../components/PdfJsViewer'

function ResultView({ data }) {
  const json = JSON.stringify(data, null, 2)
  const copy = () => void navigator.clipboard.writeText(json)

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">분석 결과</h2>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:border-violet-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-violet-500/50 dark:hover:bg-slate-800"
        >
          JSON 복사
        </button>
      </div>
      {Array.isArray(data.warnings) && data.warnings.length > 0 && (
        <ul className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          {data.warnings.map((w, wi) => (
            <li key={wi} className="list-inside list-disc leading-relaxed">
              {w}
            </li>
          ))}
        </ul>
      )}
      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
        {data.analysis_summary}
      </p>
      <ul className="space-y-4">
        {data.items.map((item, i) => (
          <li
            key={`${item.competency}-${i}`}
            className="rounded-xl border border-slate-200 bg-white p-5 text-left dark:border-slate-800 dark:bg-slate-900/40"
          >
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-violet-600 dark:text-violet-400">
                역량 {i + 1}
              </span>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{item.competency}</h3>
            </div>
            <blockquote className="mb-4 border-l-2 border-violet-400 pl-3 text-sm italic text-slate-600 dark:border-violet-500/60 dark:text-slate-400">
              {item.evidence}
            </blockquote>
            <ol className="list-inside list-decimal space-y-2 text-sm text-slate-800 dark:text-slate-200">
              {item.questions.map((q, qi) => (
                <li key={qi} className="leading-relaxed">
                  {q}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function HomePage() {
  const [pdfFile, setPdfFile] = useState(null)
  const [jd, setJd] = useState('')
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [saveMsg, setSaveMsg] = useState(null)
  const [saveToHistory, setSaveToHistory] = useState(false)
  const [lastExtractOcr, setLastExtractOcr] = useState(false)
  const pdfInputRef = useRef(null)

  const runAnalyze = useCallback(async () => {
    setError(null)
    setSaveMsg(null)
    setLoading(true)
    setResult(null)
    try {
      if (saveToHistory) {
        const { analysis, saved_id } = await analyzeAndSave(jd)
        setResult(analysis)
        if (saved_id) setSaveMsg(`기록에 저장됨 (ID: ${saved_id})`)
        else setSaveMsg('분석은 완료되었으나 저장 ID가 없습니다.')
      } else {
        const data = await analyzeJd(jd)
        setResult(data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      setLoading(false)
    }
  }, [jd, saveToHistory])

  const onPdfChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setSaveMsg(null)
    setResult(null)
    setJd('')
    setLastExtractOcr(false)
    setPdfFile(file)
    setPdfLoading(true)
    try {
      const { jd_text: text, ocr_used: ocrUsed } = await extractJdFromPdf(file)
      setJd(text)
      setLastExtractOcr(Boolean(ocrUsed))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF 처리 실패')
    } finally {
      setPdfLoading(false)
    }
  }

  const busy = loading || pdfLoading
  const canAnalyze = jd.trim().length >= 50

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
        채용 공고 분석
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base dark:text-slate-400">
        <strong className="font-medium text-slate-800 dark:text-slate-200">PDF 공고</strong>를 선택하면{' '}
        <a
          href="https://mozilla.github.io/pdf.js/"
          target="_blank"
          rel="noreferrer"
          className="text-violet-600 underline dark:text-violet-400"
        >
          PDF.js
        </a>
        로 미리보기하고, 서버에서 텍스트를 추출해 분석합니다. 직무·인성·협업 역량과 면접 질문 초안을 만듭니다.
      </p>
      <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-500">
        스캔 PDF는 서버에서 PyMuPDF로 페이지를 그린 뒤 OpenAI Vision으로 OCR합니다. 페이지 수가 많으면 시간·비용이
        늘 수 있으며, 설정으로 최대 페이지 수를 제한할 수 있습니다.
      </p>

      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">채용 공고 PDF</span>
          <div className="flex items-center gap-2">
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={onPdfChange}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => pdfInputRef.current?.click()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {pdfLoading ? '추출·OCR 중…' : 'PDF 선택'}
            </button>
          </div>
        </div>

        <PdfJsViewer
          key={pdfFile ? `${pdfFile.name}-${pdfFile.size}-${pdfFile.lastModified}` : 'no-pdf'}
          file={pdfFile}
        />

        {pdfFile && !pdfLoading && lastExtractOcr && !error && (
          <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100">
            이 PDF는 텍스트 레이어가 부족해 <strong>OpenAI Vision OCR</strong>로 본문을 읽었습니다. 인식 오류가 있을 수
            있으니 필요하면 PDF를 다시 확인해 주세요.
          </p>
        )}

        {pdfFile && !pdfLoading && !canAnalyze && !error && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            추출된 텍스트가 너무 짧습니다(최소 약 50자). 스캔 PDF이거나 공고 본문이 적을 수 있습니다.
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            disabled={busy || !canAnalyze}
            onClick={runAnalyze}
            className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? '분석 중…' : '분석하기'}
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={saveToHistory}
              onChange={(e) => setSaveToHistory(e.target.checked)}
              className="size-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900"
            />
            이 결과를 기록(히스토리)에 남기기
          </label>
        </div>
        {saveMsg && (
          <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{saveMsg}</p>
        )}
        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        )}
      </div>

      {result && <ResultView data={result} />}
    </div>
  )
}
