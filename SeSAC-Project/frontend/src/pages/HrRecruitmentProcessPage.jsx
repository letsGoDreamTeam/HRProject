import { useCallback, useEffect, useState } from 'react'
import {
  hrCreateRecruitmentProcess,
  hrDeleteRecruitmentProcess,
  hrListRecruitmentProcess,
  hrPatchRecruitmentProcess,
} from '../api/client'

// 선택 가능한 모든 stage 키 목록
const STAGE_KEY_OPTIONS = [
  { key: 'document_screening', label: '서류 접수' },
  { key: 'document_review', label: '서류 검토' },
  { key: 'interview_1', label: '1차 면접' },
  { key: 'interview_2', label: '2차 면접' },
  { key: 'interview_3', label: '3차 면접' },
  { key: 'interview_4', label: '4차 면접' },
  { key: 'interview_5', label: '5차 면접' },
  { key: 'interview_6', label: '6차 면접' },
  { key: 'interview_7', label: '7차 면접' },
  { key: 'interview_8', label: '8차 면접' },
  { key: 'interview_9', label: '9차 면접' },
  { key: 'interview_10', label: '10차 면접' },
  { key: 'interview_n', label: 'N차 면접 (추가)' },
  { key: 'final', label: '최종 합격 심사' },
  { key: 'final_pass', label: '최종 합격' },
  { key: 'hired', label: '입사 확정' },
  { key: 'final_fail', label: '최종 불합격' },
  { key: 'rejected', label: '불합격' },
]

const DEFAULT_STAGES = [
  { key: 'document_screening', label: '서류 접수' },
  { key: 'interview_1', label: '1차 면접' },
  { key: 'interview_2', label: '2차 면접' },
  { key: 'final', label: '최종 합격 심사' },
  { key: 'rejected', label: '불합격' },
]

const STAGE_DOT_COLOR = {
  document_screening: 'bg-slate-400',
  document_review: 'bg-sky-400',
  interview_1: 'bg-blue-500',
  interview_2: 'bg-indigo-500',
  interview_3: 'bg-violet-500',
  interview_4: 'bg-purple-500',
  interview_5: 'bg-fuchsia-500',
  interview_6: 'bg-pink-500',
  interview_7: 'bg-rose-500',
  interview_8: 'bg-orange-500',
  interview_9: 'bg-amber-500',
  interview_10: 'bg-yellow-500',
  interview_n: 'bg-violet-400',
  final: 'bg-amber-500',
  final_pass: 'bg-emerald-500',
  hired: 'bg-teal-500',
  final_fail: 'bg-orange-400',
  rejected: 'bg-red-400',
}

function StageRow({ stage, idx, total, onChange, onRemove, onMoveUp, onMoveDown }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={idx === 0}
          className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30 text-xs"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={idx === total - 1}
          className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30 text-xs"
        >
          ▼
        </button>
      </div>
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STAGE_DOT_COLOR[stage.key] || 'bg-slate-400'}`} />
      <div className="flex flex-1 flex-wrap gap-2">
        <select
          value={stage.key}
          onChange={(e) => onChange({ ...stage, key: e.target.value })}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 outline-none focus:border-violet-400"
        >
          {STAGE_KEY_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label} ({opt.key})
            </option>
          ))}
        </select>
        <input
          type="text"
          value={stage.label}
          onChange={(e) => onChange({ ...stage, label: e.target.value })}
          placeholder="단계명 (예: 1차 코딩테스트)"
          className="flex-1 min-w-36 rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-800 outline-none focus:border-violet-400"
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"
      >
        ✕
      </button>
    </div>
  )
}

function ProcessCard({ config, onEdit, onDelete }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-violet-200 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-bold text-slate-900">{config.name}</div>
          {config.department && (
            <div className="mt-0.5 text-xs text-slate-500">부서: {config.department}</div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(config)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            편집
          </button>
          <button
            onClick={() => onDelete(config)}
            className="rounded-lg border border-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            삭제
          </button>
        </div>
      </div>
      {/* Stage flow */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {(config.stages || []).map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STAGE_DOT_COLOR[s.key] || 'bg-slate-400'}`} />
            <span className="text-xs text-slate-700">{s.label}</span>
            {i < config.stages.length - 1 && (
              <span className="text-slate-300 text-xs">→</span>
            )}
          </div>
        ))}
        <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
          {config.stages?.length || 0}단계
        </span>
      </div>
    </div>
  )
}

const EMPTY_FORM = { name: '', department: '', stages: DEFAULT_STAGES.map((s) => ({ ...s })) }

export function HrRecruitmentProcessPage() {
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await hrListRecruitmentProcess()
      setConfigs(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e?.message || '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const openNew = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = (cfg) => {
    setEditId(cfg.id)
    setForm({ name: cfg.name, department: cfg.department, stages: cfg.stages.map((s) => ({ ...s })) })
    setShowForm(true)
  }

  const handleDelete = async (cfg) => {
    if (!window.confirm(`"${cfg.name}" 설정을 삭제할까요?`)) return
    try {
      await hrDeleteRecruitmentProcess(cfg.id)
      showToast('삭제되었습니다.')
      await load()
    } catch (e) {
      setError(e?.message || '삭제 실패')
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('절차 이름을 입력하세요.'); return }
    if (form.stages.length < 2) { setError('단계는 2개 이상 필요합니다.'); return }
    setSaving(true)
    setError(null)
    try {
      if (editId) {
        await hrPatchRecruitmentProcess(editId, { name: form.name, department: form.department, stages: form.stages })
        showToast('수정되었습니다.')
      } else {
        await hrCreateRecruitmentProcess({ name: form.name, department: form.department, stages: form.stages })
        showToast('생성되었습니다.')
      }
      setShowForm(false)
      await load()
    } catch (e) {
      setError(e?.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const updateStage = (idx, newStage) =>
    setForm((f) => ({ ...f, stages: f.stages.map((s, i) => (i === idx ? newStage : s)) }))

  const removeStage = (idx) =>
    setForm((f) => ({ ...f, stages: f.stages.filter((_, i) => i !== idx) }))

  const moveStage = (idx, dir) =>
    setForm((f) => {
      const arr = [...f.stages]
      const target = idx + dir
      if (target < 0 || target >= arr.length) return f
      ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
      return { ...f, stages: arr }
    })

  const addStage = () => {
    const used = new Set(form.stages.map((s) => s.key))
    const next = STAGE_KEY_OPTIONS.find((o) => !used.has(o.key))
    if (!next) return
    setForm((f) => ({ ...f, stages: [...f.stages, { key: next.key, label: next.label }] }))
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed right-6 top-6 z-50 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-xl">
          ✓ {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-0.5 text-[11px] font-semibold tracking-widest text-blue-600">
            RECRUITMENT PROCESS
          </span>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">채용 절차 설정</h1>
          <p className="mt-1 text-sm text-slate-500">
            부서·직무별 면접 라운드를 자유롭게 정의하세요. 파이프라인 칸반 컬럼에 반영됩니다.
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-slate-800"
        >
          + 새 절차 추가
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-slate-400">불러오는 중…</div>
      ) : configs.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200">
          <div className="text-4xl">⚙️</div>
          <div className="text-sm text-slate-500">등록된 채용 절차가 없습니다.</div>
          <button
            onClick={openNew}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            첫 번째 절차 만들기
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {configs.map((cfg) => (
            <ProcessCard key={cfg.id} config={cfg} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editId ? '채용 절차 편집' : '새 채용 절차'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    절차 이름 *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="예: 백엔드팀 채용절차"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    부서명
                  </label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    placeholder="예: 백엔드팀"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    채용 단계 ({form.stages.length}개)
                  </label>
                  <button
                    type="button"
                    onClick={addStage}
                    className="rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                  >
                    + 단계 추가
                  </button>
                </div>
                <div className="space-y-2">
                  {form.stages.map((stage, idx) => (
                    <StageRow
                      key={idx}
                      stage={stage}
                      idx={idx}
                      total={form.stages.length}
                      onChange={(s) => updateStage(idx, s)}
                      onRemove={() => removeStage(idx)}
                      onMoveUp={() => moveStage(idx, -1)}
                      onMoveDown={() => moveStage(idx, 1)}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  단계 키(key)는 파이프라인 칸반 컬럼 식별자로 사용됩니다. 같은 배치에서 공유됩니다.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                disabled={saving}
                onClick={handleSave}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? '저장 중…' : editId ? '수정 완료' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
