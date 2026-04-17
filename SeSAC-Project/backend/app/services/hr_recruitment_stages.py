"""채용 파이프라인 단계: 이미지 요구(서류→1차→2차→최종→입사)와 레거시 값 호환."""

from __future__ import annotations

# 퍼널 순서(불합격 제외) — 채용절차 설정에서 interview_3~10을 쓸 수 있도록 포함
FUNNEL_STAGE_ORDER: tuple[str, ...] = (
    "document_screening",
    "document_review",
    "interview_1",
    "interview_2",
    "interview_3",
    "interview_4",
    "interview_5",
    "interview_6",
    "interview_7",
    "interview_8",
    "interview_9",
    "interview_10",
    "interview_n",
    "final",
    "final_pass",
    "hired",
)

TERMINAL_REJECTED = "rejected"
TERMINAL_FAIL = "final_fail"

# DB·API에 허용하는 전체 단계
ALL_CANONICAL_STAGES: frozenset[str] = frozenset((*FUNNEL_STAGE_ORDER, TERMINAL_REJECTED, TERMINAL_FAIL))

LEGACY_STAGE_MAP: dict[str, str] = {}  # 레거시 별칭 없음 (모두 정식 canonical)

ALLOWED_STAGE_INPUTS: frozenset[str] = ALL_CANONICAL_STAGES

STAGE_LABEL_KO: dict[str, str] = {
    "document_screening": "서류전형",
    "document_review": "서류검토",
    "interview_1": "1차 면접",
    "interview_2": "2차 면접",
    "interview_3": "3차 면접",
    "interview_4": "4차 면접",
    "interview_5": "5차 면접",
    "interview_6": "6차 면접",
    "interview_7": "7차 면접",
    "interview_8": "8차 면접",
    "interview_9": "9차 면접",
    "interview_10": "10차 면접",
    "interview_n": "N차 면접",
    "final": "최종심사",
    "final_pass": "최종합격",
    "hired": "입사확정",
    "final_fail": "최종불합격",
    "rejected": "불합격",
}


def normalize_application_stage(raw: str | None) -> str:
    s = (raw or "").strip() or "document_screening"
    return s if s in ALL_CANONICAL_STAGES else "document_screening"


def funnel_counts_by_stage(stages: list[str]) -> dict[str, int]:
    out: dict[str, int] = {k: 0 for k in FUNNEL_STAGE_ORDER}
    out[TERMINAL_REJECTED] = 0
    out[TERMINAL_FAIL] = 0
    for raw in stages:
        n = normalize_application_stage(raw)
        if n in out:
            out[n] += 1
    return out


def suggest_bottleneck_line(funnel: dict[str, int]) -> str:
    """숫자 기반 한 줄 병목 힌트(관리용)."""
    active = [(k, funnel.get(k, 0)) for k in FUNNEL_STAGE_ORDER if k != "hired"]
    if not any(c > 0 for _, c in active):
        return "아직 파이프라인에 충분한 지원자가 없습니다. 서류 묶음을 확인하세요."
    mx = max(c for _, c in active)
    if mx == 0:
        return "단계별 분포를 확인하고, 병목 단계의 일정·평가를 정비하세요."
    tops = [STAGE_LABEL_KO[k] for k, c in active if c == mx and c > 0]
    label = tops[0] if len(tops) == 1 else "·".join(tops[:2])
    return f"{label} 단계에 지원자가 집중되어 있습니다({mx}명). 일정·평가 제출을 우선 점검하세요."


def suggest_weekly_action_line(*, pending_eval_submissions: int) -> str:
    if pending_eval_submissions > 0:
        return f"이번 주: 미제출 면접 평가 {pending_eval_submissions}건 독려(알림 큐·리마인드)."
    return "이번 주: 최종 단계 지원자 합의 및 입사 확정(또는 불합격 통보) 일정을 정리하세요."
