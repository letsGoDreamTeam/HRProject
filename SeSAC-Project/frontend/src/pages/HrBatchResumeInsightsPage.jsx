import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  hrBatchResumeInsights,
  hrDownloadApplicationItemPdf,
  hrDownloadBatchResumeInsightsExcel,
  hrGetApplicationItemPdfBlobUrl,
} from '../api/client'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function badgeToneBlind(tier) {
  const t = (tier || '').toLowerCase()
  if (t === 'a') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
  if (t === 'b') return 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
  if (t === 'c') return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
  if (t === 'd') return 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
  if (t === 'high') return 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
  if (t === 'low') return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
}

function blindGuideLabel(tier) {
  const t = (tier || '').toLowerCase()
  if (t === 'none' || t === 'a') return 'A'
  if (t === 'low' || t === 'b' || t === 'c') return 'B'
  if (t === 'high' || t === 'd') return 'C'
  return String(tier || 'A').toUpperCase()
}

function PdfJsPreview({ url }) {
  const [pageCount, setPageCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let task = null
    const canvas = document.getElementById('resume-pdf-canvas')
    const ctx = canvas?.getContext('2d')
    async function run() {
      if (!url || !canvas || !ctx) return
      setLoading(true)
      setError('')
      try {
        task = getDocument(url)
        const pdf = await task.promise
        if (cancelled) return
        setPageCount(pdf.numPages || 0)
        const safePage = Math.max(1, Math.min(page, pdf.numPages || 1))
        if (safePage !== page) setPage(safePage)
        const p = await pdf.getPage(safePage)
        if (cancelled) return
        const viewport = p.getViewport({ scale: 1.25 })
        canvas.width = viewport.width
        canvas.height = viewport.height
        await p.render({ canvasContext: ctx, viewport }).promise
      } catch (e) {
        if (!cancelled) setError(e?.message || 'PDF 렌더링 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
      if (task?.destroy) task.destroy()
    }
  }, [url, page])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs text-slate-600">
        <span>PDF.js 미리보기</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            disabled={loading || page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            이전
          </button>
          <span>{pageCount ? `${page}/${pageCount}` : '-'}</span>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            disabled={loading || !pageCount || page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            다음
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3">
        {loading ? <p className="text-sm text-slate-500">PDF 렌더링 중…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <canvas id="resume-pdf-canvas" className="mx-auto block rounded border border-slate-300 bg-white shadow-sm" />
      </div>
    </div>
  )
}

export function HrBatchResumeInsightsPage() {
  const { batchId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfErr, setPdfErr] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const load = useCallback(async () => {
    if (!batchId) return
    setError(null)
    try {
      const d = await hrBatchResumeInsights(batchId)
      setData(d)
    } catch (e) {
      setError(e?.message || '대시보드 로드 실패')
      setData(null)
    }
  }, [batchId])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(t)
  }, [load])

  const filtered = useMemo(() => {
    const rows = Array.isArray(data?.rows) ? data.rows : []
    if (!q.trim()) return rows
    const qq = q.trim().toLowerCase()
    return rows.filter((r) => {
      return (
        (r.candidate_name || '').toLowerCase().includes(qq) ||
        (r.filename || '').toLowerCase().includes(qq) ||
        (r.inferred_position || '').toLowerCase().includes(qq)
      )
    })
  }, [data, q])

  useEffect(() => {
    let alive = true
    let createdUrl = ''
    async function loadPdf() {
      if (!selected?.item_id) {
        setPdfUrl('')
        setPdfErr('')
        setPdfLoading(false)
        return
      }
      setPdfLoading(true)
      setPdfErr('')
      try {
        let url = ''
        try {
          // 원본 PDF(또는 원본→PDF 변환본)를 우선 사용하면 한글 깨짐이 훨씬 적다.
          url = await hrGetApplicationItemPdfBlobUrl(selected.item_id, 'source')
        } catch {
          url = await hrGetApplicationItemPdfBlobUrl(selected.item_id, 'text')
        }
        if (!alive) {
          URL.revokeObjectURL(url)
          return
        }
        createdUrl = url
        setPdfUrl(url)
      } catch (e) {
        if (!alive) return
        setPdfUrl('')
        setPdfErr(e?.message || 'PDF 로드 실패')
      } finally {
        if (alive) setPdfLoading(false)
      }
    }
    void loadPdf()
    return () => {
      alive = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [selected])

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500">AI Resume Intelligence</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">포지션 이력서 인사이트 대시보드</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            배치: <span className="font-semibold">{data?.batch_title || '—'}</span> · 이력서 {data?.total_count || 0}건
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/hr/recruitment-summary" className="hr-btn-ghost">
            ← 현황 대시보드
          </Link>
          <button
            type="button"
            onClick={async () => {
              if (!batchId) return
              try {
                await hrDownloadBatchResumeInsightsExcel(batchId)
              } catch (e) {
                setError(e?.message || '엑셀 추출 실패')
              }
            }}
            className="hr-btn-primary"
          >
            엑셀 추출
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            <div className="hr-panel p-4">
              <p className="text-xs text-slate-500">전체 이력서</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{data.total_count}</p>
            </div>
            <div className="hr-panel p-4">
              <p className="text-xs text-rose-600 dark:text-rose-300">중복 의심</p>
              <p className="mt-1 text-2xl font-bold text-rose-700 dark:text-rose-300">{data.duplicate_suspected_count}</p>
            </div>
            <div className="hr-panel p-4">
              <p className="text-xs text-amber-600 dark:text-amber-300">블라인드 위험(low/high)</p>
              <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">{data.blind_risk_count}</p>
            </div>
            <div className="hr-panel p-4">
              <p className="text-xs text-emerald-600 dark:text-emerald-300">우대충족</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{data.preferred_met_count}</p>
            </div>
          </section>

          <section className="hr-panel p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">지원자별 인사이트</h2>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="이름/파일/직무 검색"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
              <p className="font-semibold text-slate-700 dark:text-slate-200">판정 기준 안내</p>
              <p className="mt-1">- 블라인드 등급: A(문제 낮음) / B(주의) / C(위험 높음). 상세 사유는 각 행의 툴팁/요약에 표시됩니다.</p>
              <p className="mt-1">- 우대 `충족`: 가산 패턴 + 증거(행동동사/결과)가 기준을 만족한 경우입니다. 상세 근거는 각 행의 툴팁/사유에 표시됩니다.</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className="bg-slate-100/90 dark:bg-slate-800/80">
                  <tr>
                    <th className="px-3 py-2">지원자</th>
                    <th className="px-3 py-2">문서 파일</th>
                    <th className="px-3 py-2">AI 추정 지원직무</th>
                    <th className="px-3 py-2">블라인드</th>
                    <th className="px-3 py-2">우대</th>
                    <th className="px-3 py-2">판정 사유</th>
                    <th className="px-3 py-2">직무연관</th>
                    <th className="px-3 py-2">완성도</th>
                    <th className="px-3 py-2">누락필드</th>
                    <th className="px-3 py-2">중복의심</th>
                    <th className="px-3 py-2">플랫폼</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => (
                    <tr
                      key={r.item_id}
                      onClick={() => setSelected(r)}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-indigo-50 ${idx % 2 ? 'bg-slate-50/40' : ''}`}
                    >
                      <td className="px-3 py-2 font-medium">{r.candidate_name || '—'}</td>
                      <td className="max-w-[280px] truncate px-3 py-2" title={r.filename}>
                        {r.filename || '—'}
                      </td>
                      <td className="px-3 py-2">{r.inferred_position || '미추정'}</td>
                      <td className="px-3 py-2">
                        <span
                          title={r.blind_summary || '블라인드 위험 사유 없음'}
                          className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${badgeToneBlind(r.blind_tier)}`}
                        >
                          {blindGuideLabel(r.blind_tier)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {r.preferred_met ? (
                          <span
                            title={r.preferred_reason || '우대 충족 근거 없음'}
                            className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          >
                            충족
                          </span>
                        ) : (
                          <span
                            title={r.preferred_reason || '우대 미충족 사유 없음'}
                            className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          >
                            미충족
                          </span>
                        )}
                      </td>
                      <td className="max-w-[320px] truncate px-3 py-2" title={`블라인드: ${r.blind_summary || '-'} / 우대: ${r.preferred_reason || '-'}`}>
                        {(r.preferred_reason || r.blind_summary || '사유 없음').slice(0, 80)}
                      </td>
                      <td className="px-3 py-2 font-semibold text-indigo-600 dark:text-indigo-300">{(Number(r.role_relevance_score || 0) * 100).toFixed(0)}%</td>
                      <td className="px-3 py-2 font-semibold text-sky-600 dark:text-sky-300">{(Number(r.resume_completeness_score || 0) * 100).toFixed(0)}%</td>
                      <td className="max-w-[220px] px-3 py-2">
                        {(r.missing_fields || []).length ? (r.missing_fields || []).join(', ') : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {r.duplicate_suspected ? (
                          <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">의심</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">정상</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{r.source_platform || 'unknown'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">행을 클릭하면 PDF 원문과 AI 판정 근거를 한 화면에서 볼 수 있습니다.</p>
          </section>
        </>
      ) : (
        <p className="text-sm text-slate-500">불러오는 중…</p>
      )}

      {selected ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setSelected(null)}>
          <div
            className="flex h-[88vh] w-[min(1400px,96vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{selected.candidate_name || '지원자 상세'}</p>
                <p className="text-xs text-slate-500">{selected.filename || '파일명 없음'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  disabled={downloadingPdf}
                  onClick={async () => {
                    if (!selected?.item_id) return
                    setDownloadingPdf(true)
                    try {
                      await hrDownloadApplicationItemPdf(selected.item_id, 'source')
                    } catch (e) {
                      setPdfErr(e?.message || 'PDF 다운로드 실패')
                    } finally {
                      setDownloadingPdf(false)
                    }
                  }}
                >
                  {downloadingPdf ? '다운로드 중…' : '이력서 PDF 다운로드'}
                </button>
                <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50" onClick={() => setSelected(null)}>
                  닫기
                </button>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[1.5fr_1fr]">
              <section className="min-h-0 border-r border-slate-200">
                {pdfLoading ? <p className="p-4 text-sm text-slate-500">PDF 불러오는 중…</p> : null}
                {!pdfLoading && pdfErr ? <p className="p-4 text-sm text-red-600">{pdfErr}</p> : null}
                {!pdfLoading && !pdfErr && pdfUrl ? <PdfJsPreview url={pdfUrl} /> : null}
              </section>
              <section className="min-h-0 space-y-3 overflow-y-auto p-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">블라인드 등급</p>
                  <p className="mt-1">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${badgeToneBlind(selected.blind_tier)}`}>
                      {blindGuideLabel(selected.blind_tier)}
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-slate-700">{selected.blind_summary || '위반 근거가 감지되지 않았습니다.'}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">우대조건 판정</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{selected.preferred_met ? '충족' : '미충족'}</p>
                  <p className="mt-2 text-sm text-slate-700">{selected.preferred_reason || '판정 근거가 없습니다.'}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">정량 지표</p>
                  <p className="mt-1 text-sm text-slate-700">직무연관도: {(Number(selected.role_relevance_score || 0) * 100).toFixed(0)}%</p>
                  <p className="text-sm text-slate-700">이력서 완성도: {(Number(selected.resume_completeness_score || 0) * 100).toFixed(0)}%</p>
                  <p className="text-sm text-slate-700">누락 필드: {(selected.missing_fields || []).length ? (selected.missing_fields || []).join(', ') : '없음'}</p>
                  <p className="text-sm text-slate-700">중복 의심: {selected.duplicate_suspected ? `의심 (${selected.duplicate_reason || '사유 없음'})` : '정상'}</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
