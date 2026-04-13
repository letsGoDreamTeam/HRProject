import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { apassParseRecord } from '../api/client'

const STORAGE_KEY = 'apass_record'

export function ApassRecordPage() {
  const [file, setFile] = useState(null)
  const [paste, setPaste] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [sections, setSections] = useState(null)
  const [preview, setPreview] = useState('')

  const run = useCallback(async () => {
    setErr(null)
    setLoading(true)
    setSections(null)
    try {
      const data = await apassParseRecord({ file, fullText: paste.trim() || undefined })
      setSections(data.sections)
      setPreview((data.full_text || '').slice(0, 4000))
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch {
        /* ignore quota */
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '파싱 실패')
    } finally {
      setLoading(false)
    }
  }, [file, paste])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">생기부·포트폴리오 파싱</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            PDF 업로드 또는 아래에 텍스트를 붙여 넣은 뒤 파싱합니다. 결과는 브라우저에 잠시 저장되어 Fit 분석 화면에서 불러옵니다.
          </p>
        </div>
        <Link to="/apass" className="text-sm text-violet-600 hover:underline dark:text-violet-300">
          ← A-PASS 홈
        </Link>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">PDF 파일</label>
        <input
          type="file"
          accept=".pdf,.txt"
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-violet-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-violet-500 dark:text-slate-400"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-slate-500">PDF가 아니면 UTF-8 텍스트로 간주합니다.</p>
        <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">또는 원문 붙여넣기</label>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={8}
          placeholder="NEIS에서 복사한 생기부 일부 또는 포트폴리오 본문…"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
        />
        <button
          type="button"
          disabled={loading || (!file && !paste.trim())}
          onClick={() => void run()}
          className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '파싱 중…' : '파싱 실행'}
        </button>
        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      </div>

      {sections && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">추출 블록</h2>
          {[
            ['세특·교과', sections.seuteuk],
            ['동아리·창체', sections.club],
            ['독서', sections.reading],
            ['기타', sections.other],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                {title}
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-4 text-xs text-slate-700 dark:text-slate-300">
                {text || '(비어 있음)'}
              </pre>
            </div>
          ))}
          <p className="text-sm text-slate-600 dark:text-slate-400">
            원문 앞부분 미리보기 ({preview.length}자 표시)
          </p>
          <pre className="max-h-48 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-950">
            {preview}
          </pre>
          <Link
            to="/apass/fit"
            className="inline-flex rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500"
          >
            Fit 분석으로 이동 →
          </Link>
        </div>
      )}
    </div>
  )
}
