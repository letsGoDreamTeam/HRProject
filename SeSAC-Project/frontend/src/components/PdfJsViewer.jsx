import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function PdfPageCanvas({ pdf, pageNum, maxWidth }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!pdf || !maxWidth) return
    let cancelled = false

    ;(async () => {
      const page = await pdf.getPage(pageNum)
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(maxWidth / baseViewport.width, 2.5)
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      const task = page.render({ canvasContext: ctx, viewport })
      await task.promise
    })()

    return () => {
      cancelled = true
    }
  }, [pdf, pageNum, maxWidth])

  return (
    <div className="mb-3 flex justify-center last:mb-0">
      <canvas
        ref={canvasRef}
        className="max-w-full rounded border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-950"
      />
    </div>
  )
}

export function PdfJsViewer({ file }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [loadErr, setLoadErr] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const scrollRef = useRef(null)
  const [width, setWidth] = useState(560)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth - 24
      if (w > 0) setWidth(w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [file])

  useEffect(() => {
    if (!file) return

    let cancelled = false

    ;(async () => {
      try {
        const data = await file.arrayBuffer()
        const loadingTask = pdfjs.getDocument({ data })
        const pdf = await loadingTask.promise
        if (cancelled) return
        setPdfDoc(pdf)
        setNumPages(pdf.numPages)
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e instanceof Error ? e.message : 'PDF 로드 실패')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [file])

  if (!file) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
        PDF 파일을 선택하면 여기에 미리보기가 표시됩니다.
      </div>
    )
  }

  if (loadErr) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
        PDF를 열 수 없습니다: {loadErr}
      </div>
    )
  }

  if (!pdfDoc) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40">
        PDF 렌더링 준비 중…
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        ref={scrollRef}
        className="max-h-[min(70vh,520px)] overflow-y-auto rounded-xl border border-slate-200 bg-slate-100/90 p-3 dark:border-slate-700 dark:bg-slate-900/60"
      >
        {Array.from({ length: numPages }, (_, i) => (
          <PdfPageCanvas key={i + 1} pdf={pdfDoc} pageNum={i + 1} maxWidth={width} />
        ))}
      </div>
      <p className="text-center text-xs text-slate-500 dark:text-slate-500">
        <a
          href="https://mozilla.github.io/pdf.js/"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-violet-600 dark:hover:text-violet-400"
        >
          PDF.js
        </a>
        {' '}
        (Mozilla)로 페이지를 렌더링합니다.
      </p>
    </div>
  )
}
