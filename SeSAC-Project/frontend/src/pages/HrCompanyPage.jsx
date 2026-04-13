import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { hrGetCompanyProfile, hrParseCompanyProfilePdf, hrPutCompanyProfile } from '../api/client'

export function HrCompanyPage() {
  const pdfInputRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfHints, setPdfHints] = useState([])
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    company_name: '',
    jd_reference: '',
    job_description: '',
    org_notes: '',
  })

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const d = await hrGetCompanyProfile()
      setForm({
        company_name: d.company_name || '',
        jd_reference: d.jd_reference || '',
        job_description: d.job_description || '',
        org_notes: d.org_notes || '',
      })
    } catch (e) {
      setError(e?.message || '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await hrPutCompanyProfile(form)
      await load()
    } catch (err) {
      setError(err?.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const fillFromPdf = async () => {
    const input = pdfInputRef.current
    const file = input?.files?.[0]
    if (!file) {
      setError('PDF 파일을 선택하세요.')
      return
    }
    setPdfBusy(true)
    setError(null)
    setPdfHints([])
    try {
      const d = await hrParseCompanyProfilePdf(file)
      setForm({
        company_name: d.company_name || '',
        jd_reference: d.jd_reference || '',
        job_description: d.job_description || '',
        org_notes: d.org_notes || '',
      })
      const hints = []
      if (d.ocr_used) hints.push('스캔 PDF로 추정되어 OCR을 사용했습니다. 내용을 한 번 검토하세요.')
      if (Array.isArray(d.warnings) && d.warnings.length) hints.push(...d.warnings)
      setPdfHints(hints)
    } catch (err) {
      setError(err?.message || 'PDF 분석 실패')
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">회사·직무 프로필</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            면접 질문 생성 시 이 데이터를 최대한 반영합니다. 통합 PDF(공고+직무기술서+문화 소개 등)를 올리면 AI가 아래 네 칸으로 나누어 채웁니다. 반드시 검토 후 저장하세요.
          </p>
        </div>
        <Link to="/hr" className="text-sm text-violet-600 hover:underline dark:text-violet-400">
          ← HR 홈
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">불러오는 중…</p>
      ) : (
        <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </p>
          )}
          {pdfHints.length > 0 && (
            <ul className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
              {pdfHints.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4 dark:border-slate-600 dark:bg-slate-950/40">
            <label className="block min-w-[12rem] flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              PDF에서 자동 채우기
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-white hover:file:bg-violet-700 dark:text-slate-400"
              />
            </label>
            <button
              type="button"
              disabled={pdfBusy || saving}
              onClick={() => void fillFromPdf()}
              className="rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-medium text-violet-900 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-700 dark:bg-slate-900 dark:text-violet-100 dark:hover:bg-violet-950/50"
            >
              {pdfBusy ? '분석 중…' : '폼에 반영'}
            </button>
          </div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            회사명
            <input
              value={form.company_name}
              onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            채용 공고·JD 참고 텍스트
            <textarea
              rows={6}
              value={form.jd_reference}
              onChange={(e) => setForm((f) => ({ ...f, jd_reference: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            직무 기술서
            <textarea
              rows={8}
              value={form.job_description}
              onChange={(e) => setForm((f) => ({ ...f, job_description: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            조직 문화·기타 메모
            <textarea
              rows={4}
              value={form.org_notes}
              onChange={(e) => setForm((f) => ({ ...f, org_notes: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </form>
      )}
    </div>
  )
}
