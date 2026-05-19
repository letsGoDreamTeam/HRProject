import { parseTemplateVariablesJson } from "@/lib/hr/template-variables";
import type { AvailableInterviewSlot } from "@/types/interviewBooking";
import type {
  InvitationPreviewDraft,
  InvitationRecipientDraft,
  TemplateVariablesMap,
} from "@/types/invitationPreview";

export const INVITATION_PREVIEW_STORAGE_PREFIX =
  "interview-invitation-preview:";

/** Date.toLocaleString 호출을 매 render마다 새로 만들지 않도록 모듈 레벨에서 1회만 생성 */
const SLOT_DATETIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export const formatSlot = (slot: AvailableInterviewSlot): string =>
  SLOT_DATETIME_FORMATTER.format(new Date(slot.interviewStartsAt));

export const parseCustomVariables = parseTemplateVariablesJson;

export const canUseMockPreview = (): boolean => {
  if (process.env.NODE_ENV === "development") return true;
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
};

export function readInvitationPreviewDraft(draftId: string): string | null {
  if (typeof window === "undefined") return null;
  const key = `${INVITATION_PREVIEW_STORAGE_PREFIX}${draftId}`;
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * mock 미리보기 draft를 생성합니다.
 * - 개발/로컬 환경에서 draftId 또는 raw가 없을 때 빈 화면 대신 사용
 */
export function createMockDraft(): InvitationPreviewDraft {
  const base = new Date();
  base.setHours(10, 0, 0, 0);

  const slots: AvailableInterviewSlot[] = [
    {
      slotId: 9801,
      interviewRound: "1차",
      interviewStartsAt: base.toISOString(),
      interviewEndsAt: new Date(base.getTime() + 30 * 60 * 1000).toISOString(),
      interviewLocation: "본사 3층 회의실 A",
      remainingCapacity: 3,
      interviewerNames: ["Preview Interviewer A"],
    },
    {
      slotId: 9802,
      interviewRound: "1차",
      interviewStartsAt: new Date(
        base.getTime() + 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
      ).toISOString(),
      interviewEndsAt: new Date(
        base.getTime() + 24 * 60 * 60 * 1000 + 150 * 60 * 1000,
      ).toISOString(),
      interviewLocation: "온라인 Zoom",
      remainingCapacity: 1,
      interviewerNames: ["Preview Interviewer B"],
    },
  ];

  const invitationUrl =
    "http://localhost:3000/interview-booking?token=mock-token";

  return {
    createdAt: new Date().toISOString(),
    slotIds: slots.map((slot) => slot.slotId),
    slots,
    recipients: [
      {
        candidateId: 98001,
        name: "목업 지원자",
        email: "mock.candidate@example.com",
        invitationUrl,
        subject: "[면접 일정 선택 안내] 가능한 시간을 선택해주세요.",
        content: [
          "목업 지원자님, 안녕하세요.",
          "",
          "아래 링크에서 가능한 면접 일정을 선택해주세요.",
          "",
          invitationUrl,
          "",
          "[선택 가능한 면접 시간]",
          ...slots.map(
            (slot) =>
              `- ${formatSlot(slot)} · ${slot.interviewRound} · ${
                slot.interviewLocation ?? "장소 미정"
              }`,
          ),
          "",
          "감사합니다.",
        ].join("\n"),
      },
    ],
    failures: [],
  };
}

/** 슬롯 요약 텍스트를 한 번 계산해두기 (수신자 N명에게 동일) */
export function buildSlotSummary(slots: AvailableInterviewSlot[]): string {
  return slots
    .map(
      (slot) =>
        `${formatSlot(slot)} · ${slot.interviewRound} · ${
          slot.interviewLocation ?? "장소 미정"
        }`,
    )
    .join("\n");
}

/**
 * 템플릿 렌더링용 변수 맵.
 * `slotSummary`는 사전 계산된 값을 받아 N+1 호출을 방지합니다.
 */
export const buildRecipientTemplateVariables = (
  recipient: InvitationRecipientDraft,
  draft: InvitationPreviewDraft,
  extraVariables: TemplateVariablesMap,
  slotSummary: string,
): TemplateVariablesMap => ({
  candidate_id: recipient.candidateId,
  candidateId: recipient.candidateId,
  candidate_name: recipient.name,
  candidateName: recipient.name,
  recipient_name: recipient.name,
  recipientName: recipient.name,
  candidate_email: recipient.email,
  candidateEmail: recipient.email,
  invitation_url: recipient.invitationUrl,
  access_link: recipient.invitationUrl,
  slot_count: draft.slotIds.length,
  slotCount: draft.slotIds.length,
  slot_summary: slotSummary,
  slotSummary,
  ...extraVariables,
});

export const normalizeTemplateTextForSend = (
  text: string,
  invitationUrl: string,
): string =>
  text
    .replaceAll(invitationUrl, "{invitation_url}")
    .replaceAll("{access_link}", "{invitation_url}");

export type RecipientUiState = {
  status: "idle" | "sending" | "sent" | "failed";
  error?: string;
};

export const buildInitialRecipientStates = (
  recipients: InvitationRecipientDraft[],
): Record<number, RecipientUiState> =>
  Object.fromEntries(
    recipients.map((recipient) => [
      recipient.candidateId,
      { status: "idle" as const },
    ]),
  );
