// src/app/admin/users/page.tsx
import { fetchUsersList } from "@/app/server/admin/adminUsers.server";
import UserTable from "@/components/admin/UserTable";

// Next.js 15부터 searchParams는 Promise 형태로 들어옵니다.
interface AdminUsersPageProps {
  searchParams: Promise<{
    page?: string;
    size?: string;
    keyword?: string;
  }>;
}

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  // 1. 비동기 객체인 searchParams를 풀어줍니다.
  const awaitedParams = await searchParams;

  // 2. 파라미터 파싱 (없으면 기본값 설정)
  const page = parseInt(awaitedParams.page || "0", 10);
  const size = parseInt(awaitedParams.size || "20", 10);
  const keyword = awaitedParams.keyword || "";

  // 3. 서버에서 데이터 패칭 (HTML이 그려지기 전에 완료됨)
  const data = await fetchUsersList(page, size, keyword);

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50 p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 타이틀 영역 */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-slate-900 mb-2">
            사용자 관리
          </h1>
          <p className="text-slate-500 font-medium">
            플랫폼에 가입된 사용자를 조회, 추가 및 관리합니다.
          </p>
        </div>

        {/* 
                    완성된 클라이언트 컴포넌트 렌더링 
                    (SSR로 가져온 데이터를 props로 전달)
                */}
        <UserTable data={data} />
      </div>
    </div>
  );
}