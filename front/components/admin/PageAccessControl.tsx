"use client";

import React, { useState } from "react";
import { PageAccessRule } from "@/types/admin";

export default function PageAccessControl() {
  // 💡 1. 초기 목업 데이터 상태 (실제로는 서버에서 fetch)
  const [rules, setRules] = useState<PageAccessRule[]>([
    {
      id: "1",
      path: "/payment",
      isActive: false,
      message: "결제 시스템 PG사 연동 점검 중입니다. (14:00~16:00)",
      updatedAt: "2026-05-05T10:00:00Z",
    },
    {
      id: "2",
      path: "/event",
      isActive: true,
      message: "",
      updatedAt: "2026-05-01T09:30:00Z",
    },
    {
      id: "3",
      path: "/api/ai-feature",
      isActive: true,
      message: "",
      updatedAt: "2026-05-04T15:20:00Z",
    },
  ]);

  // 💡 2. 모달 상태 관리
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newPath, setNewPath] = useState("");

  // 차단 사유 수정 모달 상태
  const [editingRule, setEditingRule] = useState<PageAccessRule | null>(null);
  const [editMessage, setEditMessage] = useState("");

  /* ==========================================
       [핸들러] 상태 토글 및 수정
    ========================================== */
  const handleToggleActive = (rule: PageAccessRule) => {
    if (rule.isActive) {
      // 허용 -> 차단으로 바꿀 때는 사유를 적도록 모달을 띄웁니다.
      setEditingRule(rule);
      setEditMessage("현재 페이지 시스템 점검 중입니다.");
    } else {
      // 차단 -> 허용으로 바꿀 때는 즉시 활성화하고 메시지를 비웁니다.
      if (!confirm(`'${rule.path}' 경로를 다시 활성화하시겠습니까?`)) return;
      setRules((prev) =>
        prev.map((r) =>
          r.id === rule.id
            ? {
                ...r,
                isActive: true,
                message: "",
                updatedAt: new Date().toISOString(),
              }
            : r,
        ),
      );
    }
  };

  const handleSaveBlockMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;

    setRules((prev) =>
      prev.map((r) =>
        r.id === editingRule.id
          ? {
              ...r,
              isActive: false,
              message: editMessage,
              updatedAt: new Date().toISOString(),
            }
          : r,
      ),
    );
    setEditingRule(null);
  };

  /* ==========================================
       [핸들러] 추가 및 삭제
    ========================================== */
  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath.startsWith("/")) {
      alert("경로는 반드시 '/' 로 시작해야 합니다. (예: /board)");
      return;
    }
    if (rules.some((r) => r.path === newPath)) {
      alert("이미 등록된 경로입니다.");
      return;
    }

    const newRule: PageAccessRule = {
      id: Date.now().toString(),
      path: newPath,
      isActive: true,
      message: "",
      updatedAt: new Date().toISOString(),
    };

    setRules([newRule, ...rules]);
    setNewPath("");
    setIsAddModalOpen(false);
  };

  const handleDelete = (id: string, path: string) => {
    if (
      !confirm(
        `정말 '${path}' 제어 규칙을 삭제하시겠습니까?\n삭제하면 누구나 접근할 수 있게 됩니다.`,
      )
    )
      return;
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  /* ==========================================
       [렌더링] UI
    ========================================== */
  return (
    <div className="w-full">
      {/* 상단 헤더 영역 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <i className="bx bx-shield-quarter text-indigo-500"></i> 페이지 접근
            제어
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            특정 URL 경로의 접근을 차단하고 점검 안내 페이지로 리다이렉트합니다.
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold transition-colors shadow-sm"
        >
          <i className="bx bx-plus text-lg"></i> 경로 추가
        </button>
      </div>

      {/* 규칙 리스트 (카드 형태) */}
      <div className="grid grid-cols-1 gap-4">
        {/* 💡 테이블 컨테이너: 둥근 모서리와 그림자 적용 */}
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              {/* 테이블 헤더 */}
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-24">
                    상태
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    경로
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    안내 메시지
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    최근 수정일
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                    관리
                  </th>
                </tr>
              </thead>

              {/* 테이블 바디 */}
              <tbody className="divide-y divide-slate-100">
                {rules.map((rule) => (
                  <tr
                    key={rule.id}
                    // 💡 차단된 상태면 행 전체 배경을 옅은 빨간색으로 변경하여 경각심 부여
                    className={`transition-colors ${
                      rule.isActive
                        ? "hover:bg-slate-50/80"
                        : "bg-rose-50/40 hover:bg-rose-50/60"
                    }`}
                  >
                    {/* 1. 상태 토글 버튼 */}
                    <td className="px-6 py-4 whitespace-nowrap align-middle">
                      <button
                        onClick={() => handleToggleActive(rule)}
                        // 💡 1. border-transparent를 없애고, items-center를 주어 자식을 수직 중앙에 자동 정렬합니다.
                        // 💡 2. 비활성 색상을 slate-400 -> slate-500으로 한 톤 짙게 하여 흰색 손잡이와의 대비(Contrast)를 높였습니다.
                        className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 shadow-inner ${
                          rule.isActive ? "bg-emerald-500" : "bg-slate-500"
                        }`}
                      >
                        <span
                          // 💡 3. absolute 대신 flex 위치 이동(translate)만으로 좌우를 조절하여 픽셀 뭉개짐을 원천 차단했습니다.
                          // 💡 4. ring 대신 확실한 border border-slate-200을 주어 동그라미의 외곽선을 칼같이 잘라냈습니다.
                          className={`pointer-events-none flex h-6 w-6 transform items-center justify-center rounded-full bg-white shadow border border-slate-200 transition-transform duration-300 ease-in-out ${
                            rule.isActive ? "translate-x-7" : "translate-x-1"
                          }`}
                        >
                          {rule.isActive ? (
                            // 💡 5. 아이콘 굵기를 키우고 색상을 살짝 짙게 하여 또렷하게 보이게 합니다.
                            <i className="bx bx-check text-emerald-600 text-base font-black"></i>
                          ) : (
                            <i className="bx bx-lock-alt text-slate-600 text-sm font-bold"></i>
                          )}
                        </span>
                      </button>
                    </td>

                    {/* 2. 경로 및 Active/Blocked 뱃지 */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-base font-bold text-slate-800">
                          {rule.path}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide whitespace-nowrap ${
                            rule.isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {rule.isActive ? "Active" : "Blocked"}
                        </span>
                      </div>
                    </td>

                    {/* 3. 안내 메시지 (말줄임표 처리) */}
                    <td className="px-6 py-4">
                      <div className="max-w-xs md:max-w-sm lg:max-w-md truncate">
                        {rule.isActive ? (
                          <p className="text-sm text-slate-500 flex items-center gap-1.5 truncate">
                            <i className="bx bx-globe text-slate-400"></i> 정상
                            서비스 중
                          </p>
                        ) : (
                          <p className="text-sm text-rose-600 font-medium flex items-center gap-1.5 truncate">
                            <i className="bx bx-error-circle"></i>{" "}
                            {rule.message}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* 4. 최근 수정일 (하이드레이션 방어) */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        suppressHydrationWarning
                        className="text-sm font-medium text-slate-400"
                      >
                        {new Intl.DateTimeFormat("ko-KR", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(rule.updatedAt))}
                      </span>
                    </td>

                    {/* 5. 액션 버튼 (수정/삭제) */}
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!rule.isActive && (
                          <button
                            onClick={() => {
                              setEditingRule(rule);
                              setEditMessage(rule.message);
                            }}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                            title="사유 수정"
                          >
                            <i className="bx bx-edit text-xl"></i>
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(rule.id, rule.path)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                          title="삭제"
                        >
                          <i className="bx bx-trash text-xl"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* 규칙이 없을 때 보여줄 UI */}
                {rules.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-16 text-center">
                      <i className="bx bx-shield-x text-5xl text-slate-300 mb-3"></i>
                      <p className="text-slate-500 font-medium">
                        등록된 접근 제어 규칙이 없습니다.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {rules.length === 0 && (
          <div className="py-16 text-center bg-white border border-slate-200 rounded-[20px]">
            <i className="bx bx-shield-x text-5xl text-slate-300 mb-3"></i>
            <p className="text-slate-500 font-medium">
              등록된 접근 제어 규칙이 없습니다.
            </p>
          </div>
        )}
      </div>

      {/* 💡 1. 경로 추가 모달 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[24px] shadow-xl w-full max-w-md p-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800">
                모니터링 경로 추가
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <i className="bx bx-x text-2xl"></i>
              </button>
            </div>

            <form onSubmit={handleAddRule}>
              <label className="block text-xs font-bold text-slate-500 mb-2">
                URL 경로
              </label>
              <input
                required
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 outline-none font-mono"
                placeholder="/admin/settings"
              />
              <p className="mt-2 text-xs text-slate-400 flex items-center gap-1">
                <i className="bx bx-info-circle"></i> 하위 경로까지 모두
                적용됩니다.
              </p>

              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 transition-colors"
                >
                  추가 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 💡 2. 차단 사유 작성/수정 모달 */}
      {editingRule && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[24px] shadow-xl w-full max-w-md p-8 animate-in fade-in zoom-in-95 duration-200 border-t-8 border-t-rose-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-500">
                <i className="bx bx-lock-alt text-xl"></i>
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800">
                  접근 차단 설정
                </h3>
                <p className="text-sm text-slate-500 font-mono">
                  {editingRule.path}
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveBlockMessage}>
              <label className="block text-xs font-bold text-slate-500 mb-2">
                차단 안내 사유 (사용자에게 표시됨)
              </label>
              <textarea
                required
                value={editMessage}
                onChange={(e) => setEditMessage(e.target.value)}
                rows={3}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-rose-500 outline-none resize-none"
                placeholder="예: 현재 PG사 연동으로 인한 시스템 점검 중입니다."
              />

              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingRule(null)}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-rose-500 hover:bg-rose-600 transition-colors flex items-center justify-center gap-2"
                >
                  <i className="bx bx-shield-x text-lg"></i> 차단 적용
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
