"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Applicant } from "@/types/applicant";
import { EmailTemplate } from "@/types/emailTemplate";
import { AvailableInterviewSlot } from "@/types/interviewBooking";
import { HrInterviewer } from "@/types/interviewer";
import { Position } from "@/types/position";
import {
  InterviewRoundWrite,
  InterviewSlotCreatePayload,
  InterviewSlotListItem,
} from "@/types/interviewSlotWrite";
import { interviewBookingApi } from "@/lib/hr/interview-bookings.client";
import { interviewBookingInvitationApi } from "@/lib/hr/interview-booking-invitations.client";
import { interviewerApi } from "@/lib/hr/interviewers.client";
import { interviewSlotsApi } from "@/lib/hr/interview-slots.client";
import { positionApi } from "@/lib/hr/positions.client";

export type ScheduleBookingModalTab = "slots" | "booking";

interface ScheduleBookingModalProps {
  isOpen: boolean;
  applicants: Applicant[];
  emailTemplates: EmailTemplate[];
  onClose: () => void;
  /** 모달이 열릴 때 기본 탭 (시간대·슬롯 / 예약 초대) */
  initialMainTab?: ScheduleBookingModalTab;
  /** `yyyy-MM-dd`. 없으면 오늘 날짜로 면접 일(시간대 조회)을 초기화합니다. */
  initialInterviewDate?: string;
}

type ApiError = {
  response?: {
    data?: { detail?: string; message?: string };
  };
};

type SortMode = "candidate_desc" | "docs_passed_desc";

type InvitationResultRow = {
  candidateId: number;
  name: string;
  email?: string | null;
  invitationUrl?: string;
  error?: string;
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  const apiError = error as ApiError;
  return (
    apiError.response?.data?.message ||
    apiError.response?.data?.detail ||
    fallback
  );
};

const todayISODate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const parseTimeToMinutes = (t: string) => {
  const [h, m] = t.split(":").map((x) => Number(x));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
};

const minutesToTimeStr = (total: number) => {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
};

const formatSlotPreview = (date: string, start: string, end: string) => {
  const startShort = start.slice(0, 5);
  const endShort = end.slice(0, 5);
  return `${date} · ${startShort}–${endShort}`;
};

const isDocumentPassed = (a: Applicant) => a.application_status !== "서류";

const rounds: InterviewRoundWrite[] = ["1차", "2차", "3차"];

const canUseInvitationMock = () => {
  if (process.env.NODE_ENV === "development") return true;
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
};

const createMockInvitationSlots = (): AvailableInterviewSlot[] => {
  const base = new Date();
  base.setHours(10, 0, 0, 0);
  return [
    {
      slotId: 9901,
      interviewRound: "1차",
      interviewStartsAt: base.toISOString(),
      interviewEndsAt: new Date(base.getTime() + 30 * 60 * 1000).toISOString(),
      interviewLocation: "본사 3층 회의실 A",
      remainingCapacity: 3,
    },
    {
      slotId: 9902,
      interviewRound: "1차",
      interviewStartsAt: new Date(
        base.getTime() + 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
      ).toISOString(),
      interviewEndsAt: new Date(
        base.getTime() + 24 * 60 * 60 * 1000 + 150 * 60 * 1000,
      ).toISOString(),
      interviewLocation: "온라인 Zoom",
      remainingCapacity: 2,
    },
  ];
};

export default function ScheduleBookingModal({
  isOpen,
  applicants,
  emailTemplates,
  onClose,
  initialMainTab = "slots",
  initialInterviewDate,
}: ScheduleBookingModalProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsLoaded, setPositionsLoaded] = useState(false);
  const [selectedPositionId, setSelectedPositionId] = useState<number | null>(
    null,
  );
  const [sortMode, setSortMode] = useState<SortMode>("candidate_desc");
  const [positionFilterQuery, setPositionFilterQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [mainTab, setMainTab] = useState<ScheduleBookingModalTab>("slots");

  const [interviewDate, setInterviewDate] = useState(todayISODate);
  const [interviewStart, setInterviewStart] = useState("09:00");
  const [interviewEnd, setInterviewEnd] = useState("18:00");
  const [slotStepMinutes, setSlotStepMinutes] = useState(30);
  const [capacityPerSlot, setCapacityPerSlot] = useState(4);
  const [interviewRound, setInterviewRound] =
    useState<InterviewRoundWrite>("1차");
  const [interviewLocation, setInterviewLocation] = useState("본사 면접실");
  const [previewSlots, setPreviewSlots] = useState<
    InterviewSlotCreatePayload[]
  >([]);
  const [existingSlots, setExistingSlots] = useState<InterviewSlotListItem[]>(
    [],
  );

  const [bookingCandidateId, setBookingCandidateId] = useState<number | null>(
    null,
  );
  const [availableSlots, setAvailableSlots] = useState<
    AvailableInterviewSlot[]
  >([]);
  const [interviewers, setInterviewers] = useState<HrInterviewer[]>([]);
  const [selectedInvitationSlotIds, setSelectedInvitationSlotIds] = useState<
    number[]
  >([]);
  const [invitationResults, setInvitationResults] = useState<
    InvitationResultRow[] | null
  >(null);
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState<
    number | null
  >(null);

  const [isLoadingPositions, setIsLoadingPositions] = useState(false);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [isCreatingSlots, setIsCreatingSlots] = useState(false);
  const [isLoadingBookingSlots, setIsLoadingBookingSlots] = useState(false);
  const [isSendingInvitations, setIsSendingInvitations] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const blockClose = isCreatingSlots || isSendingInvitations;

  const handleClose = useCallback(() => {
    if (blockClose) return;
    onClose();
  }, [blockClose, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, handleClose]);

  useEffect(() => {
    if (!isOpen) return;

    setPositions([]);
    setPositionsLoaded(false);
    setSelectedPositionId(null);
    setSortMode("candidate_desc");
    setPositionFilterQuery("");
    setSearch("");
    setSelectedIds([]);
    setMainTab(initialMainTab);
    setInterviewDate(initialInterviewDate ?? todayISODate());
    setInterviewStart("09:00");
    setInterviewEnd("18:00");
    setSlotStepMinutes(30);
    setCapacityPerSlot(4);
    setInterviewRound("1차");
    setInterviewLocation("본사 면접실");
    setPreviewSlots([]);
    setExistingSlots([]);
    setBookingCandidateId(null);
    setAvailableSlots([]);
    setInterviewers([]);
    setSelectedInvitationSlotIds([]);
    setInvitationResults(null);
    setSelectedEmailTemplateId(emailTemplates[0]?.id ?? null);
    setErrorMessage("");
    setIsLoadingPositions(true);

    let ignore = false;
    positionApi
      .fetchPositions()
      .then((list) => {
        if (!ignore) setPositions(list);
      })
      .catch(() => {
        if (ignore) return;
        const map = new Map<number, string>();
        applicants.forEach((a) => {
          if (!map.has(a.position_id)) {
            map.set(a.position_id, `공고 #${a.position_id}`);
          }
        });
        setPositions(
          [...map.entries()].map(([positionId, positionName]) => ({
            positionId,
            positionName,
            createdAt: new Date().toISOString(),
          })),
        );
      })
      .finally(() => {
        if (!ignore) {
          setPositionsLoaded(true);
          setIsLoadingPositions(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [isOpen, applicants, initialMainTab, initialInterviewDate, emailTemplates]);

  const positionOptions = useMemo(() => {
    const fromApi = positions.slice();
    const ids = new Set(fromApi.map((p) => p.positionId));
    applicants.forEach((a) => {
      if (!ids.has(a.position_id)) {
        ids.add(a.position_id);
        fromApi.push({
          positionId: a.position_id,
          positionName: `공고 #${a.position_id}`,
          createdAt: "",
        });
      }
    });
    return fromApi.sort((a, b) => b.positionId - a.positionId);
  }, [positions, applicants]);

  const filteredPositionOptions = useMemo(() => {
    const q = positionFilterQuery.trim().toLowerCase();
    if (!q) return positionOptions;
    return positionOptions.filter((p) =>
      p.positionName.toLowerCase().includes(q),
    );
  }, [positionOptions, positionFilterQuery]);

  useEffect(() => {
    if (!positionsLoaded || selectedPositionId !== null) return;
    if (positionOptions.length === 1) {
      setSelectedPositionId(positionOptions[0].positionId);
    }
  }, [positionsLoaded, positionOptions, selectedPositionId]);

  const applicantsForPosition = useMemo(() => {
    if (selectedPositionId == null) return [];
    return applicants.filter((a) => a.position_id === selectedPositionId);
  }, [applicants, selectedPositionId]);

  const sortedApplicants = useMemo(() => {
    const list = [...applicantsForPosition];
    if (sortMode === "candidate_desc") {
      list.sort((a, b) => b.candidate_id - a.candidate_id);
    } else {
      list.sort((a, b) => {
        const pa = isDocumentPassed(a) ? 1 : 0;
        const pb = isDocumentPassed(b) ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return b.candidate_id - a.candidate_id;
      });
    }
    return list;
  }, [applicantsForPosition, sortMode]);

  const filteredApplicants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedApplicants;
    return sortedApplicants.filter((a) =>
      [a.name, a.email ?? "", a.phone, String(a.candidate_id)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [sortedApplicants, search]);

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) =>
        applicantsForPosition.some((a) => a.candidate_id === id),
      ),
    );
  }, [applicantsForPosition]);

  useEffect(() => {
    setBookingCandidateId((prev) => {
      if (selectedIds.length === 0) return null;
      if (prev != null && selectedIds.includes(prev)) return prev;
      return selectedIds[0] ?? null;
    });
  }, [selectedIds]);

  useEffect(() => {
    if (mainTab !== "booking") return;

    if (!bookingCandidateId) {
      setAvailableSlots([]);
      setInterviewers([]);
      setSelectedInvitationSlotIds([]);
      return;
    }

    const cand = applicants.find((a) => a.candidate_id === bookingCandidateId);
    if (!cand?.position_id) {
      setAvailableSlots([]);
      setInterviewers([]);
      setSelectedInvitationSlotIds([]);
      setErrorMessage("지원자 직무 정보가 없습니다.");
      return;
    }

    let ignore = false;
    setIsLoadingBookingSlots(true);
    setErrorMessage("");

    Promise.all([
      interviewBookingApi.fetchAvailableSlots(bookingCandidateId),
      interviewerApi.fetchInterviewers({
        positionId: cand.position_id,
        size: 100,
      }),
    ])
      .then(([slots, interviewerList]) => {
        if (ignore) return;
        setAvailableSlots(slots);
        setInterviewers(interviewerList.content);
        setSelectedInvitationSlotIds([]);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setAvailableSlots([]);
        setInterviewers([]);
        setSelectedInvitationSlotIds([]);
        setErrorMessage(
          getApiErrorMessage(err, "예약 가능 슬롯을 불러오지 못했습니다."),
        );
      })
      .finally(() => {
        if (!ignore) setIsLoadingBookingSlots(false);
      });

    return () => {
      ignore = true;
    };
  }, [mainTab, bookingCandidateId, applicants]);

  useEffect(() => {
    setSelectedInvitationSlotIds((prev) =>
      prev.filter((id) => availableSlots.some((s) => s.slotId === id)),
    );
  }, [availableSlots]);

  const interviewersByRound = useMemo(() => {
    return interviewers.reduce<Record<string, HrInterviewer[]>>((acc, row) => {
      if (!row.interviewRound) return acc;
      acc[row.interviewRound] = [...(acc[row.interviewRound] ?? []), row];
      return acc;
    }, {});
  }, [interviewers]);

  const getSlotInterviewers = (slot: AvailableInterviewSlot) =>
    interviewersByRound[slot.interviewRound] ?? [];

  const toggleId = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAllFiltered = () => {
    setSelectedIds(filteredApplicants.map((a) => a.candidate_id));
  };

  const clearSelection = () => setSelectedIds([]);

  const handleFetchExistingSlots = async () => {
    if (selectedPositionId == null) {
      toast.error("직무를 먼저 선택해 주세요.");
      return;
    }
    if (!interviewDate) return;
    setIsLoadingExisting(true);
    setErrorMessage("");
    try {
      const d = new Date(`${interviewDate}T12:00:00`);
      const rows = await interviewSlotsApi.fetchSlots({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
        positionId: selectedPositionId,
      });
      setExistingSlots(rows);
      toast.success(`해당일 슬롯 ${rows.length}건을 불러왔습니다.`);
    } catch (e: unknown) {
      setErrorMessage(getApiErrorMessage(e, "기존 슬롯 조회에 실패했습니다."));
    } finally {
      setIsLoadingExisting(false);
    }
  };

  const handleAutoGenerateSlots = () => {
    setErrorMessage("");
    if (selectedPositionId == null) {
      toast.error("직무를 선택해 주세요.");
      return;
    }
    const loc = interviewLocation.trim();
    if (!loc) {
      toast.error("면접 장소를 입력해 주세요.");
      return;
    }
    const startM = parseTimeToMinutes(interviewStart);
    const endM = parseTimeToMinutes(interviewEnd);
    if (endM <= startM) {
      toast.error("종료 시간이 시작 시간보다 늦어야 합니다.");
      return;
    }
    if (slotStepMinutes < 15) {
      toast.error("면접 단위는 15분 이상으로 설정해 주세요.");
      return;
    }
    if (capacityPerSlot < 1) {
      toast.error("슬롯당 인원은 1명 이상이어야 합니다.");
      return;
    }

    const out: InterviewSlotCreatePayload[] = [];
    let cur = startM;
    while (cur + slotStepMinutes <= endM) {
      out.push({
        positionId: selectedPositionId,
        interviewRound,
        interviewerIds: [],
        interviewDate,
        interviewStartTime: minutesToTimeStr(cur),
        interviewEndTime: minutesToTimeStr(cur + slotStepMinutes),
        interviewLocation: loc,
        capacity: capacityPerSlot,
      });
      cur += slotStepMinutes;
    }

    if (out.length === 0) {
      toast.error(
        "선택한 시간대에 생성할 슬롯이 없습니다. 단위(분)를 줄여 보세요.",
      );
      return;
    }

    const remainder = endM - cur;
    if (remainder > 0) {
      toast(
        `종료 시각까지 ${remainder}분은 슬롯 단위에 맞지 않아 제외했습니다.`,
        {
          description: "종료 시각을 늘리거나 단위(분)을 조정해 보세요.",
        },
      );
    }

    setPreviewSlots(out);
    toast.success(`${out.length}개의 슬롯 초안을 만들었습니다.`);
  };

  const handleCreateSlotsBatch = async () => {
    if (previewSlots.length === 0) {
      toast.error("먼저 ‘시간 슬롯 자동 생성’을 실행해 주세요.");
      return;
    }
    setIsCreatingSlots(true);
    setErrorMessage("");
    try {
      const created = await interviewSlotsApi.createSlotsBatch({
        slots: previewSlots,
      });
      toast.success(`면접 슬롯 ${created.length}건이 생성되었습니다.`);
      setPreviewSlots([]);
      await handleFetchExistingSlots();
    } catch (e: unknown) {
      setErrorMessage(getApiErrorMessage(e, "슬롯 일괄 생성에 실패했습니다."));
    } finally {
      setIsCreatingSlots(false);
    }
  };

  const toggleInvitationSlot = (slotId: number) => {
    setSelectedInvitationSlotIds((prev) =>
      prev.includes(slotId)
        ? prev.filter((x) => x !== slotId)
        : [...prev, slotId],
    );
  };

  const selectAllInvitationSlots = () => {
    setSelectedInvitationSlotIds(availableSlots.map((s) => s.slotId));
  };

  const clearInvitationSlotsSelection = () => setSelectedInvitationSlotIds([]);

  const composeInvitationEmailBody = (
    results: InvitationResultRow[] | null,
  ): string => {
    const lines: string[] = [];
    lines.push("안녕하세요.");
    lines.push("");
    lines.push(
      "아래 링크에서 면접 일정을 확인한 뒤, 예약 가능한 시간 중 하나를 선택해 주세요.",
    );
    if (selectedInvitationSlotIds.length > 0 && availableSlots.length > 0) {
      lines.push("");
      lines.push("[안내 면접 시간대]");
      for (const id of selectedInvitationSlotIds) {
        const s = availableSlots.find((x) => x.slotId === id);
        if (!s) continue;
        const when = new Date(s.interviewStartsAt).toLocaleString("ko-KR", {
          dateStyle: "medium",
          timeStyle: "short",
        });
        lines.push(
          `- ${when} · ${s.interviewRound} · ${s.interviewLocation ?? "장소 미정"}`,
        );
      }
    }
    lines.push("");
    lines.push("——————————");
    if (results?.length) {
      for (const r of results) {
        if (r.invitationUrl) {
          lines.push(`${r.name}: ${r.invitationUrl}`);
        } else {
          lines.push(
            `${r.name}: (초대 링크 생성 실패${r.error ? ` — ${r.error}` : ""})`,
          );
        }
      }
    }
    return lines.join("\n");
  };

  const composeCandidateInvitationEmailBody = (
    candidateName: string,
    invitationUrl: string,
  ) => {
    const lines: string[] = [];
    lines.push(`${candidateName}님, 안녕하세요.`);
    lines.push("");
    lines.push("아래 링크에서 가능한 면접 일정 중 하나를 선택해 주세요.");
    lines.push("");
    lines.push(invitationUrl);
    if (selectedInvitationSlotIds.length > 0 && availableSlots.length > 0) {
      lines.push("");
      lines.push("[선택 가능한 면접 시간대]");
      for (const id of selectedInvitationSlotIds) {
        const s = availableSlots.find((x) => x.slotId === id);
        if (!s) continue;
        const when = new Date(s.interviewStartsAt).toLocaleString("ko-KR", {
          dateStyle: "medium",
          timeStyle: "short",
        });
        lines.push(
          `- ${when} · ${s.interviewRound} · ${s.interviewLocation ?? "장소 미정"}`,
        );
      }
    }
    lines.push("");
    lines.push("감사합니다.");
    return lines.join("\n");
  };

  const openInvitationPreviewPage = (
    rows: InvitationResultRow[],
    previewWindow?: Window | null,
    slotsOverride?: AvailableInterviewSlot[],
    slotIdsOverride?: number[],
  ) => {
    const okRows = rows.filter((row) => row.invitationUrl);
    if (okRows.length === 0) {
      previewWindow?.close();
      toast.error(
        "초대 링크가 생성된 지원자가 없습니다. 실패 내역을 확인한 뒤 다시 시도해 주세요.",
      );
      return;
    }
    const draftSlotIds = slotIdsOverride ?? selectedInvitationSlotIds;
    const draftSlotsSource = slotsOverride ?? availableSlots;

    const draftId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}`;
    const draft = {
      createdAt: new Date().toISOString(),
      slotIds: draftSlotIds,
      slots: draftSlotIds
        .map((id) => draftSlotsSource.find((slot) => slot.slotId === id))
        .filter(Boolean),
      recipients: okRows.map((row) => ({
        candidateId: row.candidateId,
        name: row.name,
        email: row.email ?? null,
        invitationUrl: row.invitationUrl,
        subject: "[면접 일정 선택 안내] 가능한 시간을 선택해 주세요",
        content: composeCandidateInvitationEmailBody(
          row.name,
          row.invitationUrl ?? "",
        ),
      })),
      failures: rows.filter((row) => !row.invitationUrl),
    };

    // 새 탭/팝업은 sessionStorage를 공유하지 않으므로 localStorage 사용
    try {
      localStorage.setItem(
        `interview-invitation-preview:${draftId}`,
        JSON.stringify(draft),
      );
    } catch {
      toast.error("미리보기 데이터를 저장하지 못했습니다. 브라우저 저장소를 확인해 주세요.");
      previewWindow?.close();
      return;
    }
    const previewUrl = `/invitation-preview?draft=${draftId}`;
    if (previewWindow && !previewWindow.closed) {
      previewWindow.location.href = previewUrl;
      previewWindow.focus();
      return;
    }
    window.open(previewUrl, "_blank", "width=1100,height=850,left=120,top=80");
  };

  const handleCopyInvitationEmailBody = async () => {
    if (!invitationResults?.length) {
      toast.error("먼저 ‘초대 링크 일괄 생성’을 실행해 주세요.");
      return;
    }
    const text = composeInvitationEmailBody(invitationResults);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("메일 본문이 클립보드에 복사되었습니다.");
    } catch {
      toast.error("클립보드 복사에 실패했습니다.");
    }
  };

  const handleBulkInvitations = async () => {
    const mockEnabled = canUseInvitationMock();

    if (selectedIds.length === 0 && !mockEnabled) {
      toast.error("지원자를 한 명 이상 선택해 주세요.");
      return;
    }
    if (selectedInvitationSlotIds.length === 0 && !mockEnabled) {
      toast.error("지원자에게 열어줄 면접 슬롯을 한 개 이상 선택해 주세요.");
      return;
    }

    if (mockEnabled && (selectedIds.length === 0 || selectedInvitationSlotIds.length === 0)) {
      const mockSlots = createMockInvitationSlots();
      const rows: InvitationResultRow[] = [
        {
          candidateId: 99001,
          name: "목업 지원자",
          email: "mock.candidate@example.com",
          invitationUrl: "http://localhost:3000/interview-booking?token=mock-token",
        },
      ];
      openInvitationPreviewPage(
        rows,
        null,
        mockSlots,
        mockSlots.map((slot) => slot.slotId),
      );
      onClose();
      return;
    }

    setIsSendingInvitations(true);
    setInvitationResults(null);
    setErrorMessage("");
    const rows: InvitationResultRow[] = [];
    try {
      for (const id of selectedIds) {
        const a = applicants.find((x) => x.candidate_id === id);
        try {
          const res = await interviewBookingInvitationApi.createInvitation({
            candidateId: id,
            slotIds: selectedInvitationSlotIds,
          });
          const row: InvitationResultRow = {
            candidateId: id,
            name: a?.name ?? String(id),
            email: a?.email,
            invitationUrl: res.invitationUrl,
          };
          rows.push(row);
        } catch (e: unknown) {
          rows.push({
            candidateId: id,
            name: a?.name ?? String(id),
            email: a?.email,
            error: getApiErrorMessage(e, "초대 링크 생성 실패"),
          });
        }
      }
      setInvitationResults(rows);
      const ok = rows.filter((r) => r.invitationUrl).length;
      toast.success(`초대 링크 ${ok}/${rows.length}건 생성`);
      openInvitationPreviewPage(rows, null);
      onClose();
    } finally {
      setIsSendingInvitations(false);
    }
  };

  const [portalMounted, setPortalMounted] = useState(false);
  useLayoutEffect(() => {
    setPortalMounted(true);
  }, []);

  if (!isOpen) return null;

  if (!portalMounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-modal-title"
      className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm md:p-6"
    >
      <div
        className="flex max-h-[min(92dvh,860px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200 sm:max-w-2xl lg:max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더: 제목 — 라인 — 닫기 */}
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
          <h2
            id="schedule-modal-title"
            className="flex shrink-0 items-center gap-2 text-sm font-black text-slate-900 sm:text-base"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
              <i className="bx bx-calendar-plus text-lg leading-none" />
            </span>
            면접 일정 생성
          </h2>
          <div className="h-px min-w-0 flex-1 bg-slate-200" aria-hidden />
          <button
            type="button"
            onClick={handleClose}
            disabled={blockClose}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 sm:text-sm"
            aria-label="닫기 (Esc)"
          >
            <i className="bx bx-x text-lg leading-none sm:hidden" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex flex-col gap-5">
              {/* 직무 + 정렬 */}
              <section className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <i className="bx bx-briefcase text-sm" />
                    직무 선택
                  </span>
                  <div className="relative">
                    <i className="bx bx-filter-alt pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={positionFilterQuery}
                      onChange={(e) => setPositionFilterQuery(e.target.value)}
                      placeholder="직무 이름으로 필터…"
                      disabled={isLoadingPositions}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm font-semibold outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
                    />
                  </div>
                  <div
                    className="custom-scrollbar max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 p-2 sm:max-h-56"
                    role="group"
                    aria-label="직무 목록"
                  >
                    {isLoadingPositions ? (
                      <p className="py-6 text-center text-sm font-semibold text-slate-400">
                        직무 불러오는 중…
                      </p>
                    ) : positionOptions.length === 0 ? (
                      <p className="py-6 text-center text-sm font-semibold text-slate-400">
                        등록된 직무가 없습니다.
                      </p>
                    ) : filteredPositionOptions.length === 0 ? (
                      <p className="py-6 text-center text-sm font-semibold text-slate-400">
                        필터에 맞는 직무가 없습니다.
                      </p>
                    ) : (
                      filteredPositionOptions.map((p) => {
                        const count = applicants.filter(
                          (a) => a.position_id === p.positionId,
                        ).length;
                        const selected = selectedPositionId === p.positionId;
                        return (
                          <label
                            key={p.positionId}
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-2.5 transition sm:gap-3 sm:px-3 ${
                              selected
                                ? "border-slate-900 bg-white shadow-sm"
                                : "border-transparent hover:bg-white/90"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={isLoadingPositions}
                              onChange={() => {
                                setSelectedPositionId((prev) =>
                                  prev === p.positionId ? null : p.positionId,
                                );
                                setSelectedIds([]);
                                setPreviewSlots([]);
                                setExistingSlots([]);
                                setInvitationResults(null);
                              }}
                              className="h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                            />
                            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                              <span className="truncate text-sm font-black text-slate-900">
                                {p.positionName}
                              </span>
                              <span
                                className="h-px min-w-4 flex-1 bg-slate-200"
                                aria-hidden
                              />
                              <span className="shrink-0 whitespace-nowrap text-xs font-bold text-slate-500 tabular-nums sm:text-sm">
                                지원자 {count}명
                              </span>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                    지원자 정렬
                  </span>
                  <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setSortMode("candidate_desc")}
                      className={`flex-1 rounded-lg px-2 py-2 sm:flex-none sm:px-3 ${
                        sortMode === "candidate_desc"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500"
                      }`}
                    >
                      지원자번호 ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortMode("docs_passed_desc")}
                      className={`flex-1 rounded-lg px-2 py-2 sm:flex-none sm:px-3 ${
                        sortMode === "docs_passed_desc"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500"
                      }`}
                    >
                      서류 통과 우선 ↓
                    </button>
                  </div>
                </div>
              </section>

              {/* 지원자 체크 */}
              <section className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <i className="bx bx-group text-sm" />
                    지원자 선택
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">
                      {selectedIds.length}
                    </span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllFiltered}
                      disabled={
                        !selectedPositionId || filteredApplicants.length === 0
                      }
                      className="text-xs font-bold text-indigo-600 hover:underline disabled:opacity-40"
                    >
                      전체
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      disabled={selectedIds.length === 0}
                      className="text-xs font-bold text-slate-500 hover:underline disabled:opacity-40"
                    >
                      해제
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <i className="bx bx-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="검색…"
                    disabled={!selectedPositionId}
                    className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-3 text-sm font-semibold outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
                  />
                </div>
                <div className="custom-scrollbar max-h-44 space-y-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-2 sm:max-h-52">
                  {!selectedPositionId ? (
                    <p className="py-8 text-center text-sm font-semibold text-slate-400">
                      직무를 선택하면 지원자 목록이 표시됩니다.
                    </p>
                  ) : filteredApplicants.length === 0 ? (
                    <p className="py-8 text-center text-sm font-semibold text-slate-400">
                      해당 직무 지원자가 없습니다.
                    </p>
                  ) : (
                    filteredApplicants.map((a) => {
                      const checked = selectedIds.includes(a.candidate_id);
                      const passed = isDocumentPassed(a);
                      return (
                        <label
                          key={a.candidate_id}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border px-2.5 py-2 transition sm:px-3 ${
                            checked
                              ? "border-slate-900 bg-white shadow-sm"
                              : "border-transparent hover:bg-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleId(a.candidate_id)}
                            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-slate-900">
                              {a.name}
                            </p>
                            <p className="truncate text-xs font-semibold text-slate-500">
                              #{a.candidate_id} · {a.application_status}
                              {!passed && (
                                <span className="ml-1 text-amber-600">
                                  서류
                                </span>
                              )}
                            </p>
                          </div>
                          {passed && (
                            <i
                              className="bx bx-check-shield shrink-0 text-emerald-500"
                              title="서류 이후 단계"
                            />
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
              </section>

              {/* 탭 */}
              <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setMainTab("slots")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-black sm:text-sm ${
                    mainTab === "slots"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  <i className="bx bx-time-five" />
                  시간대 조회
                </button>
                <button
                  type="button"
                  onClick={() => setMainTab("booking")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-black sm:text-sm ${
                    mainTab === "booking"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  <i className="bx bx-envelope" />
                  예약 초대
                </button>
              </div>

              {errorMessage && (
                <div
                  className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700"
                  role="alert"
                >
                  <i className="bx bx-error-circle mt-0.5 shrink-0" />
                  {errorMessage}
                </div>
              )}

              {mainTab === "slots" && (
                <section className="flex flex-col gap-4 border-t border-slate-100 pt-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-slate-500">
                        면접 날짜
                      </span>
                      <input
                        type="date"
                        value={interviewDate}
                        onChange={(e) => setInterviewDate(e.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-slate-500">
                        시작 시간
                      </span>
                      <input
                        type="time"
                        value={interviewStart}
                        onChange={(e) => setInterviewStart(e.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-slate-500">
                        종료 시간
                      </span>
                      <input
                        type="time"
                        value={interviewEnd}
                        onChange={(e) => setInterviewEnd(e.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-slate-500">
                        면접 단위(분)
                      </span>
                      <input
                        type="number"
                        min={15}
                        step={5}
                        value={slotStepMinutes}
                        onChange={(e) =>
                          setSlotStepMinutes(Number(e.target.value) || 30)
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-slate-500">
                        슬롯당 인원
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={capacityPerSlot}
                        onChange={(e) =>
                          setCapacityPerSlot(Number(e.target.value) || 1)
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-slate-500">
                        면접 차수
                      </span>
                      <select
                        value={interviewRound}
                        onChange={(e) =>
                          setInterviewRound(
                            e.target.value as InterviewRoundWrite,
                          )
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      >
                        {rounds.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 sm:col-span-1">
                      <span className="text-[11px] font-bold text-slate-500">
                        면접 장소
                      </span>
                      <input
                        value={interviewLocation}
                        onChange={(e) => setInterviewLocation(e.target.value)}
                        placeholder="예: 본사 3층 A회의실"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      />
                    </label>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      onClick={handleFetchExistingSlots}
                      disabled={isLoadingExisting || selectedPositionId == null}
                      className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 sm:flex-1"
                    >
                      {isLoadingExisting ? (
                        <i className="bx bx-loader-alt animate-spin" />
                      ) : (
                        <i className="bx bx-search-alt" />
                      )}
                      해당일 기존 슬롯 조회
                    </button>
                    <button
                      type="button"
                      onClick={handleAutoGenerateSlots}
                      className="flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-900 transition hover:bg-indigo-100 sm:flex-1"
                    >
                      <i className="bx bx-wrench" />
                      시간 슬롯 자동 생성
                    </button>
                  </div>

                  {existingSlots.length > 0 && (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
                        조회된 기존 슬롯
                      </p>
                      <ul className="custom-scrollbar max-h-32 space-y-1 overflow-y-auto text-xs font-semibold text-slate-600">
                        {existingSlots.map((s) => (
                          <li
                            key={s.slotId}
                            className="flex justify-between gap-2 border-b border-slate-100 py-1 last:border-0"
                          >
                            <span className="truncate">{s.interviewRound}</span>
                            <span className="shrink-0 text-slate-500">
                              {new Date(s.interviewStartsAt).toLocaleTimeString(
                                "ko-KR",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {previewSlots.length > 0 && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                      <p className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-emerald-800">
                        생성 예정
                        <span>{previewSlots.length}건</span>
                      </p>
                      <ul className="custom-scrollbar max-h-36 space-y-1 overflow-y-auto font-mono text-[11px] font-semibold text-emerald-900">
                        {previewSlots.slice(0, 40).map((s, i) => (
                          <li key={`${s.interviewStartTime}-${i}`}>
                            {formatSlotPreview(
                              s.interviewDate,
                              s.interviewStartTime,
                              s.interviewEndTime,
                            )}{" "}
                            · 정원 {s.capacity}
                          </li>
                        ))}
                        {previewSlots.length > 40 && (
                          <li className="text-emerald-700">
                            … 외 {previewSlots.length - 40}건
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              {mainTab === "booking" && (
                <section className="flex flex-col gap-4 border-t border-slate-100 pt-4">
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5 text-xs font-semibold leading-relaxed text-indigo-950">
                    <i className="bx bx-info-circle mr-1 align-text-bottom" />
                    초대 링크(
                    <code className="rounded bg-white/80 px-1 text-[10px]">
                      POST /api/interview-booking-invitations
                    </code>
                    )로 지원자가 직접 슬롯을 고릅니다. 아래에서 선택한 슬롯만
                    초대 링크에 열리며, 링크 생성 후 지원자 메일로 발송됩니다.
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-slate-500">
                      메일 템플릿
                    </span>
                    <select
                      value={selectedEmailTemplateId ?? ""}
                      onChange={(e) =>
                        setSelectedEmailTemplateId(
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    >
                      <option value="">기본 템플릿 사용</option>
                      {emailTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-slate-500">
                      슬롯 목록 기준 지원자 (대표)
                    </span>
                    <select
                      value={bookingCandidateId ?? ""}
                      onChange={(e) =>
                        setBookingCandidateId(
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      disabled={selectedIds.length === 0}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100"
                    >
                      {selectedIds.length === 0 ? (
                        <option value="">먼저 지원자를 체크해 주세요</option>
                      ) : (
                        selectedIds.map((id) => {
                          const a = applicants.find(
                            (x) => x.candidate_id === id,
                          );
                          return (
                            <option key={id} value={id}>
                              {a?.name ?? id}
                            </option>
                          );
                        })
                      )}
                    </select>
                  </label>

                  {isLoadingBookingSlots ? (
                    <div className="flex flex-col items-center py-10 text-slate-500">
                      <i className="bx bx-loader-alt mb-2 animate-spin text-3xl" />
                      <p className="text-sm font-bold">슬롯 불러오는 중…</p>
                    </div>
                  ) : !bookingCandidateId ? null : availableSlots.length ===
                    0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm font-bold text-slate-500">
                      예약 가능한 슬롯이 없습니다.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                          지원자에게 열어줄 슬롯 선택
                          <span className="ml-2 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">
                            {selectedInvitationSlotIds.length}
                          </span>
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={selectAllInvitationSlots}
                            className="text-xs font-bold text-indigo-600 hover:underline"
                          >
                            전체
                          </button>
                          <button
                            type="button"
                            onClick={clearInvitationSlotsSelection}
                            disabled={selectedInvitationSlotIds.length === 0}
                            className="text-xs font-bold text-slate-500 hover:underline disabled:opacity-40"
                          >
                            해제
                          </button>
                        </div>
                      </div>
                      <ul className="custom-scrollbar max-h-56 space-y-2 overflow-y-auto">
                        {availableSlots.map((slot) => {
                          const iv = getSlotInterviewers(slot);
                          const on = selectedInvitationSlotIds.includes(
                            slot.slotId,
                          );
                          return (
                            <li key={slot.slotId}>
                              <label
                                className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-3 transition sm:px-4 ${
                                  on
                                    ? "border-indigo-400 bg-indigo-50/80 shadow-sm"
                                    : "border-slate-200 bg-white hover:border-slate-300"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() =>
                                    toggleInvitationSlot(slot.slotId)
                                  }
                                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <div className="min-w-0 flex-1 text-left text-sm">
                                  <span className="text-[10px] font-black uppercase text-slate-500">
                                    {slot.interviewRound}
                                  </span>
                                  <p className="font-black text-slate-900">
                                    {new Date(
                                      slot.interviewStartsAt,
                                    ).toLocaleString("ko-KR", {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                  <p className="mt-1 text-xs font-semibold text-slate-500">
                                    {slot.interviewLocation ?? "장소 미정"} ·
                                    잔여 {slot.remainingCapacity}
                                  </p>
                                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                                    {iv.length
                                      ? iv
                                          .map((x) => x.interviewerName)
                                          .join(", ")
                                      : "면접관 정보 없음"}
                                  </p>
                                </div>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}

                  {invitationResults && invitationResults.length > 0 && (
                    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                          초대 링크 결과
                        </p>
                        <button
                          type="button"
                          onClick={handleCopyInvitationEmailBody}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-800 transition hover:bg-slate-50"
                        >
                          <i className="bx bx-copy" />
                          메일 본문 복사
                        </button>
                      </div>
                      <ul className="custom-scrollbar max-h-40 space-y-2 overflow-y-auto text-sm">
                        {invitationResults.map((row) => (
                          <li
                            key={row.candidateId}
                            className="flex flex-col gap-1 rounded-lg border border-slate-100 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <span className="font-bold text-slate-800">
                              {row.name}
                            </span>
                            {row.invitationUrl ? (
                              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:items-end">
                                <div className="flex min-w-0 max-w-full items-center gap-2">
                                  <span className="truncate font-mono text-[11px] text-slate-500">
                                    {row.invitationUrl}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void navigator.clipboard.writeText(
                                        row.invitationUrl ?? "",
                                      );
                                      toast.success("링크를 복사했습니다.");
                                    }}
                                    className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                  >
                                    복사
                                  </button>
                                </div>
                                <span className="text-[11px] font-bold text-indigo-600">
                                  새 탭에서 최종 메일 확인 후 발송
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs font-bold text-rose-600">
                                {row.error}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>

          {/* 하단 고정 액션 */}
          <footer className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
            {mainTab === "slots" ? (
              <button
                type="button"
                onClick={handleCreateSlotsBatch}
                disabled={isCreatingSlots || previewSlots.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-black text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-45"
              >
                {isCreatingSlots ? (
                  <i className="bx bx-loader-alt animate-spin text-lg" />
                ) : (
                  <i className="bx bx-upload text-lg" />
                )}
                일정 생성하기
              </button>
            ) : (
              <button
                type="button"
                onClick={handleBulkInvitations}
                disabled={
                  (selectedIds.length === 0 && !canUseInvitationMock()) ||
                  isSendingInvitations ||
                  isLoadingBookingSlots
                }
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-black text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-45"
              >
                {isSendingInvitations ? (
                  <i className="bx bx-loader-alt animate-spin text-lg" />
                ) : (
                  <i className="bx bx-envelope text-lg" />
                )}
                초대 링크 생성 후 메일 확인
              </button>
            )}
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
