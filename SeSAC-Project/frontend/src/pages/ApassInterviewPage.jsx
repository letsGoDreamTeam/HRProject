import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apassInterviewStart, apassInterviewTurn } from '../api/client'

export function ApassInterviewPage() {
  const [locale, setLocale] = useState('ko')
  const [summary, setSummary] = useState(
    '수학 세특: 이산수학·알고리즘 스터디. 동아리: 백준 알고리즘 캠프 운영. 진로: 백엔드 개발자 희망.',
  )
  const [threadId, setThreadId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [phase, setPhase] = useState('')
  const [finished, setFinished] = useState(false)
  const bottomRef = useRef(null)

  const scrollBottom = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }

  const start = useCallback(async () => {
    setErr(null)
    setLoading(true)
    setFinished(false)
    try {
      const r = await apassInterviewStart({ locale, record_summary: summary })
      setThreadId(r.thread_id)
      setPhase(r.phase)
      setMessages([{ role: 'assistant', content: r.assistant_message }])
      scrollBottom()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '시작 실패')
    } finally {
      setLoading(false)
    }
  }, [locale, summary])

  const send = useCallback(async () => {
    if (!threadId || !input.trim() || finished) return
    setErr(null)
    const userText = input.trim()
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: userText }])
    setLoading(true)
    scrollBottom()
    try {
      const r = await apassInterviewTurn({ thread_id: threadId, user_message: userText })
      setPhase(r.phase)
      setFinished(r.finished)
      setMessages((m) => [...m, { role: 'assistant', content: r.assistant_message }])
      scrollBottom()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '전송 실패')
    } finally {
      setLoading(false)
    }
  }, [threadId, input, finished])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">AI 모의면접 (LangGraph)</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            서버에서 단계별 상태로 진행됩니다. 생기부 요약을 구체적으로 적을수록 꼬리 질문 품질이 좋아집니다.
          </p>
        </div>
        <Link to="/apass" className="text-sm text-violet-600 hover:underline dark:text-violet-300">
          ← A-PASS 홈
        </Link>
      </div>

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-1">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">면접 언어</label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            disabled={!!threadId}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">생기부·활동 요약</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={!!threadId}
            rows={8}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          />
          <button
            type="button"
            disabled={loading || !!threadId}
            onClick={() => void start()}
            className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            면접 시작
          </button>
          {phase && <p className="text-xs text-slate-500">현재 단계: {phase}</p>}
        </div>

        <div className="flex min-h-[320px] flex-col rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/50 lg:col-span-2">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-sm text-slate-500">시작 버튼을 누르면 면접관의 첫 메시지가 표시됩니다.</p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[95%] rounded-xl px-4 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'ml-auto bg-violet-600 text-white'
                    : 'mr-auto border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                }`}
              >
                {m.content}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="border-t border-slate-200 p-3 dark:border-slate-700">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void send())}
                disabled={!threadId || finished || loading}
                placeholder={finished ? '면접 종료' : '답변을 입력하세요'}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
              />
              <button
                type="button"
                disabled={!threadId || finished || loading || !input.trim()}
                onClick={() => void send()}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white dark:bg-slate-700"
              >
                전송
              </button>
            </div>
          </div>
        </div>
      </div>
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}
