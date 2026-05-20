import { Position, PositionPayload, PositionMutationResponse } from "@/types/position";
import { hrApi } from "../api";

export const positionApi = {
  /** GET /api/positions */
  fetchPositions: async (): Promise<Position[]> => {
    const response = await hrApi.get<Position[]>("/api/positions");
    return response.data;
  },

  /**
   * 吏곷Т ?앹꽦 (Create)
   * POST /api/positions
   */
  createPosition: async (
    data: PositionPayload,
  ): Promise<PositionMutationResponse> => {
    const response = await hrApi.post<PositionMutationResponse>(
      "/api/positions",
      data,
    );
    return response.data;
  },

  /**
   * 吏곷Т ?섏젙 (Update)
   * PATCH /api/positions/{positionId}
   */
  updatePosition: async (
    positionId: number,
    data: PositionPayload,
  ): Promise<PositionMutationResponse> => {
    const response = await hrApi.patch<PositionMutationResponse>(
      `/api/positions/${positionId}`,
      data,
    );
    return response.data;
  },

  /**
   * 吏곷Т ??젣 (Delete)
   * DELETE /api/positions/{positionId}
   */
  deletePosition: async (
    positionId: number,
  ): Promise<PositionMutationResponse> => {
    const response = await hrApi.delete<PositionMutationResponse>(
      `/api/positions/${positionId}`,
    );
    return response.data;
  },
};

