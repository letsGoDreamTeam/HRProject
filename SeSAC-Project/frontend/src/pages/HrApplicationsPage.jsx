import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  hrApplicationDedupeScan,
  hrCreateApplicationBatch,
  hrDeleteApplicationItem,
  hrDownloadStandardizedResumeText,
  hrDownloadApplicationBatchExcel,
  hrGetApplicationBatch,
  hrListApplicationBatches,
  hrRunApplicationBatch,
  hrScheduleApplicationResults,
  hrStandardizeApplicationBatch,
  hrUpdateApplicationStage,
} from '../api/client'

const STAGE_LABEL = {
  document_review: '서류 합격',
  interview_n: 'n차 면접',
  final_pass: '최종 합격',
  final_fail: '최종 불합격',
}

const KANBAN_STAGES = ['document_review', 'interview_n', 'final_pass', 'final_fail']

export function HrApplicationsPage() {
  const [batches, setBatches] = useState([])
  const [error, setError] = useState(null)
  const [title, setTitle] = useState('지원서 분류')
  const [jdPreferred, setJdPreferred] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState(null)
  const [dedupe, setDedupe] = useState([])
  const [mailOpen, setMailOpen] = useState(false)
  const [mailResult, setMailResult] = useState('final_pass')
  const [mailTargetIds, setMailTargetIds] = useState([])
  const [mailSubject, setMailSubject] = useState('[채용 결과 안내] {name}님, {result} 결과를 안내드립니다.')
  const [mailBody, setMailBody] = useState('안녕하세요 {name}님.\n귀하의 전형 결과는 {result} 입니다.\n감사합니다.')
  const [mailAt, setMailAt] = useState('')

  const refreshList = useCallback(async () => {
    setError(null)
    try {
      const list = await hrListApplicationBatches()
      setBatches(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e?.message || '목록 실패')
    }
  }, [])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  const loadDetail = async (id) => {
    if (!id) {
      setDetail(null)
      return
    }
    setError(null)
    try {
      const d = await hrGetApplicationBatch(id)
      setDetail(d)
      const dup = await hrApplicationDedupeScan(id)
      setDedupe(Array.isArray(dup?.groups) ? dup.groups : [])
    } catch (e) {
      setError(e?.message || '상세 실패')
    }
  }

  useEffect(() => {
    void loadDetail(selectedId)
  }, [selectedId])

  const upload = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const d = await hrCreateApplicationBatch({ title, jdPreferredText: jdPreferred, files })
      setSelectedId(d.id)
      setFiles([])
      await refreshList()
    } catch (err) {
      setError(err?.message || '업로드 실패')
    } finally {
      setBusy(false)
    }
  }

  const run = async () => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      const d = await hrRunApplicationBatch(selectedId)
      setDetail(d)
      await refreshList()
    } catch (e) {
      setError(e?.message || '분석 실패')
    } finally {
      setBusy(false)
    }
  }

  const xlsx = async () => {
    if (!selectedId) return
    try {
      await hrDownloadApplicationBatchExcel(selectedId)
    } catch (e) {
      setError(e?.message || '엑셀 실패')
    }
  }

  const standardize = async () => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      const r = await hrStandardizeApplicationBatch(selectedId)
      await loadDetail(selectedId)
      alert(`표준화 완료: ${r.updated}건, 스킵 ${r.skipped}건`)
    } catch (e) {
      setError(e?.message || '표준화 실패')
    } finally {
      setBusy(false)
    }
  }

  const moveStage = async (itemId, stage) => {
    setError(null)
    try {
      await hrUpdateApplicationStage(itemId, stage)
      await loadDetail(selectedId)
      if (stage === 'final_pass' || stage === 'final_fail') {
        const rows = (detail?.items || []).filter((x) => x.id === itemId)
        setMailTargetIds(rows.map((x) => x.id))
        setMailResult(stage)
        setMailOpen(true)
      }
    } catch (e) {
      setError(e?.message || '칸반 이동 실패')
    }
  }

  const onDragStart = (ev, itemId) => {
    ev.dataTransfer.setData('application-item-id', String(itemId))
  }

  const onDropStage = async (ev, stage) => {
    ev.preventDefault()
    const itemId = ev.dataTransfer.getData('application-item-id')
    if (!itemId) return
    await moveStage(itemId, stage)
  }

  const openBulkResultMail = (result) => {
    if (!detail?.items?.length) return
    const ids = detail.items.filter((x) => x.stage === result).map((x) => x.id)
    setMailResult(result)
    setMailTargetIds(ids)
    setMailOpen(true)
  }

  const scheduleMail = async (e) => {
    e.preventDefault()
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      const iso = mailAt ? new Date(mailAt).toISOString() : ''
      const r = await hrScheduleApplicationResults(selectedId, {
        item_ids: mailTargetIds,
        result: mailResult,
        subject_template: mailSubject,
        body_template: mailBody,
        schedule_at: iso,
      })
      setMailOpen(false)
      alert(`메일 예약 완료: ${r.queued}건 (이메일 없음 ${r.skipped_no_email}건)`)
      await loadDetail(selectedId)
    } catch (err) {
      setError(err?.message || '결과 메일 예약 실패')
    } finally {
      setBusy(false)
    }
  }

  const removeItem = async (itemId) => {
    if (!window.confirm('이 지원자 카드를 삭제할까요?')) return
    try {
      await hrDeleteApplicationItem(itemId)
      await loadDetail(selectedId)
    } catch (e) {
      setError(e?.message || '카드 삭제 실패')
    }
  }

  const groupsByStage = Object.fromEntries(
    KANBAN_STAGES.map((s) => [s, (detail?.items || []).filter((x) => (x.stage || 'document_review') === s)]),
  )

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">지원서 분류</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            PDF 업로드 → 필터링(AI) → 결과 확인·엑셀. 우대 요건 텍스트를 넣으면 충족 여부를 표시합니다.
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

      <form onSubmit={upload} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. 지원서 넣기 (PDF)</h2>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          배치 제목
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          공고 우대·자격 요건 (텍스트)
          <textarea
            rows={4}
            value={jdPreferred}
            onChange={(e) => setJdPreferred(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          문서 파일 (PDF, DOCX, TXT, MD, RTF / 복수 선택)
          <input
            type="file"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="mt-1 block w-full text-sm text-slate-600 dark:text-slate-400"
          />
        </label>
        <button
          type="submit"
          disabled={busy || files.length === 0}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          업로드하여 배치 만들기
        </button>
      </form>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. 배치 선택 · 필터링 · 엑셀</h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="">배치 선택…</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} · {new Date(b.created_at).toLocaleString()}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void run()}
            disabled={!selectedId || busy}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            AI 분류 실행
          </button>
          <button
            type="button"
            onClick={() => void standardize()}
            disabled={!selectedId || busy}
            className="rounded-lg border border-violet-300 px-3 py-2 text-sm hover:bg-violet-50 disabled:opacity-50 dark:border-violet-700 dark:hover:bg-violet-900/30"
          >
            이력서 양식 표준화(AI)
          </button>
          <button
            type="button"
            onClick={() => void xlsx()}
            disabled={!selectedId}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            엑셀보내기
          </button>
          <button
            type="button"
            onClick={() => openBulkResultMail('final_pass')}
            disabled={!selectedId}
            className="rounded-lg border border-emerald-300 px-3 py-2 text-sm hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:hover:bg-emerald-900/30"
          >
            합격열 메일 예약
          </button>
          <button
            type="button"
            onClick={() => openBulkResultMail('final_fail')}
            disabled={!selectedId}
            className="rounded-lg border border-rose-300 px-3 py-2 text-sm hover:bg-rose-50 disabled:opacity-50 dark:border-rose-700 dark:hover:bg-rose-900/30"
          >
            불합격열 메일 예약
          </button>
        </div>

        {detail && (
          <div className="space-y-6 text-left text-sm">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">중복 후보 (이름+생년월일)</h3>
              {dedupe.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">중복 후보 없음</p>
              ) : (
                <ul className="mt-2 space-y-2 text-xs">
                  {dedupe.map((g) => (
                    <li key={g.key} className="rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
                      키: {g.key} · 대상 {g.item_ids.length}건 ({g.names.join(', ')})
                      <div className="mt-1 flex flex-wrap gap-1">
                        {g.item_ids.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => void removeItem(id)}
                            className="rounded border border-rose-300 px-1.5 py-0.5 text-[11px] text-rose-800 hover:bg-rose-100 dark:border-rose-700 dark:text-rose-200 dark:hover:bg-rose-900/40"
                          >
                            {id.slice(0, 6)} 삭제
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-slate-500">최종 중복 제거는 사람이 판단해 주세요.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {KANBAN_STAGES.map((stage) => (
                <section
                  key={stage}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => void onDropStage(e, stage)}
                  className="min-h-52 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40"
                >
                  <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
                    {STAGE_LABEL[stage]} ({groupsByStage[stage]?.length || 0})
                  </h4>
                  <div className="space-y-2">
                    {(groupsByStage[stage] || []).map((it) => (
                      <article
                        key={it.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, it.id)}
                        className="cursor-move rounded border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <p className="font-medium text-slate-900 dark:text-white">{it.candidate_name || it.filename}</p>
                        <p className="text-xs text-slate-500">{it.birth_date || '생년월일 없음'}</p>
                        <p className="text-xs text-slate-500">{it.email_extracted || '이메일 없음'}</p>
                        <p className="text-xs text-slate-500">
                          변환: {it.pdf_conversion_status}
                          {it.source_ext ? ` (${it.source_ext})` : ''}
                        </p>
                        {!it.text_quality_ok && (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            텍스트 품질 주의: {it.text_quality_note || '추출 품질 낮음'}
                          </p>
                        )}
                        {!!it.pdf_conversion_note && (
                          <p className="text-xs text-slate-500">{it.pdf_conversion_note}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => void hrDownloadStandardizedResumeText(it.id)}
                          className="mt-1 text-xs text-violet-600 underline dark:text-violet-300"
                        >
                          표준 이력서(.txt)
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </section>

      {mailOpen && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">결과 메일 자동 전송 예약</h2>
          <p className="mt-1 text-xs text-slate-500">
            대상 {mailTargetIds.length}건 · {"{name}"} / {"{result}"} 플레이스홀더 사용 가능
          </p>
          <form onSubmit={scheduleMail} className="mt-3 space-y-3">
            <input
              value={mailSubject}
              onChange={(e) => setMailSubject(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
            <textarea
              rows={5}
              value={mailBody}
              onChange={(e) => setMailBody(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
            <label className="block text-sm">
              예약 시각
              <input
                type="datetime-local"
                value={mailAt}
                onChange={(e) => setMailAt(e.target.value)}
                className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || mailTargetIds.length === 0 || !mailAt}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                예약 전송
              </button>
              <button
                type="button"
                onClick={() => setMailOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600"
              >
                닫기
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
