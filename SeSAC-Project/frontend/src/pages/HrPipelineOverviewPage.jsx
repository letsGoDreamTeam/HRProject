import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { hrListApplicationBatches, hrListRecruitmentProcess } from '../api/client'

/** 배치 제목에서 부서명을 매칭하여 process config를 찾는다 */
function autoMatchConfig(batchTitle, processConfigs) {
  if (!batchTitle || !processConfigs?.length) return null
  const title = batchTitle.toLowerCase()
  return (
    processConfigs.find((p) => p.department && title.includes(p.department.toLowerCase())) || null
  )
}

/** stage key 목록을 받아 각 key의 인원수 Map 반환 */
function countByStage(items) {
  const map = {}
  for (const item of items) {
    const s = item.stage || 'document_screening'
    map[s] = (map[s] || 0) + 1
  }
  return map
}

const STAGE_COLOR = {
  document_screening: { bar: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50' },
  document_review: { bar: 'bg-sky-400', text: 'text-sky-600', bg: 'bg-sky-50' },
  interview_1: { bar: 'bg-blue-500', text: 'text-blue-600', bg: 'bg-blue-50' },
  interview_2: { bar: 'bg-indigo-500', text: 'text-indigo-600', bg: 'bg-indigo-50' },
  interview_3: { bar: 'bg-violet-500', text: 'text-violet-600', bg: 'bg-violet-50' },
  interview_4: { bar: 'bg-purple-500', text: 'text-purple-600', bg: 'bg-purple-50' },
  interview_5: { bar: 'bg-fuchsia-500', text: 'text-fuchsia-600', bg: 'bg-fuchsia-50' },
  interview_6: { bar: 'bg-pink-500', text: 'text-pink-600', bg: 'bg-pink-50' },
  interview_7: { bar: 'bg-rose-500', text: 'text-rose-600', bg: 'bg-rose-50' },
  interview_8: { bar: 'bg-orange-500', text: 'text-orange-600', bg: 'bg-orange-50' },
  interview_9: { bar: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50' },
  interview_10: { bar: 'bg-yellow-500', text: 'text-yellow-600', bg: 'bg-yellow-50' },
  interview_n: { bar: 'bg-violet-400', text: 'text-violet-600', bg: 'bg-violet-50' },
  final: { bar: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50' },
  final_pass: { bar: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' },
  hired: { bar: 'bg-teal-500', text: 'text-teal-600', bg: 'bg-teal-50' },
  final_fail: { bar: 'bg-orange-400', text: 'text-orange-600', bg: 'bg-orange-50' },
  rejected: { bar: 'bg-red-400', text: 'text-red-500', bg: 'bg-red-50' },
}
const defaultColor = { bar: 'bg-slate-300', text: 'text-slate-500', bg: 'bg-slate-50' }

function formatDate(iso) {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function BatchCard({ batch, processConfig }) {
  const stageCounts = countByStage(batch.items || [])
  const total = (batch.items || []).length
  const stages = processConfig?.stages ?? []

  // 진행 중 인원 (불합격/최종 제외)
  const terminalKeys = new Set(['rejected', 'final_fail', 'hired', 'final_pass'])
  const activeCount = (batch.items || []).filter(
    (it) => !terminalKeys.has(it.stage || 'document_screening'),
  ).length
  const rejectedCount = (batch.items || []).filter(
    (it) => it.stage === 'rejected' || it.stage === 'final_fail',
  ).length
  const passedCount = (batch.items || []).filter(
    (it) => it.stage === 'hired' || it.stage === 'final_pass',
  ).length

  // 퍼널 진행도: 현재 가장 많은 인원이 있는 단계의 인덱스
  let deepestIdx = 0
  stages.forEach((s, i) => {
    if ((stageCounts[s.key] || 0) > 0) deepestIdx = i
  })
  const progressPct = stages.length > 1 ? Math.round((deepestIdx / (stages.length - 1)) * 100) : 0

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-violet-200 hover:shadow-md transition-all">
      {/* 카드 헤더 */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          {processConfig && (
            <span className="mb-1.5 inline-block rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">
              {processConfig.department || processConfig.name}
            </span>
          )}
          {!processConfig && (
            <span className="mb-1.5 inline-block rounded-full border border-dashed border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-600">
              채용절차 미설정
            </span>
          )}
          <div className="truncate text-base font-bold text-slate-900">{batch.title || '제목 없음'}</div>
          <div className="mt-0.5 text-xs text-slate-400">
            시작일: <span className="text-slate-600">{formatDate(batch.created_at)}</span>
          </div>
        </div>
        <Link
          to={`/hr/pipeline/${batch.id}`}
          className="flex-shrink-0 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
        >
          파이프라인 →
        </Link>
      </div>

      {/* 요약 수치 */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
        {[
          { label: '총 지원자', value: total, color: 'text-slate-800' },
          { label: '진행 중', value: activeCount, color: 'text-blue-600' },
          { label: '불합격', value: rejectedCount, color: 'text-red-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center py-3">
            <span className={`text-xl font-bold ${color}`}>{value}</span>
            <span className="text-[11px] text-slate-400">{label}</span>
          </div>
        ))}
      </div>

      {/* 단계별 인원 현황 */}
      <div className="px-5 py-4">
        {stages.length === 0 ? (
          <div className="flex h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200">
            <span className="text-xs text-slate-400">채용절차를 설정하면 단계별 현황이 표시됩니다.</span>
            <Link to="/hr/recruitment-process" className="text-[11px] font-semibold text-violet-600 hover:underline">
              채용절차 설정하기 →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {stages.map((s) => {
              const count = stageCounts[s.key] || 0
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              const col = STAGE_COLOR[s.key] || defaultColor
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <span className={`w-28 flex-shrink-0 truncate text-[11px] font-medium ${col.text}`}>
                    {s.label}
                  </span>
                  <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${col.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 flex-shrink-0 text-right text-[11px] font-bold text-slate-600">
                    {count}명
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 진행도 바 */}
      {stages.length > 1 && total > 0 && (
        <div className="border-t border-slate-100 px-5 py-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">전체 진행도</span>
            <span className="text-[11px] font-semibold text-slate-600">{progressPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-400 to-blue-400 transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function HrPipelineOverviewPage() {
  const [batches, setBatches] = useState([])
  const [processConfigs, setProcessConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [batchData, configData] = await Promise.all([
        hrListApplicationBatches(),
        hrListRecruitmentProcess(),
      ])
      setBatches(Array.isArray(batchData) ? batchData : [])
      setProcessConfigs(Array.isArray(configData) ? configData : [])
    } catch (e) {
      setError(e?.message || '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = batches.filter((b) =>
    !search || (b.title || '').toLowerCase().includes(search.toLowerCase()),
  )

  // 통계 요약
  const totalApplicants = batches.reduce((s, b) => s + (b.items?.length || 0), 0)
  const totalActive = batches.reduce(
    (s, b) =>
      s +
      (b.items || []).filter(
        (it) => !['rejected', 'final_fail', 'hired', 'final_pass'].includes(it.stage || ''),
      ).length,
    0,
  )
  const totalHired = batches.reduce(
    (s, b) =>
      s + (b.items || []).filter((it) => it.stage === 'hired' || it.stage === 'final_pass').length,
    0,
  )

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-0.5 text-[11px] font-bold tracking-widest text-blue-600">
            RECRUITMENT OVERVIEW
          </span>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">채용 현황 대시보드</h1>
          <p className="mt-1 text-sm text-slate-500">
            부서·직무별 채용 단계 진행 현황을 한눈에 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              placeholder="배치 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-40 rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 shadow-sm outline-none focus:border-violet-400"
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? '로딩…' : '새로고침'}
          </button>
        </div>
      </div>

      {/* 전체 요약 수치 */}
      {!loading && batches.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: '채용 공고', value: batches.length, sub: '진행 중인 배치', icon: '📋' },
            { label: '전체 지원자', value: totalApplicants, sub: '누적 지원 인원', icon: '👥' },
            { label: '심사 진행 중', value: totalActive, sub: '현재 각 단계 진행', icon: '🔄' },
            { label: '입사 확정', value: totalHired, sub: '최종 합격·입사', icon: '🎉' },
          ].map(({ label, value, sub, icon }) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">{label}</span>
                <span className="text-xl">{icon}</span>
              </div>
              <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
              <div className="mt-0.5 text-xs text-slate-400">{sub}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 배치 카드 목록 */}
      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          불러오는 중…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-white">
          <div className="text-4xl">📭</div>
          <div className="text-sm font-medium text-slate-600">
            {search ? '검색 결과가 없습니다.' : '등록된 채용 배치가 없습니다.'}
          </div>
          {!search && (
            <Link
              to="/hr/applications"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              지원서 배치 만들기 →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((batch) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              processConfig={autoMatchConfig(batch.title, processConfigs)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
