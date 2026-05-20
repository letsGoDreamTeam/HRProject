import {
  AssignInterviewerRequest,
  AssignInterviewerResponse,
} from "@/types/hr";
import {
  Applicant,
  ApplicantDetail,
  ApplicantMutationResponse,
  ApplicantUpdatePayload,
} from "@/types/applicant";
import { hrApi } from "../api";

export const assignInterviewers = async (
  data: AssignInterviewerRequest,
): Promise<AssignInterviewerResponse> => {
  try {
    return await Promise.resolve({
      message: `${data.interviewers.length} interviewers assigned successfully.`,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to assign interviewers.";
    throw new Error(message);
  }
};

export const fetchApplicants = async (): Promise<Applicant[]> => {
  const response = await hrApi.get<Applicant[]>("/api/candidates");
  return response.data;
};

export const fetchApplicantDetail = async (
  candidateId: number,
): Promise<ApplicantDetail> => {
  const response = await hrApi.get<ApplicantDetail>(
    `/api/candidates/${candidateId}/detail`,
  );
  return response.data;
};

export const updateApplicant = async (
  candidateId: number,
  payload: ApplicantUpdatePayload,
): Promise<Applicant> => {
  const response = await hrApi.patch<Applicant>(
    `/api/candidates/${candidateId}`,
    payload,
  );
  return response.data;
};

export const deleteApplicant = async (
  candidateId: number,
): Promise<ApplicantMutationResponse> => {
  await hrApi.delete(`/api/candidates/${candidateId}`);
  return {
    message: "吏?먯옄媛 ??젣?섏뿀?듬땲??",
  };
};

