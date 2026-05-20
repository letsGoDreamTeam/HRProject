import {
  BackendPosition,
  BackendCandidate,
  QuestionGeneratePayload,
  BackendGeneratedQuestion,
  QuestionSavePayload,
  HrInterviewer,
} from "@/types/interviewer";
import { getAuthMeServer } from "../auth/controlOfAuthority.server";
import { fetchInterviewersServer } from "../hr/interviewer.server";

import "server-only";
import { apiServer } from "../axios-server";

/**
 * 1. 공고(Position) 목록 조회 - 서버 버전
 * apiServer를 사용하여 쿠키의 토큰을 자동으로 헤더에 포함합니다.
 */
export const fetchPositions = async (): Promise<BackendPosition[]> => {
  try {
    // 실제 API 호출 (FastAPI 서버의 엔드포인트)
    const response = await apiServer.get("/api/positions");

    // Axios의 data 필드에서 결과 반환
    return response.data as BackendPosition[];
  } catch (error) {
    console.warn(
      "🚨 [Server API] 포지션 목록 로드 실패. 목업 데이터를 반환합니다.",
    );

    // Fallback: 목업 데이터
    return [
      {
        positionId: 1,
        positionName: "인사",
        createdAt: "2026-05-12T10:00:00Z",
      },
      {
        positionId: 2,
        positionName: "개발",
        createdAt: "2026-05-12T10:00:00Z",
      },
      {
        positionId: 3,
        positionName: "프론트엔드",
        createdAt: "2026-05-12T10:00:00Z",
      },
      {
        positionId: 4,
        positionName: "백엔드",
        createdAt: "2026-05-12T10:00:00Z",
      },
    ];
  }
};

/**
 * 2. 지원자(Candidate) 목록 조회 - 서버 버전
 */
export const fetchCandidates = async (): Promise<BackendCandidate[]> => {
  try {
    const response = await apiServer.get("/api/candidates");
    return response.data as BackendCandidate[];
  } catch (error) {
    console.warn(
      "🚨 [Server API] 지원자 목록 로드 실패. 목업 데이터를 반환합니다.",
    );

    // Fallback: 목업 데이터
    return [
      {
        candidate_id: 1,
        position_id: 3,
        name: "김진우",
        application_status: "진행중",
        final_status: "진행중",
        experience_level: "경력",
        meets_preferred_criteria: [],
      },
      {
        candidate_id: 2,
        position_id: 3,
        name: "남건우",
        application_status: "진행중",
        final_status: "진행중",
        experience_level: "신입",
        meets_preferred_criteria: [],
      },
      {
        candidate_id: 3,
        position_id: 1,
        name: "이지은",
        application_status: "진행중",
        final_status: "대기",
        experience_level: "경력",
        meets_preferred_criteria: [],
      },
    ];
  }
};

export const fetchMyInterviewerPositionId = async (): Promise<
  number | null
> => {
  try {
    const me = await getAuthMeServer();
    const email = me.userEmail?.trim().toLowerCase();
    if (!email) return null;

    const list = await fetchInterviewersServer({
      keyword: email,
      size: 100,
    });

    const exact = list.content.find(
      (item: HrInterviewer) =>
        item.interviewerEmail?.trim().toLowerCase() === email,
    );

    return exact?.positionId ?? null;
  } catch {
    return null;
  }
};
