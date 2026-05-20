// src/lib/api/adminUsers.client.ts
import {
  AdminUser,
  CreateUserRequest,
  EmailAvailabilityResponse,
  DeleteUserResponse,
  AdminUserListResponse,
} from "@/types/admin";
import { adminApi } from "@/lib/api"; // 만들어두신 클라이언트용 axios (인터셉터 포함)

export const createUser = async (data: CreateUserRequest): Promise<AdminUser> => {
  const response = await adminApi.post<AdminUser>("/api/admin/users", data);
  return response.data;
};


export const getUserDetail = async (userId: number): Promise<AdminUser> => {
  try {
    // 1. 서버 통신 성공 시
    const response = await adminApi.get<AdminUser>(`/api/admin/users/${userId}`);
    return response.data;
  } catch (error) {
    // 2. 서버 통신 실패 시 (catch)
    console.error(
      `🚨 [GET] 사용자 단건 조회 실패! 목업 데이터를 반환합니다 (ID: ${userId})`,
      error,
    );

    // 요청한 userId를 기반으로 1개의 가짜 사용자 데이터를 생성하여 반환합니다.
    return {
      userId: userId,
      userEmail: `test${userId}@company.com`,
      userName: `테스트 유저 ${userId}`,
      // 전달받은 userId 숫자에 따라 % 연산을 하여 다양한 데이터가 나오게 함
      role: userId % 4 === 0 ? "admin" : "hr",
      createdAt: new Date(
        Date.now() - Math.random() * 10000000000,
      ).toISOString(),
      status: userId % 5 === 0 ? "BLOCK" : "ACTIVE",
    };
  }
};

export const deleteUser = async (
  userId: number,
): Promise<DeleteUserResponse> => {
  const response = await adminApi.delete<DeleteUserResponse>(
    `/api/admin/users/${userId}`,
  );
  return response.data;
};

export const fetchAdminUsersClient = async (
  page: number = 0,
  size: number = 20,
  keyword: string = ""
): Promise<AdminUserListResponse> => {
  try {
    const response = await adminApi.get<AdminUserListResponse>('/api/admin/users', {
      params: { page, size, keyword },
    });
    return response.data;
  } catch (error: any) {
    // 💡 1. 개발자 도구 콘솔에 에러 기록
    console.error(`🚨 [GET] 페이지 ${page} 데이터 로드 실패 (목업 실행):`, error.message);

    // 💡 2. 지연 효과 부여 (실제 네트워크 통신 느낌을 주기 위함)
    await new Promise((resolve) => setTimeout(resolve, 800));

    // 💡 3. 페이지 번호에 따른 가짜 데이터 생성
    // page가 0이면 1~20번, page가 1이면 21~40번 사용자가 생성되도록 로직 구성
    const mockContent: AdminUser[] = Array.from({ length: size }).map((_, i) => {
      const userId = page * size + i + 1;
      return {
        userId,
        userEmail: keyword
          ? `${keyword}_${userId}@mock-server.com`
          : `user_${userId}@hr-portal.io`,
        userName: keyword
          ? `${keyword} ${userId}`
          : `테스트 유저 ${userId}`,
        role: userId % 5 === 0 ? "admin" : "hr",
        createdAt: new Date(Date.now() - userId * 3600000).toISOString(),
      };
    });

    // 💡 4. 인피니티 스크롤 중단을 테스트하고 싶다면 특정 페이지(예: 5페이지)에서 중단 로직 추가 가능
    const totalPages = 5;
    const isLastPage = page >= totalPages - 1;

    return {
      content: mockContent,
      // 인피니티 스크롤의 'hasMore' 판별을 위해 보통 아래와 같은 메타데이터가 필요합니다.
      // 백엔드 명세에 따라 필드명은 조정될 수 있습니다.
    };
  }
};
