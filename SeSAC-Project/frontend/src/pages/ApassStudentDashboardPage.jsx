import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apassDashboardStudent } from '../api/client'

export function ApassStudentDashboardPage() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const d = await apassDashboardStudent()
        if (!cancelled) setData(d)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '로드 실패')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">수험생 대시보드 (B2C)</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Fit 분석이 DB에 쌓이면 실제 추이로 갱신됩니다. 데이터가 없으면 데모 곡선이 표시됩니다.
          </p>
        </div>
        <Link to="/apass" className="text-sm text-violet-600 hover:underline dark:text-violet-300">
          ← A-PASS 홈
        </Link>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {data && (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">{data.notes}</p>
          <div className="grid gap-6 lg:grid-cols-2">
            {[
              { title: '글자 수 추이(근사)', key: 'char_trend', color: '#7c3aed' },
              { title: 'Fit·면접 점수 추이', key: 'interview_scores', color: '#0d9488' },
            ].map((c) => (
              <div
                key={c.key}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40"
              >
                <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">{c.title}</h2>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data[c.key]}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-slate-500" />
                      <YAxis tick={{ fontSize: 11 }} className="fill-slate-500" />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          fontSize: 12,
                        }}
                      />
                      <Line type="monotone" dataKey="value" stroke={c.color} strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900/40">
              <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">역량 키워드(요약)</h2>
              <div className="h-56 w-full max-w-xl">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.keyword_trend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#c026d3" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
