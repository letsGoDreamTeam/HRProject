import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  hrJobRolesBulkReplace,
  hrJobRolesDelete,
  hrJobRolesFromPdf,
  hrJobRolesList,
  hrJobRolesPatchHeadcount,
  hrJobRolesRagSearch,
} from '../api/client'

function emptyDraftRow() {
  return { department: '', job_title: '', role_grade: '', headcount_to: 0, body_text: '' }
}

export function HrJobRolesPage() {
  const pdfRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [parseBusy, setParseBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saved, setSaved] = useState([])
  const [draftJobs, setDraftJobs] = useState([])
  const [sourceDocName, setSourceDocName] = useState('')
  const [parseMeta, setParseMeta] = useState({ warnings: [], chunk_count: 0, ocr_used: false })
  const [ragQuery, setRagQuery] = useState('')
  const [ragBusy, setRagBusy] = useState(false)
  const [ragHits, setRagHits] = useState([])

  const refreshSaved = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const rows = await hrJobRolesList()
      setSaved(Array.isArray(rows) ? rows : [])
    } catch (e) {
      setError(e?.message || '목록 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshSaved()
  }, [refreshSaved])

  const parsePdf = async () => {
    const f = pdfRef.current?.files?.[0]
    if (!f) {
      setError('PDF를 선택하세요.')
      return
    }
    setParseBusy(true)
    setError(null)
    setParseMeta({ warnings: [], chunk_count: 0, ocr_used: false })
    try {
      const d = await hrJobRolesFromPdf(f)
      const jobs = Array.isArray(d.jobs) ? d.jobs : []
      setDraftJobs(
        jobs.length
          ? jobs.map((j) => ({
              department: j.department || '',
              job_title: j.job_title || '',
              role_grade: j.role_grade || '',
              headcount_to: Number.isFinite(Number(j.headcount_to)) ? Number(j.headcount_to) : 0,
              body_text: j.body_text || '',
            }))
          : [emptyDraftRow()],
      )
      setSourceDocName(f.name || '')
      setParseMeta({
        warnings: Array.isArray(d.warnings) ? d.warnings : [],
        chunk_count: d.chunk_count ?? 0,
        ocr_used: Boolean(d.ocr_used),
      })
    } catch (e) {
      setError(e?.message || 'PDF 분석 실패')
    } finally {
      setParseBusy(false)
    }
  }

  const saveDraft = async (e) => {
    e.preventDefault()
    setSaveBusy(true)
    setError(null)
    try {
      const jobs = draftJobs
        .filter((r) => (r.job_title || '').trim())
        .map((r) => ({
          department: (r.department || '').trim(),
          job_title: (r.job_title || '').trim(),
          role_grade: (r.role_grade || '').trim(),
          headcount_to: Math.max(0, Math.min(9999, parseInt(String(r.headcount_to), 10) || 0)),
          body_text: (r.body_text || '').trim(),
        }))
      await hrJobRolesBulkReplace({
        source_document_name: sourceDocName || '직무소개서.pdf',
        jobs,
      })
      setDraftJobs([])
      setSourceDocName('')
      setParseMeta({ warnings: [], chunk_count: 0, ocr_used: false })
      await refreshSaved()
    } catch (err) {
      setError(err?.message || '저장 실패')
    } finally {
      setSaveBusy(false)
    }
  }

  const removeSaved = async (id) => {
    if (!window.confirm('이 직무 행을 삭제할까요? RAG 인덱스도 갱신됩니다.')) return
    setError(null)
    try {
      await hrJobRolesDelete(id)
      await refreshSaved()
    } catch (e) {
      setError(e?.message || '삭제 실패')
    }
  }

  const runRag = async () => {
    const q = (ragQuery || '').trim()
    if (!q) return
    setRagBusy(true)
    setError(null)
    try {
      const d = await hrJobRolesRagSearch(q, 10)
      setRagHits(Array.isArray(d.hits) ? d.hits : [])
    } catch (e) {
      setError(e?.message || '검색 실패')
    } finally {
      setRagBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">통합 직무소개서 → 부서·직무별</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            LangChain으로 전체 텍스트를 청크로 나누고, LangGraph로 청크별 직무 추출을{' '}
            <strong>병렬</strong> 처리한 뒤 병합합니다. PDF 용량·페이지 수 상한은 서버 설정(기본 대용량·전 페이지 OCR)을
            따릅니다. 저장 후 RAG 검색이 가능합니다.
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

      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1) PDF 파싱</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block min-w-[14rem] flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            통합 직무소개서 PDF
            <input
              ref={pdfRef}
              type="file"
              accept=".pdf,application/pdf"
              className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-white hover:file:bg-violet-700 dark:text-slate-400"
            />
          </label>
          <button
            type="button"
            disabled={parseBusy}
            onClick={() => void parsePdf()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {parseBusy ? '분석 중…' : '추출 (미리보기)'}
          </button>
        </div>
        {(parseMeta.warnings.length > 0 || parseMeta.chunk_count > 0) && (
          <div className="mt-3 text-xs text-slate-600 dark:text-slate-400">
            {parseMeta.ocr_used && <p>OCR 사용됨</p>}
            {parseMeta.chunk_count > 0 && <p>처리한 청크 수: {parseMeta.chunk_count}</p>}
            {parseMeta.warnings.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-amber-800 dark:text-amber-200">
                {parseMeta.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {draftJobs.length > 0 && (
        <form onSubmit={saveDraft} className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-6 dark:border-violet-900/40 dark:bg-violet-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2) 추출 결과 검토 후 저장</h2>
            <button
              type="button"
              onClick={() => setDraftJobs((rows) => [...rows, emptyDraftRow()])}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-800 dark:border-slate-600 dark:text-slate-200"
            >
              행 추가
            </button>
          </div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            출처 파일명 (기록용)
            <input
              value={sourceDocName}
              onChange={(e) => setSourceDocName(e.target.value)}
              className="mt-1 w-full max-w-xl rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            저장하면 기존에 저장된 직무 목록은 <strong>전부 교체</strong>되고 RAG가 다시 인덱싱됩니다.
          </p>
          <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
            {draftJobs.map((row, idx) => (
              <div
                key={idx}
                className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/60"
              >
                <div className="grid gap-2 sm:grid-cols-4">
                  <input
                    placeholder="부서"
                    value={row.department}
                    onChange={(e) => {
                      const v = e.target.value
                      setDraftJobs((arr) => arr.map((x, i) => (i === idx ? { ...x, department: v } : x)))
                    }}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <input
                    placeholder="직무명 *"
                    value={row.job_title}
                    onChange={(e) => {
                      const v = e.target.value
                      setDraftJobs((arr) => arr.map((x, i) => (i === idx ? { ...x, job_title: v } : x)))
                    }}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <input
                    placeholder="직급·계급"
                    value={row.role_grade}
                    onChange={(e) => {
                      const v = e.target.value
                      setDraftJobs((arr) => arr.map((x, i) => (i === idx ? { ...x, role_grade: v } : x)))
                    }}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <label className="flex flex-col text-xs text-slate-600 dark:text-slate-400">
                    TO(명)
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      value={row.headcount_to ?? 0}
                      onChange={(e) => {
                        const v = e.target.value
                        setDraftJobs((arr) =>
                          arr.map((x, i) => (i === idx ? { ...x, headcount_to: parseInt(v, 10) || 0 } : x)),
                        )
                      }}
                      className="mt-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                </div>
                <textarea
                  placeholder="직무 설명 본문"
                  rows={4}
                  value={row.body_text}
                  onChange={(e) => {
                    const v = e.target.value
                    setDraftJobs((arr) => arr.map((x, i) => (i === idx ? { ...x, body_text: v } : x)))
                  }}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setDraftJobs((arr) => arr.filter((_, i) => i !== idx))}
                  className="justify-self-start text-xs text-red-700 hover:underline dark:text-red-300"
                >
                  이 행 제거
                </button>
              </div>
            ))}
          </div>
          <button
            type="submit"
            disabled={saveBusy}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {saveBusy ? '저장 중…' : 'DB에 반영 (전체 교체 + RAG 재인덱스)'}
          </button>
        </form>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3) RAG 검색 (저장된 직무)</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={ragQuery}
            onChange={(e) => setRagQuery(e.target.value)}
            placeholder="예: 데이터 분석, 행정, 고객 응대"
            className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="button"
            disabled={ragBusy}
            onClick={() => void runRag()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {ragBusy ? '검색…' : '검색'}
          </button>
        </div>
        {ragHits.length > 0 && (
          <ul className="mt-4 space-y-3 text-sm">
            {ragHits.map((h, idx) => (
              <li key={`${h.job_id}-${idx}`} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                <p className="font-medium text-slate-900 dark:text-white">
                  {h.department ? `${h.department} · ` : ''}
                  {h.job_title}
                  {h.role_grade ? ` (${h.role_grade})` : ''}
                  <span className="ml-2 text-xs font-normal text-slate-500">유사도 {(h.score * 100).toFixed(1)}%</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-400">{h.snippet}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">저장된 직무 ({saved.length}건)</h2>
        {loading ? (
          <p className="mt-2 text-sm text-slate-500">불러오는 중…</p>
        ) : saved.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">아직 없습니다. 위에서 PDF를 파싱해 저장하세요.</p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm">
            {saved.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-100 p-4 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {r.department ? `${r.department} · ` : ''}
                      {r.job_title}
                      {r.role_grade ? ` · ${r.role_grade}` : ''}
                    </p>
                    <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      TO(정원) 명
                      <input
                        type="number"
                        min={0}
                        max={9999}
                        defaultValue={r.headcount_to ?? 0}
                        key={`${r.id}-hc`}
                        onBlur={async (e) => {
                          const n = Math.max(0, Math.min(9999, parseInt(e.target.value, 10) || 0))
                          e.target.value = String(n)
                          try {
                            await hrJobRolesPatchHeadcount(r.id, n)
                            await refreshSaved()
                          } catch (err) {
                            setError(err?.message || 'TO 저장 실패')
                          }
                        }}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                    {r.source_document_name && (
                      <p className="text-xs text-slate-500">출처: {r.source_document_name}</p>
                    )}
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-400">
                      {r.body_text}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeSaved(r.id)}
                    className="shrink-0 text-xs text-red-700 hover:underline dark:text-red-300"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
