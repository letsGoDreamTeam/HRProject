"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/hr/api-error";
import { interviewerInviteApi } from "@/lib/hr/interviewer-invites.client";
import type { HrInterviewer } from "@/types/interviewer";
import type { Position } from "@/types/position";
import InterviewerMailComposerModal from "./InterviewerMailComposerModal";

interface InterviewerCommunicationClientProps {
  interviewers: HrInterviewer[];
  positions: Position[];
}

const DEFAULT_INVITE_EXPIRES_DAYS = 7;

function expiresInDaysFromIso(
  expiresAt: string,
  fallback = DEFAULT_INVITE_EXPIRES_DAYS,
) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return fallback;
  return Math.min(30, Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24))));
}

export default function InterviewerCommunicationClient({
  interviewers,
  positions,
}: InterviewerCommunicationClientProps) {
  const [search, setSearch] = useState("");
  const [positionId, setPositionId] = useState<number | "ALL">("ALL");
  const [selectedInterviewer, setSelectedInterviewer] =
    useState<HrInterviewer | null>(null);
  const [isMailOpen, setIsMailOpen] = useState(false);
  const [pendingInviteUrl, setPendingInviteUrl] = useState<string | null>(null);
  const [pendingExpiresInDays, setPendingExpiresInDays] = useState(
    DEFAULT_INVITE_EXPIRES_DAYS,
  );
  const [inviteReused, setInviteReused] = useState(false);
  const [openingMailForId, setOpeningMailForId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return interviewers.filter((interviewer) => {
      const matchesSearch =
        !query ||
        [
          interviewer.interviewerName,
          interviewer.interviewerEmail,
          interviewer.positionName ?? "",
          interviewer.interviewRound ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      const matchesPosition =
        positionId === "ALL" || interviewer.positionId === positionId;

      return matchesSearch && matchesPosition;
    });
  }, [interviewers, positionId, search]);

  const closeMailModal = () => {
    setIsMailOpen(false);
    setSelectedInterviewer(null);
    setPendingInviteUrl(null);
    setInviteReused(false);
    setPendingExpiresInDays(DEFAULT_INVITE_EXPIRES_DAYS);
  };

  const handleOpenMail = async (interviewer: HrInterviewer) => {
    setOpeningMailForId(interviewer.interviewerId);
    try {
      const invite = await interviewerInviteApi.ensureInvite({
        interviewerId: interviewer.interviewerId,
        expiresInDays: DEFAULT_INVITE_EXPIRES_DAYS,
      });

      setSelectedInterviewer(interviewer);
      setPendingInviteUrl(invite.inviteUrl);
      setPendingExpiresInDays(expiresInDaysFromIso(invite.expiresAt));
      setInviteReused(Boolean(invite.reused));
      setIsMailOpen(true);

      if (invite.reused) {
        toast.info("유효한 기존 초대 링크를 불러왔습니다.");
      } else {
        toast.success("새 초대 링크를 생성했습니다.");
      }
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "초대 링크를 준비하지 못했습니다."),
      );
    } finally {
      setOpeningMailForId(null);
    }
  };

  return (
    <>
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_13rem]">
            <label className="relative">
              <i className="bx bx-search pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="이름, 이메일, 직무, 차수 검색"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
              />
            </label>

            <label className="relative">
              <i className="bx bx-briefcase-alt pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={positionId}
                onChange={(event) =>
                  setPositionId(
                    event.target.value === "ALL"
                      ? "ALL"
                      : Number(event.target.value),
                  )
                }
                className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="ALL">전체 직무</option>
                {positions.map((position) => (
                  <option key={position.positionId} value={position.positionId}>
                    {position.positionName}
                  </option>
                ))}
              </select>
              <i className="bx bx-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/hr/interviewers"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-100"
            >
              <i className="bx bx-arrow-back text-lg" />
              면접관 목록으로
            </Link>
            <Link
              href="/hr/email-templates"
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-indigo-700"
            >
              <i className="bx bx-envelope text-lg" />
              템플릿 관리
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-[28px] border-2 border-slate-300/80 bg-white shadow-md ring-1 ring-slate-900/3">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <p className="text-sm font-black text-slate-900">
                커뮤니케이션 대상 면접관
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                총 {filtered.length}명
              </p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <i className="bx bx-user-voice text-3xl" />
              </div>
              <p className="mt-4 text-sm font-black text-slate-700">
                조건에 맞는 면접관이 없습니다.
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                검색어나 직무 필터를 바꿔 다시 확인해보세요.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3 p-4 sm:p-5">
              {filtered.map((interviewer) => {
                const isOpening =
                  openingMailForId === interviewer.interviewerId;

                return (
                  <li
                    key={interviewer.interviewerId}
                    className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-black text-slate-900">
                            {interviewer.interviewerName}
                          </p>
                          {interviewer.interviewRound ? (
                            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-600">
                              {interviewer.interviewRound}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm font-semibold text-slate-500">
                          {interviewer.interviewerEmail}
                        </p>
                        <p className="text-sm font-bold text-slate-700">
                          {interviewer.positionName || "직무 미지정"}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleOpenMail(interviewer)}
                        disabled={isOpening}
                        className="inline-flex items-center justify-center gap-2 self-start rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60 lg:self-auto"
                      >
                        <i
                          className={`bx ${
                            isOpening ? "bx-loader-alt animate-spin" : "bx-send"
                          } text-lg`}
                        />
                        면접관 메일 보내기
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/90 p-5 shadow-none sm:p-6">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-500">
              Workflow
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-900">
              권장 운영 흐름
            </h2>
            <ol className="mt-4 space-y-3 text-sm font-semibold leading-6 text-slate-600">
              <li>1. 면접관을 선택하고 「면접관 메일 보내기」를 누릅니다.</li>
              <li>
                2. 유효한 초대 링크가 있으면 자동으로 불러오고, 없으면 새로
                생성합니다.
              </li>
              <li>3. 템플릿을 적용해 제목·본문을 확인합니다.</li>
              <li>4. 메일을 발송합니다.</li>
            </ol>
          </div>

          <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/90 p-5 shadow-none sm:p-6">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-500">
              Coverage
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-900">
              현재 연결된 기능
            </h2>
            <ul className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
              <li>활성 초대 링크 자동 재사용</li>
              <li>면접관 메일 발송 API 연결</li>
              <li>이메일 템플릿 재사용 연결</li>
              <li>Interviewer 초대 수락 페이지 연결</li>
            </ul>
          </div>
        </aside>
      </section>

      <InterviewerMailComposerModal
        isOpen={isMailOpen}
        onClose={closeMailModal}
        interviewer={selectedInterviewer}
        allInterviewers={interviewers}
        initialInviteUrl={pendingInviteUrl}
        initialExpiresInDays={pendingExpiresInDays}
        inviteReused={inviteReused}
      />
    </>
  );
}
