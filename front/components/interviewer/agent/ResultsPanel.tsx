"use client";

import React, { useEffect, useRef, useState } from "react";
import { UIGeneratedQuestion } from "@/types/interviewer";

interface ResultsPanelProps {
  isGenerating: boolean;
  questions: UIGeneratedQuestion[];
  onSave: () => void;
  isSaving: boolean;
  onAdditionalChat: (msg: string) => void;
  selectedQuestionIds: string[];
  onToggleQuestionSelect: (questionId: string) => void;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  candidateNameById: Record<number, string>;
  positionNameById: Record<number, string>;
}

const TYPE_MAP: Record<
  string,
  { label: string; className: string; icon: string }
> = {
  "기술 역량": {
    label: "Tech Skill",
    className: "bg-blue-50 text-blue-600 border-blue-200",
    icon: "bx-code-alt",
  },
  컬쳐핏: {
    label: "Culture Fit",
    className: "bg-emerald-50 text-emerald-600 border-emerald-200",
    icon: "bx-bulb",
  },
};

export default function ResultsPanel({
  isGenerating,
  questions,
  onSave,
  isSaving,
  onAdditionalChat,
  selectedQuestionIds,
  onToggleQuestionSelect,
  onToggleSelectAll,
  onClearSelection,
  candidateNameById,
  positionNameById,
}: ResultsPanelProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editedTexts, setEditedTexts] = useState<Record<number, string>>({});
  const [chatInput, setChatInput] = useState("");
  const listScrollRef = useRef<HTMLDivElement>(null);
  const prevQuestionCountRef = useRef(0);

  const handleChatSubmit = () => {
    if (!chatInput.trim()) return;
    onAdditionalChat(chatInput);
    setChatInput("");
  };

  const isEmpty = questions.length === 0 && !isGenerating;
  const showFullScreenLoading = isGenerating && questions.length === 0;
  const showFooter = questions.length > 0 || isGenerating;
  const selectedCount = selectedQuestionIds.length;
  const allSelected =
    questions.length > 0 && questions.every((q) => selectedQuestionIds.includes(q.id));

  useEffect(() => {
    const prev = prevQuestionCountRef.current;
    const next = questions.length;
    prevQuestionCountRef.current = next;

    if (next <= prev || !listScrollRef.current) return;

    const el = listScrollRef.current;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [questions.length]);

  return (
    <div className="flex h-full min-h-[480px] max-h-[min(calc(100vh-11rem),720px)] flex-1 flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <h3 className="text-sm font-black text-slate-800">생성된 질문 리스트</h3>
        <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
          Total: {questions.length}
        </span>
      </div>

      <div
        ref={listScrollRef}
        className="hide-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/30 p-6"
      >
        {isEmpty ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center animate-in fade-in duration-500">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm">
              <i className="bx bx-ghost text-5xl text-slate-300" />
            </div>
            <p className="text-[15px] font-black text-slate-700">
              질문이 아직 없습니다
            </p>
            <p className="mt-1.5 text-center text-[13px] font-medium text-slate-500">
              좌측 패널에서 조건을 선택하고 생성 버튼을 눌러주세요.
            </p>
          </div>
        ) : null}

        {showFullScreenLoading ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center">
            <div className="relative mb-5 h-16 w-16">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
              <i className="bx bx-brain absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl text-indigo-500" />
            </div>
            <p className="animate-pulse text-[15px] font-black text-slate-800">
              AI가 심층 질문을 분석 중입니다...
            </p>
            <p className="mt-1.5 text-center text-[13px] font-medium text-slate-500">
              이력서와 직무 기술서를 교차 검증하고 있습니다.
            </p>
          </div>
        ) : null}

        {!isEmpty && !showFullScreenLoading ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  선택 질문
                </p>
                <p className="text-lg font-black text-slate-900">저장할 질문 선택</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onToggleSelectAll}
                  className="text-xs font-bold text-indigo-600 transition hover:text-indigo-800"
                >
                  {allSelected ? "전체 해제" : "전체 선택"}
                </button>
                <p className="text-sm font-bold text-slate-500">
                  총{" "}
                  <span className="tabular-nums text-indigo-600">{questions.length}</span>건
                  {selectedCount > 0 ? (
                    <span className="ml-2 text-indigo-600">· {selectedCount}개 선택</span>
                  ) : null}
                </p>
              </div>
            </div>

            {isGenerating && questions.length > 0 ? (
              <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-bold text-violet-800">
                  <i className="bx bx-loader-alt animate-spin text-lg" />
                  추가 질문을 생성하고 있습니다…
                </p>
                <p className="mt-1 text-xs font-semibold text-violet-600">
                  우하단 토스트에서 진행 상황을 확인할 수 있습니다.
                </p>
              </div>
            ) : null}

            {questions.map((q, idx) => {
              const typeInfo = TYPE_MAP[q.questionType] ?? {
                label: q.questionType,
                className: "bg-slate-100 text-slate-600 border-slate-200",
                icon: "bx-message",
              };
              const isEditing = editingIdx === idx;
              const displayText = editedTexts[idx] ?? q.questionText;
              const isSelected = selectedQuestionIds.includes(q.id);
              const candidateLabel =
                candidateNameById[q.sourceCandidateId] ??
                `지원자 #${q.sourceCandidateId}`;
              const positionLabel =
                q.sourcePositionId != null
                  ? (positionNameById[q.sourcePositionId] ??
                    `직무 #${q.sourcePositionId}`)
                  : "직무 미지정";

              return (
                <div
                  key={q.id}
                  className={`cursor-pointer rounded-[16px] border p-5 shadow-sm transition-all ${
                    isSelected
                      ? "border-indigo-400 bg-indigo-50/50 ring-2 ring-indigo-500/25"
                      : "border-slate-200 bg-white hover:shadow-md"
                  }`}
                  onClick={() => onToggleQuestionSelect(q.id)}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition ${
                          isSelected
                            ? "border-indigo-600 bg-indigo-600 text-white"
                            : "border-slate-300 bg-white text-transparent"
                        }`}
                        aria-hidden
                      >
                        <i className="bx bx-check text-sm font-bold" />
                      </span>
                      <span
                        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-black tracking-wider ${typeInfo.className}`}
                      >
                        <i className={`bx ${typeInfo.icon} text-sm`} />
                        {typeInfo.label}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                        <i className="bx bx-user" aria-hidden />
                        {candidateLabel}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                        <i className="bx bx-briefcase" aria-hidden />
                        {positionLabel}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingIdx(isEditing ? null : idx);
                      }}
                      className="text-slate-400 hover:text-indigo-600"
                      aria-label={isEditing ? "편집 완료" : "질문 편집"}
                    >
                      <i
                        className={`bx text-lg ${isEditing ? "bx-check" : "bx-edit"}`}
                      />
                    </button>
                  </div>

                  {isEditing ? (
                    <textarea
                      value={displayText}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setEditedTexts((prev) => ({
                          ...prev,
                          [idx]: e.target.value,
                        }))
                      }
                      className="mb-4 w-full rounded-xl border border-slate-200 bg-indigo-50/30 px-4 py-3 text-[13px] font-bold text-slate-800 outline-none focus:border-indigo-400"
                      rows={3}
                    />
                  ) : (
                    <p className="mb-5 text-[14px] font-bold leading-relaxed text-slate-800">
                      Q. {displayText}
                    </p>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <i className="bx bx-target-lock text-indigo-400" />
                        평가 의도
                      </p>
                      <p className="text-[11px] font-medium text-slate-600">
                        {q.evaluationIntent}
                      </p>
                    </div>

                    <div className="rounded-xl border border-emerald-100/50 bg-emerald-50/30 p-3">
                      <p className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <i className="bx bx-file-find text-emerald-400" />
                        생성 근거
                      </p>
                      <p className="text-[11px] font-medium text-slate-600">
                        {q.generationBasis}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {showFooter ? (
        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-100 bg-white p-5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleChatSubmit();
                }
              }}
              placeholder="질문 난이도를 높여줘, 꼬리 질문 추가해줘 등..."
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] outline-none focus:border-indigo-400"
            />
            <button
              type="button"
              onClick={handleChatSubmit}
              disabled={isGenerating}
              className="shrink-0 rounded-xl bg-slate-800 px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
            >
              전송
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClearSelection}
              disabled={selectedCount === 0 || isSaving}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              선택 해제
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || selectedCount === 0}
              className="flex w-full justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-[13px] font-black text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <i className="bx bx-loader-alt bx-spin text-lg" /> 저장 중...
                </>
              ) : (
                <>
                  <i className="bx bx-save text-lg" /> 선택한 질문 저장하기
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
