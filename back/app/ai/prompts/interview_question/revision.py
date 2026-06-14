from langchain_core.messages import HumanMessage, SystemMessage

from app.ai.prompts.interview_question.system import SYSTEM_PROMPT
from app.ai.prompts.interview_question.utils import model_to_json, optional_text
from app.ai.schemas.question_generation import (
    GeneratedQuestion,
    InterviewQuestionGenerationInput,
    QuestionFitAnalysis,
    QuestionReviewOutput,
)


def build_question_revision_messages(
    data: InterviewQuestionGenerationInput,
    analysis: QuestionFitAnalysis,
    questions: list[GeneratedQuestion],
    review: QuestionReviewOutput,
) -> list[SystemMessage | HumanMessage]:
    human_prompt = f"""
리뷰 피드백을 반영하여 면접 질문을 개선하세요.
문제가 없는 질문은 최대한 유지하고, 지적된 질문만 구체적으로 수정하거나 더 적합한 질문으로 교체하세요.

지원 직무: {data.position_name}
최종 질문 개수: {data.question_count}
추가 요청: {optional_text(data.additional_request)}

## 핵심 분석 결과
{model_to_json(analysis)}

## 현재 질문
{model_to_json(questions)}

## 리뷰 결과
{model_to_json(review)}

수정 규칙:
- 최종 질문은 정확히 {data.question_count}개여야 합니다.
- 질문은 반드시 "[질문 유형] 질문 내용" 형식을 유지하세요.
- 리뷰에서 지적한 중복, 근거 부족, 모호함, 부적절함을 해결하세요.
- 이력서나 직무기술서에 없는 내용을 단정하지 마세요.
- 보호 대상 개인정보나 직무 무관 정보는 포함하지 마세요.

각 항목은 다음 필드만 포함하세요:
- question_text: "질문 내용"
- evaluation_intent: "질문 유형: ... / 난이도: ... / 질문의도: ... / 평가포인트: ..."
- generation_basis: "질문 생성의 근거에 대한 내용"

예시:

question_text, evaluation_intent, generation_basis 답변:

question_text: "[질문 유형 내용] 질문 내용"
evaluation_intent: "질문 유형: 질문 유형 내용 / 난이도: 하, 중, 중상, 상과 같은 난이도 / 질문의도: 질문의도에 대한 내용 / 평가포인트: 평가포인트에 대한 내용"
generation_basis: "근거에 대한 내용"
""".strip()

    return [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=human_prompt),
    ]
