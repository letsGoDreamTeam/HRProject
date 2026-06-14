from langchain_core.messages import HumanMessage, SystemMessage

from app.ai.prompts.interview_question.system import SYSTEM_PROMPT
from app.ai.prompts.interview_question.utils import model_to_json, optional_text
from app.ai.schemas.question_generation import (
    InterviewQuestionGenerationInput,
    QuestionFitAnalysis,
    QuestionPlan,
)


def build_interview_question_messages(
    data: InterviewQuestionGenerationInput,
    analysis: QuestionFitAnalysis | None = None,
) -> list[SystemMessage | HumanMessage]:
    additional_request = optional_text(data.additional_request)
    analysis_text = model_to_json(analysis) if analysis else "분석 결과 없음."
    human_prompt = f"""
아래 분석 결과, 직무기술서, 이력서 정보를 바탕으로 면접 질문을 정확히 {data.question_count}개 생성하세요.

지원 직무: {data.position_name}
생성 모드: {data.generation_mode}
질문 개수: {data.question_count}
추가 요청: {additional_request}

## 핵심 분석 결과
{analysis_text}

## 직무기술서 정보
{optional_text(data.job_description_context)}

## 이력서 정보
{optional_text(data.resume_context)}

질문 작성 규칙:
- 각 질문은 반드시 "[질문 유형] 질문 내용" 형식으로 시작하세요.
- 직무기술서 요구 역량과 이력서 근거를 함께 반영하세요.
- 질문은 직무경험, 기술역량, 프로젝트 심화, 협업, 리스크 확인, 실무 스타일을 균형 있게 포함하세요.
- 이력서나 직무기술서에 근거가 없는 내용은 단정하지 말고 확인 질문으로 작성하세요.
- 보호 대상 개인정보나 직무와 무관한 사적 정보는 질문하지 마세요.

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


def build_question_candidate_messages(
    data: InterviewQuestionGenerationInput,
    analysis: QuestionFitAnalysis,
    question_plan: QuestionPlan | None,
    candidate_count: int,
) -> list[SystemMessage | HumanMessage]:
    additional_request = optional_text(data.additional_request)
    analysis_text = model_to_json(analysis)
    question_plan_text = (
    model_to_json(question_plan) if question_plan else "No question plan provided."
)
    human_prompt = f"""
아래 분석 결과, 직무기술서, 이력서 정보를 바탕으로 면접 질문 후보를 정확히 {candidate_count}개 생성하세요.
최종 질문 개수는 {data.question_count}개이며, 각 최종 질문 슬롯마다 후보 A/B를 비교하기 위해 총 {candidate_count}개를 생성합니다.

지원 직무: {data.position_name}
생성 모드: {data.generation_mode}
최종 질문 개수: {data.question_count}
후보 질문 개수: {candidate_count}
추가 요청: {additional_request}

## 핵심 분석 결과
{analysis_text}

## Question Plan
{question_plan_text}

- Question Plan의 category, count, focus를 기준으로 후보 질문 주제를 구성하세요.
- 각 plan item의 count가 최종 질문 개수 기준이라면, 후보 질문은 그 2배 정도 생성하세요.
- 특정 category가 3개 필요하면 후보 질문은 최소 6개 생성해서 selection 단계가 고를 수 있게 하세요.



## 직무기술서 정보
{optional_text(data.job_description_context)}

## 이력서 정보
{optional_text(data.resume_context)}

후보 생성 규칙:
- 각 질문은 반드시 "[질문 유형] 질문 내용" 형식으로 시작하세요.
- 1-2번은 최종 1번 질문 후보 A/B, 3-4번은 최종 2번 질문 후보 A/B처럼 2개씩 한 pair로 구성하세요.
- 같은 pair의 두 후보는 같은 평가 목적을 가지되 질문 방식, 구체성, 근거 활용 방식이 달라야 합니다.
- 직무기술서 요구 역량과 이력서 근거를 함께 반영하세요.
- 질문은 직무경험, 기술역량, 프로젝트 심화, 협업, 리스크 확인, 실무 스타일을 균형 있게 포함하세요.
- 이력서나 직무기술서에 근거가 없는 내용은 단정하지 말고 확인 질문으로 작성하세요.
- 보호 대상 개인정보나 직무와 무관한 사적 정보는 질문하지 마세요.
- pair끼리는 평가 관점이 지나치게 중복되지 않도록 구성하세요.

중요한 개수 규칙:
- 반드시 후보 질문을 정확히 {candidate_count}개 반환하세요.
- Question Plan의 count는 최종 질문 개수 기준입니다. 후보 질문 개수가 아닙니다.
- 각 Question Plan item마다 count의 약 2배 후보 질문을 생성하세요.
- 예: 어떤 category의 count가 3이면, 해당 category 후보 질문은 약 6개 생성하세요.
- {data.question_count}개만 생성하면 안 됩니다.
- 이 단계의 최종 출력은 반드시 후보 질문 {candidate_count}개여야 합니다.

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
