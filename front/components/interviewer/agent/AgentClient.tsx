"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQuestionGenerationJob } from "@/components/hr/question-generation/QuestionGenerationJobProvider";
import ControlPanel from "./ControlPanel";
import ResultsPanel from "./ResultsPanel";
import {
  BackendPosition,
  BackendCandidate,
  QuestionSavePayload,
} from "@/types/interviewer";
import { getApiErrorMessage } from "@/lib/hr/api-error";
import { question as questionAPI } from "@/lib/interviewer/questions";

interface AgentClientProps {
  initialPositions: BackendPosition[];
  initialCandidates: BackendCandidate[];
}

export default function AgentClient({
  initialPositions,
  initialCandidates,
}: AgentClientProps) {
  const queryClient = useQueryClient();
  const [selectedPositionId, setSelectedPositionId] = useState<number | null>(
    null,
  );
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);

  const {
    generatedQuestions,
    startGeneration,
    isCreating,
    isJobActive,
  } = useQuestionGenerationJob();
  const candidateNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const candidate of initialCandidates) {
      if (candidate.name?.trim()) {
        map[candidate.candidate_id] = candidate.name.trim();
      }
    }
    return map;
  }, [initialCandidates]);
  const positionNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const position of initialPositions) {
      if (position.positionName?.trim()) {
        map[position.positionId] = position.positionName.trim();
      }
    }
    return map;
  }, [initialPositions]);

  const handleGenerate = useCallback(
    async (additionalRequest?: string) => {
      if (!selectedPositionId || !selectedCandidateId) return;

      try {
        await startGeneration({
          positionId: selectedPositionId,
          candidateId: selectedCandidateId,
          questionCount: 10,
          additionalRequest: additionalRequest || "",
        });
      } catch {
        /* toast handled in provider */
      }
    },
    [selectedCandidateId, selectedPositionId, startGeneration],
  );

  useEffect(() => {
    const generatedQuestionIds = new Set(generatedQuestions.map((q) => q.id));
    setSelectedQuestionIds((prev) =>
      prev.filter((id) => generatedQuestionIds.has(id)),
    );
  }, [generatedQuestions]);

  const toggleQuestionSelection = useCallback((questionId: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId],
    );
  }, []);

  const toggleSelectAllQuestions = useCallback(() => {
    if (generatedQuestions.length === 0) {
      setSelectedQuestionIds([]);
      return;
    }

    setSelectedQuestionIds((prev) => {
      const allSelected = generatedQuestions.every((q) => prev.includes(q.id));
      if (allSelected) return [];
      return generatedQuestions.map((q) => q.id);
    });
  }, [generatedQuestions]);

  const clearQuestionSelection = useCallback(() => {
    setSelectedQuestionIds([]);
  }, []);

  const handleSave = async () => {
    const selectedQuestions = generatedQuestions.filter((q) =>
      selectedQuestionIds.includes(q.id),
    );
    if (selectedQuestions.length === 0) {
      toast.error("저장할 질문을 1개 이상 선택해 주세요.");
      return;
    }

    setIsSaving(true);
    try {
      const payload: QuestionSavePayload = {
        questions: selectedQuestions.map((q) => ({
          questionText: q.questionText,
          questionType: q.questionType,
          evaluationIntent: q.evaluationIntent,
          generationBasis: q.generationBasis,
          candidateId: q.sourceCandidateId,
          positionId: q.sourcePositionId ?? undefined,
          generationJobId: q.sourceJobId,
        })),
      };

      const result = await questionAPI.saveQuestions(payload);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["hr-questions-counts"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["hr-questions-by-position"],
        }),
      ]);

      toast.success(result.message ?? "저장이 완료되었습니다.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "저장에 실패했습니다."));
    } finally {
      setIsSaving(false);
    }
  };

  const isGenerating = isCreating || isJobActive;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 xl:flex-row xl:items-stretch">
      <ControlPanel
        positions={initialPositions}
        candidates={initialCandidates}
        selectedPositionId={selectedPositionId}
        setSelectedPositionId={(id) => {
          setSelectedPositionId(id);
          setSelectedCandidateId(null);
        }}
        selectedCandidateId={selectedCandidateId}
        setSelectedCandidateId={setSelectedCandidateId}
        isGenerating={isGenerating}
        onGenerateAI={() => void handleGenerate()}
      />
      <ResultsPanel
        isGenerating={isGenerating}
        questions={generatedQuestions}
        onSave={() => void handleSave()}
        isSaving={isSaving}
        onAdditionalChat={(msg) => void handleGenerate(msg)}
        selectedQuestionIds={selectedQuestionIds}
        onToggleQuestionSelect={toggleQuestionSelection}
        onToggleSelectAll={toggleSelectAllQuestions}
        onClearSelection={clearQuestionSelection}
        candidateNameById={candidateNameById}
        positionNameById={positionNameById}
      />
    </div>
  );
}
