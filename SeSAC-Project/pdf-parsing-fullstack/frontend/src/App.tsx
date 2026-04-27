import { useCallback, useRef, useState } from "react"

const DISPLAY_KEYS = [
  "이름",
  "생년월일",
  "연락처",
  "이메일",
  "주소",
  "원문 지원직무",
  "최종학력",
  "경력기간",
  "경력회사",
  "경력직무",
  "파일형식",
] as const

type RecordRow = {
  [key: string]: string
}

/** 백엔드 `ResumeParseItem` / `ResumeParseResponse`과 동일 구조 */
type ResumeParseItem = { filename: string; record: RecordRow }

type ResumeParseFileError = { filename: string; detail: string }

type ResumeParseResponse = {
  items: ResumeParseItem[]
  errors: ResumeParseFileError[]
  excelBase64: string | null
  excelFileName: string | null
}

function downloadExcelBase64(b64: string, filename: string) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i)
  }
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? ""

export default function App() {
  const [items, setItems] = useState<ResumeParseItem[]>([])
  const [errors, setErrors] = useState<ResumeParseFileError[]>([])
  const [excelB64, setExcelB64] = useState<string | null>(null)
  const [excelName, setExcelName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const dragDepth = useRef(0)

  const onFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) {
        return
      }
      setFormError(null)
      setLoading(true)
      setItems([])
      setErrors([])
      setExcelB64(null)
      setExcelName(null)
      const form = new FormData()
      for (let i = 0; i < fileList.length; i += 1) {
        const f = fileList.item(i)
        if (f) {
          form.append("files", f, f.name)
        }
      }
      try {
        const res = await fetch(`${apiBase}/api/parse`, {
          method: "POST",
          body: form,
        })
        if (!res.ok) {
          const t = await res.text()
          throw new Error(t || res.statusText)
        }
        const data = (await res.json()) as ResumeParseResponse
        setItems(data.items)
        setErrors(data.errors)
        setExcelB64(data.excelBase64)
        setExcelName(data.excelFileName)
        if (data.items.length === 0 && data.errors.length === 0) {
          setFormError("결과가 없습니다. 지원 형식: PDF, DOCX, HWP 등")
        }
      } catch (e) {
        setFormError(
          e instanceof Error ? e.message : "요청에 실패했습니다. API 서버(백엔드)를 실행했는지 확인하세요.",
        )
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current += 1
    setDragActive(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragActive(false)
    }
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "copy"
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragDepth.current = 0
      setDragActive(false)
      const { files } = e.dataTransfer
      if (files?.length) {
        void onFiles(files)
      }
    },
    [onFiles],
  )

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">
            이력서 → 엑셀 (ParsingToExcel)
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            PDF·DOCX·HWP 등을 업로드하면 필드가 추출되고, 한 번에 엑셀로 받을 수 있습니다.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div
            role="region"
            aria-label="이력서 파일 끌어다 놓기"
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
            className={`rounded-xl border-2 border-dashed px-6 py-12 transition ${
              dragActive
                ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-200"
                : "border-slate-300 bg-slate-50/80 hover:border-indigo-400 hover:bg-indigo-50/40"
            } ${loading ? "pointer-events-none opacity-60" : ""}`}
          >
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2"
              htmlFor="file"
            >
              <span className="text-sm font-medium text-slate-700">
                {dragActive ? "여기에 놓으면 업로드됩니다" : "파일 선택·드래그 (여러 개 가능)"}
              </span>
              <span className="text-xs text-slate-500">백엔드에서 파싱 후 표와 엑셀을 생성합니다</span>
            </label>
            <input
              id="file"
              name="file"
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.hwp,.pptx,application/*"
              className="sr-only"
              disabled={loading}
              onChange={(e) => void onFiles(e.target.files)}
            />
          </div>
          {loading && (
            <p className="mt-4 text-center text-sm text-indigo-600" role="status">
              처리 중…
            </p>
          )}
          {formError && (
            <p className="mt-4 text-center text-sm text-red-600" role="alert">
              {formError}
            </p>
          )}
        </section>

        {errors.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-left">
            <h2 className="text-sm font-semibold text-amber-900">일부 파일 오류</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-800">
              {errors.map((e) => (
                <li key={`${e.filename}-${e.detail}`}>
                  <span className="font-medium">{e.filename}</span> — {e.detail}
                </li>
              ))}
            </ul>
          </section>
        )}

        {items.length > 0 && (
          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-slate-800">추출 결과 ({items.length}건)</h2>
              {excelB64 && excelName && (
                <button
                  type="button"
                  onClick={() => downloadExcelBase64(excelB64, excelName)}
                  className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
                >
                  {excelName} 내려받기
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-sm">
              <table className="w-max min-w-full border-collapse text-left text-xs sm:text-sm">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 z-20 min-w-[10rem] max-w-[14rem] border-b border-r border-slate-300 bg-slate-200 px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-800 sm:px-3 sm:text-xs"
                    >
                      원본 파일
                    </th>
                    {DISPLAY_KEYS.map((key) => (
                      <th
                        key={key}
                        scope="col"
                        className="min-w-[7rem] max-w-[20rem] border-b border-slate-300 bg-slate-100 px-2 py-2.5 text-left text-[11px] font-semibold text-slate-800 sm:min-w-[8rem] sm:px-3 sm:text-xs"
                      >
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, rowIdx) => {
                    const rowBg = rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50"
                    return (
                    <tr
                      key={`${it.filename}-${rowIdx}`}
                      className={rowBg}
                    >
                      <th
                        scope="row"
                        className={`sticky left-0 z-10 max-w-[14rem] border-b border-r border-slate-200 px-2 py-2 text-left text-[11px] font-medium text-slate-700 sm:px-3 sm:text-xs ${rowBg}`}
                        title={it.filename}
                      >
                        <span className="break-all sm:break-words">{it.filename}</span>
                      </th>
                      {DISPLAY_KEYS.map((key) => (
                        <td
                          key={key}
                          className="max-w-[20rem] border-b border-slate-200 px-2 py-2 align-top text-slate-800 sm:px-3"
                        >
                          <span className="block whitespace-pre-wrap break-words text-left">
                            {it.record[key] ?? ""}
                          </span>
                        </td>
                      ))}
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      <footer className="mt-auto border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        프론트는 Vite+React+Tailwind이며, API는 <code className="rounded bg-slate-100 px-1">/api/parse</code> (개발
        시 프록시)를 사용합니다.
      </footer>
    </div>
  )
}
