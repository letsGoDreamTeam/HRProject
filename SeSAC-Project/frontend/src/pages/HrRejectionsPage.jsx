import { useState } from 'react'
import { Link } from 'react-router-dom'
import { hrSendRejections } from '../api/client'

export function HrRejectionsPage() {
  const [subject, setSubject] = useState('채용 전형 결과 안내')
  const [body, setBody] = useState(
    '귀하의 뛰어난 역량에도 불구하고 이번 전형에서는 함께하기 어렵게 되었음을 알려드립니다.',
  )
  const [tsv, setTsv] = useState('이름\t이메일\t전화\n홍길동\thong@example.com\t')
  const [sendEmail, setSendEmail] = useState(true)
  const [sendSms, setSendSms] = useState(false)
  const [scheduleMin, setScheduleMin] = useState(0)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const parseTsv = () => {
    const lines = tsv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const recipients = []
    for (const line of lines) {
      const parts = line.split(/\t/).map((c) => c.trim())
      const name = parts[0] || ''
      const email = parts[1] || ''
      const phone = parts[2] || ''
      if (!email && !phone) continue
      recipients.push({ name, email, phone })
    }
    return recipients
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const recipients = parseTsv()
      if (!recipients.length) throw new Error('수신자를 한 명 이상 입력하세요. (탭 구분)')
      const data = await hrSendRejections({
        recipients,
        subject,
        body,
        send_email: sendEmail,
        send_sms: sendSms,
        schedule_in_minutes: Number(scheduleMin) || 0,
      })
      setResult(data)
    } catch (err) {
      setError(err?.message || '요청 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">불합격 통보</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            SMTP·Twilio 설정 시 실제 발송되며, 미설정이면 서버 로그에만 남습니다.
          </p>
        </div>
        <Link to="/hr" className="text-sm text-violet-600 hover:underline dark:text-violet-400">
          ← HR 홈
        </Link>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        )}
        {result && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
            큐에 {result.queued}건 넣었습니다. 예약 시각: {result.scheduled_at}
          </p>
        )}
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          제목 (메일)
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          본문
          <textarea
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          수신자 (한 줄에 한 명, 탭으로 이름·이메일·전화)
          <textarea
            rows={6}
            value={tsv}
            onChange={(e) => setTsv(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <div className="flex flex-wrap gap-4 text-sm text-slate-700 dark:text-slate-300">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            메일
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
            SMS
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          예약 발송(분 후, 0=즉시 큐)
          <input
            type="number"
            min={0}
            value={scheduleMin}
            onChange={(e) => setScheduleMin(e.target.value)}
            className="mt-1 w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? '처리 중…' : '통보 예약'}
        </button>
      </form>
    </div>
  )
}
