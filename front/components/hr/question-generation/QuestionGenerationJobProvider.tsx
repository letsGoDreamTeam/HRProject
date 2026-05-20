"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  QuestionGenerationJobToastUI,
  type QuestionGenerationToastProgress,
} from "./QuestionGenerationJobToastUI";
import { coerceToErrorString, getApiErrorMessage } from "@/lib/hr/api-error";
import {
  QUESTION_GENERATION_POLL_INTERVAL_MS,
  QUESTION_GENERATION_STATUS_LABEL,
  QUESTION_GENERATION_TOAST_ID,
  questionGenerationPercent,
} from "@/lib/hr/question-generation.constants";
import { question } from "@/lib/interviewer/questions";
import type {
  QuestionGeneratePayload,
  QuestionGenerationJobResponse,
  UIGeneratedQuestion,
} from "@/types/interviewer";

const JOB_QUERY_KEY = "questionGenerationJob";

type SuccessListener = (questions: UIGeneratedQuestion[]) => void;

function mapToUiQuestions(
  job: QuestionGenerationJobResponse,
): UIGeneratedQuestion[] {
  const items = job.resultQuestions;
  if (!items?.length) return [];
  return items.map((q, idx) => ({
    ...q,
    id: `gen-job-${job.jobId}-q-${q.questionType}-${q.questionText.trim()}-${idx}`,
    sourceCandidateId: job.candidateId,
    sourcePositionId: job.positionId,
    sourceJobId: job.jobId,
  }));
}

function mergeQuestionsById(
  prev: UIGeneratedQuestion[],
  next: UIGeneratedQuestion[],
): UIGeneratedQuestion[] {
  if (next.length === 0) return prev;
  const seen = new Set(prev.map((item) => item.id));
  const deduped = next.filter((item) => !seen.has(item.id));
  if (deduped.length === 0) return prev;
  return [...prev, ...deduped];
}

function toToastProgress(
  job: QuestionGenerationJobResponse | undefined,
): QuestionGenerationToastProgress {
  const status = job?.status ?? "idle";
  const label =
    QUESTION_GENERATION_STATUS_LABEL[status] ?? status;
  return {
    status,
    label,
    percent: questionGenerationPercent(status),
    resultCount: job?.resultQuestions?.length ?? undefined,
  };
}

export interface QuestionGenerationJobContextValue {
  generatedQuestions: UIGeneratedQuestion[];
  setGeneratedQuestions: React.Dispatch<
    React.SetStateAction<UIGeneratedQuestion[]>
  >;
  appendGeneratedQuestions: (items: UIGeneratedQuestion[]) => void;
  clearGeneratedQuestions: () => void;
  startGeneration: (payload: QuestionGeneratePayload) => Promise<void>;
  isCreating: boolean;
  isJobActive: boolean;
  progress: QuestionGenerationToastProgress;
  jobError: string | null;
  registerOnSucceeded: (listener: SuccessListener) => () => void;
  goToAgentPage: () => void;
}

const QuestionGenerationJobContext =
  createContext<QuestionGenerationJobContextValue | null>(null);

function QuestionGenerationJobToastHost({
  isJobActive,
  shouldShowToast,
  progress,
  isMinimized,
  onToggleMinimize,
}: {
  isJobActive: boolean;
  shouldShowToast: boolean;
  progress: QuestionGenerationToastProgress;
  isMinimized: boolean;
  onToggleMinimize: () => void;
}) {
  useEffect(() => {
    if (!isJobActive || !shouldShowToast) {
      toast.dismiss(QUESTION_GENERATION_TOAST_ID);
      return;
    }

    toast.custom(
      (t) => (
        <QuestionGenerationJobToastUI
          toastId={t}
          progress={progress}
          isMinimized={isMinimized}
          onToggleMinimize={onToggleMinimize}
        />
      ),
      {
        id: QUESTION_GENERATION_TOAST_ID,
        duration: Infinity,
        dismissible: true,
        position: "bottom-right",
      },
    );
  }, [
    isJobActive,
    shouldShowToast,
    progress,
    isMinimized,
    onToggleMinimize,
  ]);

  useEffect(() => {
    return () => {
      toast.dismiss(QUESTION_GENERATION_TOAST_ID);
    };
  }, []);

  return null;
}

export function QuestionGenerationJobProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const listenersRef = useRef<Set<SuccessListener>>(new Set());
  const [jobId, setJobId] = useState<number | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<
    UIGeneratedQuestion[]
  >([]);
  const [jobError, setJobError] = useState<string | null>(null);
  const [isToastMinimized, setIsToastMinimized] = useState(false);

  const registerOnSucceeded = useCallback((listener: SuccessListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const appendGeneratedQuestions = useCallback((items: UIGeneratedQuestion[]) => {
    if (items.length === 0) return;
    setGeneratedQuestions((prev) => mergeQuestionsById(prev, items));
  }, []);

  const applySucceeded = useCallback(
    (items: UIGeneratedQuestion[]) => {
      if (items.length > 0) {
        setGeneratedQuestions((prev) => mergeQuestionsById(prev, items));
      }

      listenersRef.current.forEach((listener) => {
        try {
          listener(items);
        } catch {
          /* ignore */
        }
      });
    },
    [],
  );

  const createMutation = useMutation({
    mutationFn: question.createGenerationJob,
    onSuccess: (data) => {
      setJobId(data.jobId);
      setJobError(null);
      setIsToastMinimized(false);
    },
    onError: (error) => {
      toast.error(
        getApiErrorMessage(error, "질문 생성 작업을 시작하지 못했습니다."),
      );
    },
  });

  const jobQuery = useQuery({
    queryKey: [JOB_QUERY_KEY, jobId],
    queryFn: () => question.getGenerationJob(jobId!),
    enabled: jobId != null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "queued" || status === "running") {
        return QUESTION_GENERATION_POLL_INTERVAL_MS;
      }
      return false;
    },
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const active = await question.getActiveGenerationJob();
        if (cancelled || !active) return;
        if (active.status === "queued" || active.status === "running") {
          setJobId(active.jobId);
        }
      } catch {
        /* ignore resume errors */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const job = jobQuery.data;
    if (!job) return;

    if (job.status === "succeeded") {
      const uiItems = mapToUiQuestions(job);
      setTimeout(() => {
        applySucceeded(uiItems);
        setJobId(null);
        setIsToastMinimized(false);
      }, 0);

      toast.dismiss(QUESTION_GENERATION_TOAST_ID);
      toast.success(
        uiItems.length > 0
          ? `면접 질문 ${uiItems.length}개가 생성되었습니다.`
          : "질문 생성이 완료되었습니다.",
        {
          position: "bottom-right",
          action: {
            label: "결과 보기",
            onClick: () => router.push("/hr/ai-gen"),
          },
        },
      );

      queryClient.removeQueries({ queryKey: [JOB_QUERY_KEY, job.jobId] });
    }

    if (job.status === "failed" || job.status === "cancelled") {
      const message = coerceToErrorString(
        job.errorMessage,
        job.status === "cancelled"
          ? "질문 생성이 취소되었습니다."
          : "질문 생성에 실패했습니다.",
      );
      toast.dismiss(QUESTION_GENERATION_TOAST_ID);
      toast.error(message, { position: "bottom-right" });
      setTimeout(() => {
        setJobError(message);
        setJobId(null);
        setIsToastMinimized(false);
      }, 0);
      queryClient.removeQueries({ queryKey: [JOB_QUERY_KEY, job.jobId] });
    }
  }, [jobQuery.data, applySucceeded, queryClient, router]);

  const progress = useMemo(
    () => toToastProgress(jobQuery.data),
    [jobQuery.data],
  );

  const isJobActive =
    createMutation.isPending ||
    (jobId != null &&
      (jobQuery.data?.status === "queued" ||
        jobQuery.data?.status === "running" ||
        jobQuery.isFetching));
  const shouldShowToast =
    pathname?.startsWith("/hr/ai-gen") === true ||
    pathname?.startsWith("/interviewer") === true;

  const startGeneration = useCallback(
    async (payload: QuestionGeneratePayload) => {
      await createMutation.mutateAsync(payload);
    },
    [createMutation],
  );

  const goToAgentPage = useCallback(() => {
    router.push("/hr/ai-gen");
  }, [router]);

  const value = useMemo<QuestionGenerationJobContextValue>(
    () => ({
      generatedQuestions,
      setGeneratedQuestions,
      appendGeneratedQuestions,
      clearGeneratedQuestions: () => setGeneratedQuestions([]),
      startGeneration,
      isCreating: createMutation.isPending,
      isJobActive,
      progress,
      jobError,
      registerOnSucceeded,
      goToAgentPage,
    }),
    [
      generatedQuestions,
      appendGeneratedQuestions,
      startGeneration,
      createMutation.isPending,
      isJobActive,
      progress,
      jobError,
      registerOnSucceeded,
      goToAgentPage,
    ],
  );

  return (
    <QuestionGenerationJobContext.Provider value={value}>
      <QuestionGenerationJobToastHost
        isJobActive={isJobActive}
        shouldShowToast={shouldShowToast}
        progress={progress}
        isMinimized={isToastMinimized}
        onToggleMinimize={() => setIsToastMinimized((prev) => !prev)}
      />
      {children}
    </QuestionGenerationJobContext.Provider>
  );
}

export function useQuestionGenerationJob(): QuestionGenerationJobContextValue {
  const ctx = useContext(QuestionGenerationJobContext);
  if (!ctx) {
    throw new Error(
      "useQuestionGenerationJob must be used within QuestionGenerationJobProvider",
    );
  }
  return ctx;
}

export function useQuestionGenerationJobOptional() {
  return useContext(QuestionGenerationJobContext);
}
