import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const BASE = import.meta.env.VITE_API_BASE ?? ''

async function fetchConfirm(token) {
  const r = await fetch(`${BASE}/api/public/confirm/${token}`)
  if (!r.ok) throw new Error((await r.json()).detail || '유효하지 않은 링크입니다.')
  return r.json()
}

async function postAttendance(token, attendance) {
  const r = await fetch(`${BASE}/api/public/confirm/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attendance }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.detail || '처리 중 오류가 발생했습니다.')
  }
  return r.json()
}

function formatDateTimeKo(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}시 ${String(d.getMinutes()).padStart(2, '0')}분`
}

export function CandidateConfirmPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null) // 'accepted' | 'declined'

  useEffect(() => {
    if (!token) { setError('잘못된 링크입니다.'); setLoading(false); return }
    fetchConfirm(token)
      .then((d) => {
        setData(d)
        if (d.attendance) setResult(d.attendance)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const handleAttendance = async (attendance) => {
    setSubmitting(true)
    try {
      await postAttendance(token, attendance)
      setResult(attendance)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-400">불러오는 중…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50 px-4">
        <div className="text-4xl">😢</div>
        <div className="text-center text-base font-semibold text-slate-700">{error}</div>
        <div className="text-sm text-slate-400">링크가 만료되었거나 유효하지 않습니다.</div>
      </div>
    )
  }

  const dtStr = formatDateTimeKo(data.scheduled_at)

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-violet-50 px-4 py-10">
      <div className="w-full max-w-md">
        {/* 상단 로고/배지 */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600 text-2xl text-white shadow-lg">
            🎉
          </div>
          <span className="rounded-full bg-violet-100 px-3 py-0.5 text-xs font-bold tracking-widest text-violet-700">
            A-RECRUIT
          </span>
        </div>

        {/* 카드 */}
        <div className="overflow-hidden rounded-3xl bg-white shadow-xl">
          {/* 헤더 */}
          <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-6 text-center text-white">
            <div className="text-sm font-medium opacity-80">축하합니다!</div>
            <div className="mt-1 text-2xl font-bold">{data.candidate_name}님</div>
            <div className="mt-1 text-sm opacity-80">다음 채용 단계로 진출하셨습니다</div>
          </div>

          {/* 내용 */}
          <div className="px-6 py-6 space-y-4">
            {/* 단계 */}
            <div className="flex items-center gap-3 rounded-2xl bg-violet-50 px-4 py-4">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-600 text-lg text-white">
                ✅
              </span>
              <div>
                <div className="text-xs text-violet-500 font-medium">다음 단계</div>
                <div className="text-base font-bold text-violet-900">{data.stage_label}</div>
              </div>
            </div>

            {/* 일정 */}
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-4">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-200 text-lg">
                📅
              </span>
              <div>
                <div className="text-xs text-slate-500 font-medium">일정</div>
                <div className="text-base font-bold text-slate-800">
                  {dtStr || '추후 별도 안내 예정'}
                </div>
              </div>
            </div>

            {/* 장소 */}
            {data.location && (
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-4">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-200 text-lg">
                  📍
                </span>
                <div>
                  <div className="text-xs text-slate-500 font-medium">장소</div>
                  <div className="text-base font-bold text-slate-800">{data.location}</div>
                </div>
              </div>
            )}

            {/* 추가 안내 */}
            {data.note && (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {data.note}
              </div>
            )}
          </div>

          {/* 응답 영역 */}
          <div className="border-t border-slate-100 px-6 py-5">
            {result === 'accepted' && (
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl">
                  ✅
                </div>
                <div className="text-base font-bold text-emerald-700">참석 확인 완료!</div>
                <div className="text-sm text-slate-500 text-center">
                  일정 참석 의사를 전달해 주셔서 감사합니다.<br />
                  채용 담당자가 확인하였습니다.
                </div>
                {data.schedule_pick_url && (
                  <a
                    href={data.schedule_pick_url}
                    className="mt-2 inline-flex items-center rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                  >
                    📅 시간대 선택하기
                  </a>
                )}
              </div>
            )}

            {result === 'declined' && (
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-3xl">
                  😔
                </div>
                <div className="text-base font-bold text-slate-600">불참석 의사를 전달했습니다</div>
                <div className="text-sm text-slate-400 text-center">
                  응답해 주셔서 감사합니다.<br />
                  향후 기회에 다시 뵐 수 있기를 바랍니다.
                </div>
              </div>
            )}

            {result === null && (
              <div className="space-y-3">
                <p className="text-center text-sm font-medium text-slate-700">
                  위 일정에 참석 가능하신가요?
                </p>
                <p className="text-center text-xs text-slate-400">
                  아래에서 참석 여부를 선택해 주세요.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={() => handleAttendance('declined')}
                    disabled={submitting}
                    className="rounded-2xl border-2 border-slate-200 py-4 text-sm font-bold text-slate-500 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50 transition-all"
                  >
                    ✗ 불참석합니다
                  </button>
                  <button
                    onClick={() => handleAttendance('accepted')}
                    disabled={submitting}
                    className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 py-4 text-sm font-bold text-white shadow-lg hover:from-violet-700 hover:to-indigo-700 active:scale-[0.98] disabled:opacity-60 transition-all"
                  >
                    {submitting ? '처리 중…' : '✓ 참석하겠습니다'}
                  </button>
                </div>
                <p className="text-center text-[11px] text-slate-400">
                  선택 후 변경이 불가합니다. 신중하게 선택해 주세요.
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          문의사항은 채용 담당자에게 연락해 주세요.
        </p>
      </div>
    </div>
  )
}
