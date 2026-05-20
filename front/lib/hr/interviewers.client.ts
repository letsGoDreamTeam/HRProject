import {
  HrInterviewer,
  InterviewerListParams,
  InterviewerListResponse,
  InterviewerMutationResponse,
  InterviewerPayload,
} from "@/types/interviewer";
import { hrApi } from "../api";

const normalizeListResponse = (
  data: HrInterviewer[] | InterviewerListResponse,
): InterviewerListResponse => {
  if (Array.isArray(data)) {
    return { content: data };
  }

  return {
    content: data.content ?? [],
    page: data.page,
    size: data.size,
    totalElements: data.totalElements,
    totalPages: data.totalPages,
  };
};

export const interviewerApi = {
  fetchInterviewers: async (
    params: InterviewerListParams = {},
  ): Promise<InterviewerListResponse> => {
    const response = await hrApi.get<HrInterviewer[] | InterviewerListResponse>(
      "/api/interviewers",
      {
        params: {
          page: params.page ?? 0,
          size: params.size ?? 100,
          keyword: params.keyword || undefined,
          positionId: params.positionId,
          interviewRound: params.interviewRound,
        },
      },
    );

    return normalizeListResponse(response.data);
  },

  createInterviewer: async (data: InterviewerPayload): Promise<HrInterviewer> => {
    const response = await hrApi.post<HrInterviewer>("/api/interviewers", data);
    return response.data;
  },

  updateInterviewer: async (
    interviewerId: number,
    data: Partial<InterviewerPayload>,
  ): Promise<HrInterviewer> => {
    const response = await hrApi.patch<HrInterviewer>(
      `/api/interviewers/${interviewerId}`,
      data,
    );
    return response.data;
  },

  deleteInterviewer: async (
    interviewerId: number,
  ): Promise<InterviewerMutationResponse> => {
    const response = await hrApi.delete<InterviewerMutationResponse>(
      `/api/interviewers/${interviewerId}`,
    );
    return response.data;
  },
};

