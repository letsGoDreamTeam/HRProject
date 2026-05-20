import {
  ActiveBookingSummary,
  AvailableInterviewSlot,
  InterviewBookingCancelPayload,
  InterviewBookingMutationResponse,
  InterviewBookingPayload,
  InterviewBookingResponse,
} from "@/types/interviewBooking";
import { hrApi } from "../api";

export const interviewBookingApi = {
  fetchAvailableSlots: async (
    candidateId: number,
  ): Promise<AvailableInterviewSlot[]> => {
    const response = await hrApi.get<AvailableInterviewSlot[]>(
      "/api/interview-bookings/available-slots",
      {
        params: { candidateId },
      },
    );

    return response.data;
  },

  createBooking: async (
    payload: InterviewBookingPayload,
  ): Promise<InterviewBookingResponse> => {
    const response = await hrApi.post<InterviewBookingResponse>(
      "/api/interview-bookings",
      payload,
    );

    return response.data;
  },

  cancelBooking: async (
    bookingId: number,
    payload: InterviewBookingCancelPayload,
  ): Promise<InterviewBookingMutationResponse> => {
    const response = await hrApi.patch<InterviewBookingMutationResponse>(
      `/api/interview-bookings/${bookingId}/cancel`,
      payload,
    );

    return response.data;
  },

  /**
   * 吏곷Т??嫄몃┛ ?쒖꽦(誘몄랬?? booking ?쇨큵 議고쉶.
   * 媛숈? 吏곷Т 吏?먯옄 移대뱶?먯꽌 "?ㅻⅨ ?щ’??諛곗젙?? ?쇰꺼??洹몃━?????ъ슜.
   */
  fetchActiveBookingsByPosition: async (
    positionId: number,
  ): Promise<ActiveBookingSummary[]> => {
    const response = await hrApi.get<ActiveBookingSummary[]>(
      "/api/interview-bookings/active",
      { params: { positionId } },
    );
    return response.data;
  },
};

