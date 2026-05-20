"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import useAuthStore from "@/lib/stores/auth";
import { getApiErrorMessage } from "@/lib/hr/api-error";
import { interviewerInviteApi } from "@/lib/hr/interviewer-invites.client";
import { question } from "@/lib/interviewer/questions";
import InviteAcceptResultCard from "./InviteAcceptResultCard";

interface InterviewerInviteAcceptClientProps {
  initialToken?: string;
}

interface NextStepCard {
  title: string;
  description: string;
  href: string;
  icon: string;
}

const SUCCESS_NEXT_STEPS: readonly NextStepCard[] = [
  {
    title: "질문 생성 화면 이동",
    description: "인터뷰어 전용 AI 질문 생성 도구를 사용합니다.",
    href: "/interviewer",
    icon: "brain",
  },
  {
    title: "프로필 확인",
    description: "수락된 계정으로 로그인 상태가 유지됩니다.",
    href: "/interviewer",
    icon: "user-check",
  },
  {
    title: "도움이 필요할 때",
    description: "초대 메일을 보낸 HR 담당자에게 문의하세요.",
    href: "mailto:hr@company.com",
    icon: "support",
  },
];

export default function InterviewerInviteAcceptClient({
  initialToken = "",
}: InterviewerInviteAcceptClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuthStore();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState(
    "초대 링크를 확인한 뒤 수락하면 인터뷰어 전용 화면으로 이동할 수 있습니다.",
  );
  const [interviewerName, setInterviewerName] = useState<string | undefined>();
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);

  const token = useMemo(
    () => initialToken || searchParams.get("token") || "",
    [initialToken, searchParams],
  );

  const handleAccept = async () => {
    if (!token) {
      setStatus("error");
      setMessage("초대 토큰이 없습니다. 올바른 링크로 다시 접속해주세요.");
      return;
    }

    setStatus("loading");
    try {
      const response = await interviewerInviteApi.acceptInvite({ token });
      if (!response.accessToken) {
        throw new Error("초대 수락 응답에 access token이 없습니다.");
      }
      setAuth(response.interviewer.interviewerName, response.accessToken);
      setInterviewerName(response.interviewer.interviewerName);
      setStatus("success");
      setMessage(
        "초대 수락이 완료되었습니다. 이제 인터뷰어 질문 생성 화면으로 이동할 수 있습니다.",
      );
      toast.success("초대 수락이 완료되었습니다.");
    } catch (error) {
      setStatus("error");
      setMessage(
        getApiErrorMessage(
          error,
          "초대 수락에 실패했습니다. 만료되었거나 이미 사용된 링크일 수 있습니다.",
        ),
      );
    }
  };

  const handleCheckAuth = async () => {
    setIsCheckingAuth(true);
    try {
      await question.getActiveGenerationJob();
      toast.success("인증 확인 완료: 면접관 토큰이 유효합니다.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "인증 확인에 실패했습니다."));
    } finally {
      setIsCheckingAuth(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-10">
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-br from-white via-sky-50/60 to-indigo-50/40 p-6 shadow-sm sm:p-8">
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sky-300/15 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <p className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-sky-700">
              <i className="bx bx-user-check text-sm" />
              Interviewer Invite
            </p>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">
                면접관 초대 수락
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">
                이메일로 받은 초대 링크를 확인하고 계정을 활성화하세요. 수락이
                끝나면 인터뷰어 전용 질문 생성 화면으로 바로 이동할 수 있습니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={status === "loading"}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            <i
              className={`bx ${
                status === "loading" ? "bx-loader-alt animate-spin" : "bx-check"
              } text-lg`}
            />
            초대 수락하기
          </button>
        </div>
      </section>

      <InviteAcceptResultCard
        status={status}
        title={
          status === "success"
            ? "초대 수락 완료"
            : status === "error"
              ? "초대 수락 실패"
              : status === "loading"
                ? "초대 수락 처리 중"
                : "초대 링크 확인"
        }
        description={message}
        interviewerName={interviewerName}
        actionHref={status === "success" ? "/interviewer" : undefined}
        actionLabel={status === "success" ? "Interviewer 화면으로 이동" : undefined}
      />

      {status === "success" ? (
        <section className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">
            다음 단계
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {SUCCESS_NEXT_STEPS.map((step) => (
              <Link
                key={step.title}
                href={step.href}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <i className={`bx bx-${step.icon} text-xl`} />
                </span>
                <h3 className="mt-3 text-sm font-black text-slate-900">
                  {step.title}
                </h3>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  {step.description}
                </p>
              </Link>
            ))}
          </div>
          <div className="flex justify-center pt-2">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void handleCheckAuth()}
                disabled={isCheckingAuth}
                className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-black text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-60"
              >
                <i
                  className={`bx ${
                    isCheckingAuth
                      ? "bx-loader-alt animate-spin"
                      : "bx-shield-quarter"
                  } text-lg`}
                />
                인증 확인
              </button>
              <button
                type="button"
                onClick={() => router.push("/interviewer")}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-indigo-700"
              >
                <i className="bx bx-right-arrow-alt text-lg" />
                바로 이동
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {status === "error" ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-rose-100 bg-rose-50/80 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-rose-800">링크가 만료되었나요?</p>
            <p className="mt-1 text-sm font-semibold text-rose-700/90">
              HR 담당자에게 새 초대 메일을 요청하거나 아래 방법으로 문의하세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="mailto:hr@company.com?subject=면접관%20초대%20링크%20재요청"
              className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-black text-rose-700 transition hover:bg-rose-100"
            >
              <i className="bx bx-envelope text-lg" />
              HR에 문의하기
            </a>
            <button
              type="button"
              onClick={() => void handleAccept()}
              className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-rose-700"
            >
              <i className="bx bx-refresh text-lg" />
              다시 시도
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
