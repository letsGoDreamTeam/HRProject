"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { addMonths, format, isSameMonth, parseISO, startOfMonth, subMonths } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import ScheduleBookingModal, {
  type ScheduleBookingModalTab,
} from "@/components/hr/dashboard/ScheduleBookingModal";
import { ScheduleActionsSidebar } from "@/components/hr/schedule/ScheduleActionsSidebar";
import { ScheduleCalendarPanel } from "@/components/hr/schedule/ScheduleCalendarPanel";
import { ScheduleDayPanel } from "@/components/hr/schedule/ScheduleDayPanel";
import { ScheduleSlotDetailModal } from "@/components/hr/schedule/ScheduleSlotDetailModal";
import { ScheduleSlotEditorPanel } from "@/components/hr/schedule/ScheduleSlotEditorPanel";
import {
  getMonthCalendarDays,
  getWeekCalendarDays,
  shiftWeekAnchor,
} from "@/components/hr/schedule/dateGridUtils";
import type {
  ScheduleCalendarViewMode,
  ScheduleClientInitialData,
  ScheduleSlotFormMode,
  ScheduleSlotFormState,
} from "@/components/hr/schedule/types";
import { interviewSlotsApi } from "@/lib/hr/interview-slots.client";
import type {
  InterviewRoundWrite,
  InterviewSlotCreatePayload,
  InterviewSlotDetailItem,
  InterviewSlotListItem,
  InterviewSlotUpdatePayload,
} from "@/types/interviewSlotWrite";

type ScheduleClientProps = ScheduleClientInitialData;

const defaultForm = (date: Date): ScheduleSlotFormState => ({
  positionId: "",
  interviewRound: "1차",
  interviewerIds: [],
  interviewDate: format(date, "yyyy-MM-dd"),
  interviewStartTime: "10:00",
  interviewEndTime: "10:30",
  interviewLocation: "",
  capacity: "1",
});

const toLocalTime = (isoString: string) => format(parseISO(isoString), "HH:mm");
const toLocalDate = (isoString: string) =>
  format(parseISO(isoString), "yyyy-MM-dd");

const getErrorMessage = (error: unknown, fallback: string) => {
  const maybe = error as {
    response?: { data?: { message?: string; detail?: string } };
  };
  return maybe.response?.data?.message || maybe.response?.data?.detail || fallback;
};

const getStatusMeta = (status: string) => {
  if (status === "open") {
    return {
      label: "예약 가능",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    };
  }
  if (status === "full") {
    return {
      label: "정원 마감",
      className: "bg-amber-50 text-amber-700 ring-amber-100",
    };
  }
  return {
    label: "마감",
    className: "bg-slate-100 text-slate-500 ring-slate-200",
  };
};

export default function ScheduleClient({
  initialSlots,
  initialPositions,
  initialApplicants,
  initialInterviewers,
  initialEmailTemplates,
  initialMonth,
}: ScheduleClientProps) {
  const [monthCursor, setMonthCursor] = useState(() =>
    parseISO(`${initialMonth}-01`),
  );
  const [weekAnchor, setWeekAnchor] = useState(() =>
    parseISO(`${initialMonth}-01`),
  );
  const [viewMode, setViewMode] = useState<ScheduleCalendarViewMode>("month");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [slots, setSlots] = useState<InterviewSlotListItem[]>(initialSlots);
  const [selectedSlotIds, setSelectedSlotIds] = useState<number[]>([]);
  const [primarySlotDetail, setPrimarySlotDetail] =
    useState<InterviewSlotDetailItem | null>(null);
  const [isPrimaryDetailLoading, setIsPrimaryDetailLoading] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailModalSlot, setDetailModalSlot] =
    useState<InterviewSlotDetailItem | null>(null);
  const [isDetailModalLoading, setIsDetailModalLoading] = useState(false);
  const [dayPanelMinimized, setDayPanelMinimized] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(true);
  const [formMode, setFormMode] = useState<ScheduleSlotFormMode>("create");
  const [form, setForm] = useState<ScheduleSlotFormState>(() =>
    defaultForm(new Date()),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingModalTab, setBookingModalTab] =
    useState<ScheduleBookingModalTab>("slots");
  const [modalInterviewDateSeed, setModalInterviewDateSeed] = useState<
    string | undefined
  >(undefined);
  const monthGridDays = useMemo(
    () => getMonthCalendarDays(monthCursor),
    [monthCursor],
  );
  const weekGridDays = useMemo(
    () => getWeekCalendarDays(weekAnchor),
    [weekAnchor],
  );
  const gridDays = viewMode === "month" ? monthGridDays : weekGridDays;
  const displayMonth = viewMode === "month" ? monthCursor : weekAnchor;

  const slotsByDate = useMemo(() => {
    return slots.reduce<Record<string, InterviewSlotListItem[]>>((acc, slot) => {
      const key = toLocalDate(slot.interviewStartsAt);
      acc[key] = [...(acc[key] ?? []), slot];
      return acc;
    }, {});
  }, [slots]);

  const selectedDayKey = format(selectedDate, "yyyy-MM-dd");
  const selectedDaySlots = useMemo(
    () =>
      [...(slotsByDate[selectedDayKey] ?? [])].sort(
        (a, b) =>
          parseISO(a.interviewStartsAt).getTime() -
          parseISO(b.interviewStartsAt).getTime(),
      ),
    [selectedDayKey, slotsByDate],
  );

  const selectedIdsKey = selectedSlotIds.join(",");

  useEffect(() => {
    if (selectedSlotIds.length !== 1) {
      setPrimarySlotDetail(null);
      setIsPrimaryDetailLoading(false);
      return;
    }
    const id = selectedSlotIds[0];
    let ignore = false;
    setIsPrimaryDetailLoading(true);
    interviewSlotsApi
      .fetchSlotDetail(id)
      .then((detail) => {
        if (!ignore) setPrimarySlotDetail(detail);
      })
      .catch((error) => {
        if (!ignore) {
          toast.error(getErrorMessage(error, "면접 일정 상세를 불러오지 못했습니다."));
          setPrimarySlotDetail(null);
        }
      })
      .finally(() => {
        if (!ignore) setIsPrimaryDetailLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [selectedIdsKey]);

  const filteredInterviewers = useMemo(() => {
    const positionId = Number(form.positionId);
    return initialInterviewers.filter((interviewer) => {
      const positionMatched =
        !positionId || interviewer.positionId === positionId;
      const roundMatched = interviewer.interviewRound === form.interviewRound;
      return positionMatched && roundMatched;
    });
  }, [form.interviewRound, form.positionId, initialInterviewers]);

  const calendarHeaderTitle = useMemo(() => {
    if (viewMode === "month") {
      return format(monthCursor, "yyyy년 M월", { locale: ko });
    }
    const start = weekGridDays[0];
    const end = weekGridDays[6];
    if (!start || !end) return "";
    return `${format(start, "M/d (EEE)", { locale: ko })} — ${format(end, "M/d (EEE)", { locale: ko })}`;
  }, [viewMode, monthCursor, weekGridDays]);

  const refreshSlots = useCallback(
    async (targetMonth = monthCursor) => {
      setIsLoading(true);
      try {
        const rows = await interviewSlotsApi.fetchSlots({
          year: targetMonth.getFullYear(),
          month: targetMonth.getMonth() + 1,
        });
        setSlots(rows);
      } catch (error) {
        toast.error(getErrorMessage(error, "면접 일정을 다시 불러오지 못했습니다."));
      } finally {
        setIsLoading(false);
      }
    },
    [monthCursor],
  );

  const handleViewModeChange = (mode: ScheduleCalendarViewMode) => {
    setViewMode(mode);
    if (mode === "week") {
      const anchor = selectedDate;
      setWeekAnchor(anchor);
      void refreshSlots(startOfMonth(anchor));
    } else {
      void refreshSlots(monthCursor);
    }
  };

  const moveMonth = async (direction: "prev" | "next") => {
    const nextMonth =
      direction === "prev" ? subMonths(monthCursor, 1) : addMonths(monthCursor, 1);
    setMonthCursor(nextMonth);
    setSelectedDate(startOfMonth(nextMonth));
    setWeekAnchor(startOfMonth(nextMonth));
    setSelectedSlotIds([]);
    await refreshSlots(nextMonth);
  };

  const moveWeek = async (direction: "prev" | "next") => {
    const nextAnchor = shiftWeekAnchor(weekAnchor, direction);
    setWeekAnchor(nextAnchor);
    setSelectedDate((d) => shiftWeekAnchor(d, direction));
    setSelectedSlotIds([]);
    await refreshSlots(startOfMonth(nextAnchor));
  };

  const handleSelectCalendarDate = (day: Date) => {
    setSelectedDate(day);
    setWeekAnchor(day);
    setDayPanelMinimized(false);
    setSelectedSlotIds([]);
    setForm((prev) => ({
      ...prev,
      interviewDate: format(day, "yyyy-MM-dd"),
    }));
    if (!isSameMonth(day, monthCursor)) {
      const m = startOfMonth(day);
      setMonthCursor(m);
      void refreshSlots(m);
    }
  };

  const toggleSlotSelection = (slotId: number) => {
    setSelectedSlotIds((prev) =>
      prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId],
    );
  };

  const clearSlotSelection = () => {
    setSelectedSlotIds([]);
  };

  const openSlotDetail = async (slot: InterviewSlotListItem) => {
    setIsDetailModalLoading(true);
    try {
      const detail = await interviewSlotsApi.fetchSlotDetail(slot.slotId);
      setDetailModalSlot(detail);
      setDetailModalOpen(true);
    } catch (error) {
      toast.error(getErrorMessage(error, "면접 일정 상세를 불러오지 못했습니다."));
    } finally {
      setIsDetailModalLoading(false);
    }
  };

  const handleDetailSlotMutated = async (slotId: number) => {
    await refreshSlots();
    try {
      const d = await interviewSlotsApi.fetchSlotDetail(slotId);
      setDetailModalSlot(d);
    } catch {
      /* 목록은 이미 갱신됨 */
    }
  };

  const inferPositionId = (slot: InterviewSlotDetailItem) => {
    const matched = initialPositions.find(
      (position) => position.positionName === slot.positionName,
    );
    return matched ? String(matched.positionId) : "";
  };

  const inferInterviewerIds = (slot: InterviewSlotDetailItem) =>
    initialInterviewers
      .filter((interviewer) =>
        slot.interviewerNames.includes(interviewer.interviewerName),
      )
      .map((interviewer) => interviewer.interviewerId);

  const applyDetailToEditForm = (detail: InterviewSlotDetailItem) => {
    setFormMode("edit");
    setForm({
      positionId: inferPositionId(detail),
      interviewRound: detail.interviewRound as InterviewRoundWrite,
      interviewerIds: inferInterviewerIds(detail),
      interviewDate: toLocalDate(detail.interviewStartsAt),
      interviewStartTime: toLocalTime(detail.interviewStartsAt),
      interviewEndTime: toLocalTime(detail.interviewEndsAt),
      interviewLocation: detail.interviewLocation ?? "",
      capacity: String(
        detail.remainingCapacity + detail.bookedCandidateNames.length,
      ),
    });
  };

  const startCreate = () => {
    setFormMode("create");
    setForm(defaultForm(selectedDate));
  };

  const startEditForSelectedSlot = async () => {
    if (selectedSlotIds.length !== 1) return;
    const slotId = selectedSlotIds[0];
    if (primarySlotDetail?.slotId === slotId) {
      applyDetailToEditForm(primarySlotDetail);
      return;
    }
    setIsPrimaryDetailLoading(true);
    try {
      const detail = await interviewSlotsApi.fetchSlotDetail(slotId);
      setPrimarySlotDetail(detail);
      applyDetailToEditForm(detail);
    } catch (error) {
      toast.error(getErrorMessage(error, "면접 일정 상세를 불러오지 못했습니다."));
    } finally {
      setIsPrimaryDetailLoading(false);
    }
  };

  const openEditFromDetailModal = (detail: InterviewSlotDetailItem) => {
    setDetailModalOpen(false);
    setDetailModalSlot(null);
    setSelectedSlotIds([detail.slotId]);
    setPrimarySlotDetail(detail);
    applyDetailToEditForm(detail);
    setDayPanelMinimized(false);
  };

  const updateForm = <K extends keyof ScheduleSlotFormState>(
    key: K,
    value: ScheduleSlotFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleInterviewer = (interviewerId: number) => {
    setForm((prev) => ({
      ...prev,
      interviewerIds: prev.interviewerIds.includes(interviewerId)
        ? prev.interviewerIds.filter((id) => id !== interviewerId)
        : [...prev.interviewerIds, interviewerId],
    }));
  };

  const buildCreatePayload = (): InterviewSlotCreatePayload => ({
    positionId: Number(form.positionId),
    interviewRound: form.interviewRound,
    interviewerIds: form.interviewerIds,
    interviewDate: form.interviewDate,
    interviewStartTime: form.interviewStartTime,
    interviewEndTime: form.interviewEndTime,
    interviewLocation: form.interviewLocation.trim(),
    capacity: Number(form.capacity),
  });

  const buildUpdatePayload = (): InterviewSlotUpdatePayload => ({
    ...(form.positionId ? { positionId: Number(form.positionId) } : {}),
    interviewRound: form.interviewRound,
    interviewerIds: form.interviewerIds,
    interviewDate: form.interviewDate,
    interviewStartTime: form.interviewStartTime,
    interviewEndTime: form.interviewEndTime,
    interviewLocation: form.interviewLocation.trim(),
    capacity: Number(form.capacity),
  });

  const submitSlot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      if (formMode === "edit" && primarySlotDetail) {
        const slotId = primarySlotDetail.slotId;
        await interviewSlotsApi.updateSlot(slotId, buildUpdatePayload());
        toast.success("면접 일정이 수정되었습니다.");
        const anchor = parseISO(`${form.interviewDate}T12:00:00`);
        const monthStart = startOfMonth(anchor);
        setMonthCursor(monthStart);
        setWeekAnchor(anchor);
        setSelectedDate(anchor);
        await refreshSlots(monthStart);
        const fresh = await interviewSlotsApi.fetchSlotDetail(slotId);
        setPrimarySlotDetail(fresh);
        setSelectedSlotIds([slotId]);
        setFormMode("create");
        setForm(defaultForm(anchor));
        setDayPanelMinimized(false);
      } else {
        await interviewSlotsApi.createSlot(buildCreatePayload());
        toast.success("면접 일정이 생성되었습니다.");
        await refreshSlots();
        setSelectedSlotIds([]);
        startCreate();
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "면접 일정 저장 중 오류가 발생했습니다."));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSelectedSlots = async () => {
    if (selectedSlotIds.length === 0) return;
    setIsSaving(true);
    try {
      await Promise.all(
        selectedSlotIds.map((id) => interviewSlotsApi.deleteSlot(id)),
      );
      toast.success(
        selectedSlotIds.length > 1
          ? `${selectedSlotIds.length}건의 면접 일정이 삭제되었습니다.`
          : "면접 일정이 삭제되었습니다.",
      );
      setSelectedSlotIds([]);
      startCreate();
      await refreshSlots();
    } catch (error) {
      toast.error(getErrorMessage(error, "면접 일정 삭제 중 오류가 발생했습니다."));
    } finally {
      setIsSaving(false);
    }
  };

  const openScheduleModal = (tab: ScheduleBookingModalTab) => {
    setBookingModalTab(tab);
    setModalInterviewDateSeed(format(selectedDate, "yyyy-MM-dd"));
    setBookingModalOpen(true);
  };
  const navPrev = () => {
    if (viewMode === "month") void moveMonth("prev");
    else void moveWeek("prev");
  };

  const navNext = () => {
    if (viewMode === "month") void moveMonth("next");
    else void moveWeek("next");
  };

  const slotEditorOpen =
    formMode === "edit" && Boolean(primarySlotDetail) && selectedSlotIds.length === 1;

  return (
    <>
      <div className="min-h-screen bg-linear-to-b from-slate-50 to-white px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 lg:gap-8">
        <header className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-black/4 sm:flex-row sm:items-end sm:p-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              HR · Schedule
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
              면접 일정 관리
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
              날짜를 고르면 Day 패널이 항상 펼쳐지며(최소화 중이어도), Esc로 최소화할 수
              있습니다. 다른 모달이 열려 있을 때는 Esc가 그 모달에만 적용됩니다.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] xl:items-start xl:gap-8">
          <div
            className={`flex min-w-0 flex-col gap-5 lg:gap-6 ${
              selectedDaySlots.length > 0 && dayPanelMinimized ? "pb-28 sm:pb-32" : ""
            }`}
          >
            <ScheduleCalendarPanel
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              calendarOpen={calendarOpen}
              onToggleCalendarOpen={() => setCalendarOpen((v) => !v)}
              headerTitle={calendarHeaderTitle}
              onNavigatePrev={navPrev}
              onNavigateNext={navNext}
              gridDays={gridDays}
              displayMonth={displayMonth}
              selectedDate={selectedDate}
              onSelectDate={handleSelectCalendarDate}
              slotsByDate={slotsByDate}
            />
            <ScheduleDayPanel
              selectedDate={selectedDate}
              selectedDaySlots={selectedDaySlots}
              selectedSlotIds={selectedSlotIds}
              onToggleSlotSelection={toggleSlotSelection}
              onClearSlotSelection={clearSlotSelection}
              primarySlotDetail={primarySlotDetail}
              isPrimaryDetailLoading={isPrimaryDetailLoading}
              getStatusMeta={getStatusMeta}
              toLocalTime={toLocalTime}
              onStartEdit={() => void startEditForSelectedSlot()}
              onDeleteSelected={deleteSelectedSlots}
              onOpenSlotDetail={openSlotDetail}
              onStartCreate={startCreate}
              isSaving={isSaving}
              isDetailModalLoading={isDetailModalLoading}
              isMinimized={dayPanelMinimized}
              onMinimize={() => setDayPanelMinimized(true)}
              onExpandFromFab={() => setDayPanelMinimized(false)}
              enableEscapeToMinimize={
                !detailModalOpen && !bookingModalOpen && !slotEditorOpen
              }
            />
          </div>

          <ScheduleActionsSidebar
            isLoading={isLoading}
            onRefresh={() => void refreshSlots()}
            onOpenBulkScheduleModal={() => openScheduleModal("slots")}
            onOpenInvitationModal={() => openScheduleModal("booking")}
          />
        </div>
      </div>
      </div>

      <ScheduleSlotEditorPanel
        isOpen={slotEditorOpen}
        onClose={() => startCreate()}
        form={form}
        formMode={formMode}
        positions={initialPositions}
        filteredInterviewers={filteredInterviewers}
        isSaving={isSaving}
        onSubmit={submitSlot}
        onStartCreate={startCreate}
        onUpdateForm={updateForm}
        onToggleInterviewer={toggleInterviewer}
      />

      <ScheduleBookingModal
        isOpen={bookingModalOpen}
        applicants={initialApplicants}
        emailTemplates={initialEmailTemplates}
        initialMainTab={bookingModalTab}
        initialInterviewDate={modalInterviewDateSeed}
        onClose={() => {
          setBookingModalOpen(false);
          setModalInterviewDateSeed(undefined);
          void refreshSlots();
        }}
      />

      <ScheduleSlotDetailModal
        isOpen={detailModalOpen}
        slot={detailModalSlot}
        onClose={() => {
          setDetailModalOpen(false);
          setDetailModalSlot(null);
        }}
        getStatusMeta={getStatusMeta}
        positions={initialPositions}
        applicants={initialApplicants}
        onSlotMutated={handleDetailSlotMutated}
        onEditSlot={openEditFromDetailModal}
      />
    </>
  );
}
