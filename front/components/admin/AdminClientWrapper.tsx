'use client'; // 상태 관리를 위해 클라이언트 컴포넌트로 선언

import React, { useState } from "react";
import AdminSidebar from "./AdminSidebar";
import LogoutButton from "@/components/auth/LogoutButton";

// 💡 Props 타입 지정
export interface AdminClientWrapperProps {
    children: React.ReactNode;
}

export default function AdminClientWrapper({ children }: AdminClientWrapperProps) {
    // 모바일 사이드바 오픈 여부 상태
    const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

    return (
        <div className="flex min-h-screen bg-slate-50">

            {/* 1. 사이드바 컴포넌트 렌더링 */}
            <AdminSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            {/* 2. 우측 콘텐츠 영역 */}
            <div className="flex flex-1 flex-col overflow-hidden">

                {/* 헤더 영역 (Figma 스타일 & Boxicons 반응형) */}
                <header className="h-18 flex items-center justify-between sticky top-0 z-30 px-5 border-b border-slate-200/70 bg-white/80 backdrop-blur-md md:h-20 md:px-8 md:bg-white md:backdrop-blur-none">
                    <div className="flex items-center gap-3">
                        {/* 💡 모바일 전용 햄버거 버튼 */}
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl md:hidden transition-colors"
                            aria-label="메뉴 열기"
                        >
                            <i className='bx bx-menu text-2xl'></i>
                        </button>

                        <span className="text-base font-bold text-slate-900 md:text-lg">
                            관리자님, 반갑습니다 👋
                        </span>
                    </div>

                    <div className="flex items-center gap-4 md:gap-6">
                        <button
                            className="w-10 h-10 flex items-center justify-center relative text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all"
                            aria-label="알림 확인"
                        >
                            <i className='bx bx-bell text-2xl'></i>
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white shadow-sm"></span>
                        </button>

                        {/* 데스크탑 전용 세로 구분선 */}
                        <div className="w-px h-6 bg-slate-200 hidden md:block"></div>

                        <LogoutButton />
                    </div>
                </header>

                {/* 3. 본문 렌더링 영역 (children) */}
                <main className="flex-1 overflow-y-auto bg-slate-100 p-5 md:p-8">
                    <div className="mx-auto max-w-7xl bg-white p-6 rounded-3xl border border-slate-200/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] min-h-[calc(100vh-160px)] animate-in fade-in duration-500">
                        {/* 여기에 서버에서 렌더링된 page.tsx 내용이 쏙 들어갑니다! */}
                        {children}
                    </div>
                </main>

            </div>
        </div>
    );
}