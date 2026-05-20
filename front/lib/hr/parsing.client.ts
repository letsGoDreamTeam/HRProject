import type {
  ParseJobCreateResponse,
  ParseJobResponse,
  ParsingItem,
  ParsingResponse,
  ResumeParseJobStatus,
} from "@/types/parsing";
import { hrApi } from "../api";

const PARSE_REQUEST_TIMEOUT_MS = 120_000;

type RawJobPayload = {
  jobId?: string;
  job_id?: string;
  status?: ResumeParseJobStatus;
  totalFiles?: number;
  total_files?: number;
  processedFiles?: number;
  processed_files?: number;
  result?: RawParsingPayload | null;
  error?: string | null;
};

type RawParsingPayload = {
  items?: RawParsingItem[];
  errors?: { filename: string; detail: string }[];
  excelBase64?: string | null;
  excel_base64?: string | null;
  excelFileName?: string | null;
  excel_file_name?: string | null;
};

type RawParsingItem = {
  filename: string;
  record: ParsingItem["record"];
};

function normalizeJobPayload(data: RawJobPayload): ParseJobCreateResponse {
  return {
    jobId: String(data.jobId ?? data.job_id ?? ""),
    status: data.status ?? "queued",
    totalFiles: data.totalFiles ?? data.total_files ?? 0,
    processedFiles: data.processedFiles ?? data.processed_files ?? 0,
  };
}

function normalizeParsingResponse(
  data: RawParsingPayload | null | undefined,
): ParsingResponse {
  if (!data) return emptyParsingResponse();

  return {
    items: (data.items ?? []).map(
      (item): ParsingItem => ({
        filename: item.filename,
        record: item.record,
      }),
    ),
    errors: (data.errors ?? []).map((error) => ({
      filename: error.filename,
      detail: error.detail,
    })),
    excelBase64: data.excelBase64 ?? data.excel_base64 ?? null,
    excelFileName: data.excelFileName ?? data.excel_file_name ?? null,
  };
}

function normalizeJobResponse(data: RawJobPayload): ParseJobResponse {
  const base = normalizeJobPayload(data);
  return {
    ...base,
    result: data.result ? normalizeParsingResponse(data.result) : null,
    error: data.error ?? null,
  };
}

export async function createParseJob(
  files: File[],
): Promise<ParseJobCreateResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  const { data } = await hrApi.post<RawJobPayload>("/api/parse/jobs", formData, {
    timeout: PARSE_REQUEST_TIMEOUT_MS,
  });
  const normalized = normalizeJobPayload(data);

  if (!normalized.jobId) {
    throw new Error("파싱 작업 ID를 받지 못했습니다. API 응답 형식을 확인해 주세요.");
  }

  return normalized;
}

export async function getParseJob(jobId: string): Promise<ParseJobResponse> {
  const { data } = await hrApi.get<RawJobPayload>(`/api/parse/jobs/${jobId}`, {
    timeout: PARSE_REQUEST_TIMEOUT_MS,
  });
  return normalizeJobResponse(data);
}

export interface CancelParseJobResponse {
  jobId: string;
  status: string;
  cancelRequested: boolean;
  message: string;
}

type RawCancelPayload = {
  jobId?: string;
  job_id?: string;
  status?: string;
  cancelRequested?: boolean;
  cancel_requested?: boolean;
  message?: string;
};

export async function cancelParseJob(
  jobId: string,
): Promise<CancelParseJobResponse> {
  const { data } = await hrApi.post<RawCancelPayload>(
    `/api/parse/jobs/${jobId}/cancel`,
    null,
    { timeout: PARSE_REQUEST_TIMEOUT_MS },
  );
  return {
    jobId: String(data.jobId ?? data.job_id ?? jobId),
    status: data.status ?? "cancelled",
    cancelRequested: Boolean(data.cancelRequested ?? data.cancel_requested),
    message: data.message ?? "파싱 취소가 요청되었습니다.",
  };
}

export function emptyParsingResponse(): ParsingResponse {
  return {
    items: [],
    errors: [],
    excelBase64: null,
    excelFileName: null,
  };
}

export function downloadExcelFromBase64(
  base64: string,
  fileName: string,
): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function summarizeParseErrors(
  errors: ParsingResponse["errors"],
  maxItems = 2,
): string {
  if (errors.length === 0) {
    return "이력서 파싱에 실패했습니다. 파일 형식과 내용을 확인해 주세요.";
  }

  const head = errors
    .slice(0, maxItems)
    .map((error) => `${error.filename}: ${error.detail}`)
    .join(" · ");

  const rest = errors.length > maxItems ? ` 외 ${errors.length - maxItems}건` : "";
  return head + rest;
}

