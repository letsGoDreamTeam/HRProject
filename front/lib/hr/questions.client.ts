import { hrApi } from "@/lib/api";
import type { HrSavedQuestion } from "@/types/hr-questions";
import type {
  QuestionGeneratePayload,
  QuestionGenerationJobCreateResponse,
  QuestionGenerationJobResponse,
  QuestionSavePayload,
} from "@/types/interviewer";

export async function fetchHrQuestionsByPosition(
  positionId: number,
): Promise<HrSavedQuestion[]> {
  const { data } = await hrApi.get<HrSavedQuestion[]>("/api/questions", {
    params: { positionId },
  });
  return data;
}

/** `GET /api/questions` (?꾪꽣 ?놁쓬) ??遺?쒕퀎 吏덈Ц 媛쒖닔 吏묎퀎??*/
export async function fetchHrQuestionsAll(): Promise<HrSavedQuestion[]> {
  const { data } = await hrApi.get<HrSavedQuestion[]>("/api/questions");
  return data;
}

/** `DELETE /api/questions/{question_id}` */
export async function deleteHrQuestion(questionId: number): Promise<{ message: string }> {
  const { data } = await hrApi.delete<{ message: string }>(
    `/api/questions/${questionId}`,
  );
  return data;
}

export async function deleteHrQuestions(questionIds: number[]): Promise<void> {
  await Promise.all(questionIds.map((id) => deleteHrQuestion(id)));
}

export const hrQuestionGenerationApi = {
  createGenerationJob: async (
    payload: QuestionGeneratePayload,
  ): Promise<QuestionGenerationJobCreateResponse> => {
    const { data } = await hrApi.post<QuestionGenerationJobCreateResponse>(
      "/api/questions/generate",
      payload,
    );
    return data;
  },

  getGenerationJob: async (
    jobId: number,
  ): Promise<QuestionGenerationJobResponse> => {
    const { data } = await hrApi.get<QuestionGenerationJobResponse>(
      `/api/questions/generation-jobs/${jobId}`,
    );
    return data;
  },

  getActiveGenerationJob: async (): Promise<QuestionGenerationJobResponse | null> => {
    const { data } = await hrApi.get<QuestionGenerationJobResponse | null>(
      "/api/questions/generation-jobs/active",
    );
    return data;
  },

  saveQuestions: async (
    payload: QuestionSavePayload,
  ): Promise<{ message: string }> => {
    const { data } = await hrApi.post<{ message: string }>(
      "/api/questions",
      payload,
    );
    return data;
  },
};

