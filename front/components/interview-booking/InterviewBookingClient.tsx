"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { AvailableInterviewSlot } from "@/types/interviewBooking";
import { interviewBookingInvitationApi } from "@/lib/hr/interview-booking-invitations.client";

const getErrorMessage = (error: unknown, fallback: string) => {
  const maybe = error as {
    response?: { data?: { message?: string; detail?: string } };
  };
  return maybe.response?.data?.message || maybe.response?.data?.detail || fallback;
};

const createMockSlots = (): AvailableInterviewSlot[] => {
  const base = new Date();
  base.setHours(10, 0, 0, 0);

  return [
    {
      slotId: 9001,
      interviewRound: "1차",
      interviewStartsAt: base.toISOString(),
      interviewEndsAt: new Date(base.getTime() + 30 * 60 * 1000).toISOString(),
      interviewLocation: "본사 3층 회의실 A",
      remainingCapacity: 3,
      interviewerNames: ["Mock Interviewer A"],
    },
    {
      slotId: 9002,
      interviewRound: "1차",
      interviewStartsAt: new Date(
        base.getTime() + 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
      ).toISOString(),
      interviewEndsAt: new Date(
        base.getTime() + 24 * 60 * 60 * 1000 + 150 * 60 * 1000,
      ).toISOString(),
      interviewLocation: "온라인 Zoom",
      remainingCapacity: 1,
      interviewerNames: ["Mock Interviewer B"],
    },
    {
      slotId: 9003,
      interviewRound: "2차",
      interviewStartsAt: new Date(
        base.getTime() + 2 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000,
      ).toISOString(),
      interviewEndsAt: new Date(
        base.getTime() + 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000,
      ).toISOString(),
      interviewLocation: "본사 5층 대회의실",
      remainingCapacity: 2,
      interviewerNames: ["Mock Interviewer C"],
    },
  ];
};

const canUseMockSlots = () => {
  if (process.env.NEXT_PUBLIC_ENABLE_BOOKING_MOCK !== "true") return false;
  if (process.env.NODE_ENV !== "development") return false;
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
};

export default function InterviewBookingClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [slots, setSlots] = useState<AvailableInterviewSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBooking, setIsBooking] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isMockMode, setIsMockMode] = useState(false);

  useEffect(() => {
    const mockEnabled = canUseMockSlots();

    if (!token) {
      if (mockEnabled) {
        const mockSlots = createMockSlots();
        setSlots(mockSlots);
        setSelectedSlotId(mockSlots[0]?.slotId ?? null);
        setIsMockMode(true);
        setErrorMessage("");
        setIsLoading(false);
        return;
      }

      setErrorMessage("초대 링크 토큰이 없습니다.");
      setIsLoading(false);
      return;
    }

    let ignore = false;
    setIsLoading(true);
    setErrorMessage("");
    interviewBookingInvitationApi
      .fetchAvailableSlotsByToken(token)
      .then((rows) => {
        if (ignore) return;
        setSlots(rows);
        setSelectedSlotId(rows.length === 1 ? rows[0].slotId : null);
      })
      .catch((error) => {
        if (ignore) return;
        if (mockEnabled) {
          const mockSlots = createMockSlots();
          setSlots(mockSlots);
          setSelectedSlotId(mockSlots[0]?.slotId ?? null);
          setIsMockMode(true);
          setErrorMessage("");
          toast.info("개발 모드 mock 일정으로 표시합니다.");
          return;
        }

        setSlots([]);
        setErrorMessage(
          getErrorMessage(error, "예약 가능한 면접 일정을 불러오지 못했습니다."),
        );
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [token]);

  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.slotId === selectedSlotId) ?? null,
    [selectedSlotId, slots],
  );

  const submitBooking = async () => {
    if ((!token && !isMockMode) || !selectedSlotId) return;

    setIsBooking(true);
    setErrorMessage("");
    try {
      if (isMockMode) {
        setCompleted(true);
        toast.success("mock 면접 일정 예약이 완료되었습니다.");
        return;
      }

      await interviewBookingInvitationApi.createBookingByToken(token, {
        slotId: selectedSlotId,
      });
      setCompleted(true);
      toast.success("면접 일정 예약이 완료되었습니다.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "면접 일정 예약에 실패했습니다."));
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">
            Interview Booking
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-900">
            면접 가능 시간을 선택해 주세요
          </h1>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
            안내받은 후보 시간 중 참석 가능한 일정을 하나 선택하면 예약이 확정됩니다.
          </p>
          {isMockMode ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
              개발/localhost mock 모드입니다. 실제 초대 링크 없이 화면 흐름을 확인할 수
              있습니다.
            </div>
          ) : null}
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {completed ? (
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex min-h-64 flex-col items-center justify-center text-center"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <i className="bx bx-check text-3xl" />
              </span>
              <h2 className="mt-4 text-xl font-black text-slate-900">
                예약이 완료되었습니다.
              </h2>
              {selectedSlot ? (
                <p className="mt-2 text-sm font-bold text-slate-500">
                  {format(parseISO(selectedSlot.interviewStartsAt), "M월 d일 (EEE) HH:mm", {
                    locale: ko,
                  })}
                </p>
              ) : null}
            </motion.div>
          ) : isLoading ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-slate-500">
              <i className="bx bx-loader-alt animate-spin text-4xl text-indigo-500" />
              <p className="mt-3 text-sm font-bold">일정을 불러오는 중입니다.</p>
            </div>
          ) : errorMessage ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200 bg-rose-50/60 px-5 text-center text-rose-700">
              <i className="bx bx-error-circle text-4xl" />
              <p className="mt-3 text-sm font-black">{errorMessage}</p>
            </div>
          ) : slots.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 text-center text-slate-400">
              <i className="bx bx-calendar-x text-4xl" />
              <p className="mt-3 text-sm font-black">선택 가능한 일정이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {slots.map((slot) => {
                const selected = selectedSlotId === slot.slotId;
                return (
                  <button
                    key={slot.slotId}
                    type="button"
                    onClick={() => setSelectedSlotId(slot.slotId)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      selected
                        ? "border-indigo-400 bg-indigo-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                          {slot.interviewRound}
                        </span>
                        <p className="mt-3 text-base font-black text-slate-900">
                          {format(
                            parseISO(slot.interviewStartsAt),
                            "yyyy년 M월 d일 (EEE) HH:mm",
                            { locale: ko },
                          )}
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-500">
                          {format(parseISO(slot.interviewEndsAt), "HH:mm")} 종료 ·{" "}
                          {slot.interviewLocation ?? "장소 미정"}
                        </p>
                      </div>
                      {selected ? (
                        <i className="bx bxs-check-circle text-2xl text-indigo-600" />
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {!completed && slots.length > 0 ? (
          <button
            type="button"
            onClick={submitBooking}
            disabled={!selectedSlotId || isBooking || (!token && !isMockMode)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 text-sm font-black text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-45"
          >
            <i className={isBooking ? "bx bx-loader-alt animate-spin" : "bx bx-calendar-check"} />
            선택한 일정으로 예약하기
          </button>
        ) : null}
      </div>
    </main>
  );
}
