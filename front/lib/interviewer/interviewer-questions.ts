import {
  QuestionGeneratePayload,
  QuestionGenerationJobCreateResponse,
  QuestionGenerationJobResponse,
  QuestionSavePayload,
} from "@/types/interviewer";
import { api } from "../api";

export const interviewerQuestion = {
  createGenerationJob: async (
    payload: QuestionGeneratePayload,
  ): Promise<QuestionGenerationJobCreateResponse> => {
    const { data } = await api.post<QuestionGenerationJobCreateResponse>(
      "/api/interviewer/questions/generate",
      payload,
    );
    return data;
  },

  getGenerationJob: async (
    jobId: number,
  ): Promise<QuestionGenerationJobResponse> => {
    const { data } = await api.get<QuestionGenerationJobResponse>(
      `/api/interviewer/questions/generation-jobs/${jobId}`,
    );
    return data;
  },

  getActiveGenerationJob: async (): Promise<QuestionGenerationJobResponse | null> => {
    const { data } = await api.get<QuestionGenerationJobResponse | null>(
      "/api/interviewer/questions/generation-jobs/active",
    );
    return data;
  },

  saveQuestions: async (
    payload: QuestionSavePayload,
  ): Promise<{ message: string }> => {
    const { data } = await api.post<{ message: string }>(
      "/api/interviewer/questions",
      payload,
    );
    return data;
  },
};
