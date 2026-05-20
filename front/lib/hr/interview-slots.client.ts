import {
  InterviewSlotBatchPayload,
  InterviewSlotCreatePayload,
  InterviewSlotDetailItem,
  InterviewSlotListItem,
  InterviewSlotMutationItem,
  InterviewSlotUpdatePayload,
} from "@/types/interviewSlotWrite";
import { hrApi } from "../api";

export const interviewSlotsApi = {
  fetchSlots: async (params: {
    year?: number;
    month?: number;
    day?: number;
    positionId?: number;
  }): Promise<InterviewSlotListItem[]> => {
    const response = await hrApi.get<InterviewSlotListItem[]>(
      "/api/interview-slots",
      { params },
    );
    return response.data;
  },

  fetchSlotDetail: async (slotId: number): Promise<InterviewSlotDetailItem> => {
    const response = await hrApi.get<InterviewSlotDetailItem>(
      `/api/interview-slots/${slotId}`,
    );
    return response.data;
  },

  createSlot: async (
    payload: InterviewSlotCreatePayload,
  ): Promise<InterviewSlotMutationItem> => {
    const response = await hrApi.post<InterviewSlotMutationItem>(
      "/api/interview-slots",
      payload,
    );
    return response.data;
  },

  createSlotsBatch: async (
    payload: InterviewSlotBatchPayload,
  ): Promise<InterviewSlotMutationItem[]> => {
    const response = await hrApi.post<InterviewSlotMutationItem[]>(
      "/api/interview-slots/batch",
      payload,
    );
    return response.data;
  },

  updateSlot: async (
    slotId: number,
    payload: InterviewSlotUpdatePayload,
  ): Promise<InterviewSlotMutationItem> => {
    const response = await hrApi.patch<InterviewSlotMutationItem>(
      `/api/interview-slots/${slotId}`,
      payload,
    );
    return response.data;
  },

  deleteSlot: async (slotId: number): Promise<{ message: string }> => {
    const response = await hrApi.delete<{ message: string }>(
      `/api/interview-slots/${slotId}`,
    );
    return response.data;
  },
};

