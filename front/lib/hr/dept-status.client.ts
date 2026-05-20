import { DeptStatus, DeptStatusListResponse } from "@/types/hr";
import { hrApi } from "../api";

export const deptStatusApi = {
  fetchRecruitmentStatus: async (): Promise<DeptStatus[]> => {
    const { data } = await hrApi.get<DeptStatus[] | DeptStatusListResponse>(
      "/api/hr/recruitment-status",
    );

    const list = Array.isArray(data) ? data : (data?.content ?? []);
    return (list as DeptStatus[]).map((row) => ({
      ...row,
      id: String(row.id),
    }));
  },
};