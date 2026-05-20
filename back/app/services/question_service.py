from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.graphs.interview_question import interview_question_graph
from app.ai.schemas.question_generation import (
    GeneratedQuestion,
    InterviewQuestionGenerationInput,
)
from app.core.exceptions import ConflictException, ForbiddenException, NotFoundException
from app.models.candidate import Candidate
from app.models.interviewer import Interviewer
from app.models.question import Question
from app.models.question_generation_job import (
    QUESTION_GENERATION_STATUS_SUCCEEDED,
    QuestionGenerationJob,
)
from app.repositories.candidate_repository import candidate_repository
from app.repositories.position_repository import position_repository
from app.repositories.question_generation_job_repository import (
    question_generation_job_repository,
)
from app.repositories.question_repository import question_repository
from app.schemas.question import (
    GeneratedQuestionResponse,
    QuestionGenerateRequest,
    QuestionSaveItem,
    QuestionSaveRequest,
)
from app.services.job_description_service import job_description_service
from app.services.resume_context_service import resume_context_service


POSITION_BASED_QUESTION_TYPE = "position_based"
CANDIDATE_RESUME_BASED_QUESTION_TYPE = "candidate_resume_based"
CANDIDATE_JOB_FIT_BASED_QUESTION_TYPE = "candidate_job_fit_based"


@dataclass(frozen=True)
class SaveQuestionItemContext:
    question_text: str
    question_type: str
    evaluation_intent: str | None
    generation_basis: str | None
    candidate_id: int | None
    position_id: int | None
    generation_job_id: int | None


class QuestionService:
    async def generate_questions(self, db: AsyncSession, data: QuestionGenerateRequest) -> list[GeneratedQuestionResponse]:
        generation_input = await self.build_generation_input(db, data)
        return await self.generate_questions_from_input(generation_input)

    async def build_generation_input(
        self,
        db: AsyncSession,
        data: QuestionGenerateRequest,
    ) -> InterviewQuestionGenerationInput:
        resume_context = await resume_context_service.build_context(
            db=db,
            candidate_id=data.candidate_id,
            position_id=data.position_id,
        )
        job_description_context = job_description_service.get_context_for_position(
            resume_context.position,
            data.job_description_section,
        )

        return InterviewQuestionGenerationInput(
            position_name=resume_context.position.position_name,
            question_count=data.question_count,
            additional_request=data.additional_request,
            generation_mode=CANDIDATE_JOB_FIT_BASED_QUESTION_TYPE,
            job_description_context=job_description_context,
            resume_context=resume_context.text,
        )

    async def generate_questions_from_input(
        self,
        generation_input: InterviewQuestionGenerationInput,
    ) -> list[GeneratedQuestionResponse]:
        generation_result = await interview_question_graph.generate(generation_input)
        return self.to_generated_question_responses(generation_result.questions)

    def to_generated_question_responses(
        self,
        generated_questions: list[GeneratedQuestion],
    ) -> list[GeneratedQuestionResponse]:
        return [
            GeneratedQuestionResponse(
                question_text=generated_question.question_text,
                question_type=CANDIDATE_JOB_FIT_BASED_QUESTION_TYPE,
                evaluation_intent=generated_question.evaluation_intent,
                generation_basis=generated_question.generation_basis,
            )
            for generated_question in generated_questions
        ]

    async def generate_questions_for_interviewer(
        self,
        db: AsyncSession,
        interviewer: Interviewer,
        data: QuestionGenerateRequest,
    ) -> list[GeneratedQuestionResponse]:
        if interviewer.position_id is None:
            raise ForbiddenException("Interviewer position is required")

        candidate = await candidate_repository.find_by_id(db, data.candidate_id)
        if not candidate:
            raise NotFoundException("Candidate not found")

        if candidate.position_id != interviewer.position_id:
            raise ForbiddenException("Cannot generate questions for another position")

        interviewer_data = data.model_copy(update={"position_id": interviewer.position_id})
        return await self.generate_questions(db, interviewer_data)

    async def save_position_questions(
        self,
        db: AsyncSession,
        data: QuestionSaveRequest,
        created_by_user_id: int | None = None,
        created_by_interviewer_id: int | None = None,
    ) -> None:
        normalized_items = await self._normalize_save_question_items(db, data)

        if created_by_interviewer_id is not None and data.position_id is not None:
            for item in normalized_items:
                if item.position_id != data.position_id:
                    raise ForbiddenException("Cannot create questions for another position")

        existing_question_keys_by_target = await self._build_existing_question_keys_by_target(
            db,
            normalized_items,
        )
        question_items = self._get_unique_new_questions(
            normalized_items,
            existing_question_keys_by_target,
        )
        if not question_items:
            return

        await self._validate_generation_job_questions(
            db=db,
            question_items=question_items,
            request_generation_job_id=data.generation_job_id,
            created_by_user_id=created_by_user_id,
            created_by_interviewer_id=created_by_interviewer_id,
        )

        questions = [
            Question(
                candidate_id=item.candidate_id,
                position_id=item.position_id,
                question_text=item.question_text,
                question_type=item.question_type,
                evaluation_intent=item.evaluation_intent,
                generation_basis=item.generation_basis,
                created_by_user_id=created_by_user_id,
                created_by_interviewer_id=created_by_interviewer_id,
            )
            for item in question_items
        ]
        question_repository.save_all(db, questions)
        await db.commit()

    async def save_questions_for_interviewer(
        self,
        db: AsyncSession,
        interviewer: Interviewer,
        data: QuestionSaveRequest,
    ) -> None:
        if interviewer.position_id is None:
            raise ForbiddenException("Interviewer position is required")

        interviewer_data = data.model_copy(update={"position_id": interviewer.position_id})
        await self.save_position_questions(
            db,
            interviewer_data,
            created_by_user_id=None,
            created_by_interviewer_id=interviewer.interviewer_id,
        )

    async def get_questions(self, db: AsyncSession, position_id: int | None = None, candidate_id: int | None = None) -> list[Question]:
        if position_id is None and candidate_id is None:
            return await question_repository.find_all(db)
        if position_id is not None and not await position_repository.find_by_id(db, position_id):
            raise NotFoundException("Position not found")
        if candidate_id is not None and not await candidate_repository.find_by_id(db, candidate_id):
            raise NotFoundException("Candidate not found")
        return await question_repository.find_by_target(db, position_id=position_id, candidate_id=candidate_id)

    async def get_questions_for_interviewer(self, db: AsyncSession, interviewer: Interviewer, candidate_id: int | None = None) -> list[Question]:
        if interviewer.position_id is None:
            raise ForbiddenException("Interviewer position is required")
        if candidate_id is not None:
            candidate = await candidate_repository.find_by_id(db, candidate_id)
            if not candidate:
                raise NotFoundException("Candidate not found")
            if candidate.position_id != interviewer.position_id:
                raise ForbiddenException("Cannot access questions for another position")
        return await question_repository.find_by_target(db, position_id=interviewer.position_id, candidate_id=candidate_id)

    async def delete_question(self, db: AsyncSession, question_id: int) -> None:
        question = await question_repository.find_by_id(db, question_id)
        if not question:
            raise NotFoundException("Question not found")
        await question_repository.delete(db, question)
        await db.commit()

    async def delete_question_for_interviewer(self, db: AsyncSession, interviewer: Interviewer, question_id: int) -> None:
        question = await question_repository.find_by_id(db, question_id)
        if not question:
            raise NotFoundException("Question not found")
        if question.position_id != interviewer.position_id:
            raise ForbiddenException("Cannot delete questions from another position")
        if question.created_by_interviewer_id != interviewer.interviewer_id:
            raise ForbiddenException("Can only delete own questions")
        await question_repository.delete(db, question)
        await db.commit()

    async def _resolve_save_position_id(self, db: AsyncSession, candidate: Candidate, fallback_position_id: int | None) -> int | None:
        if candidate.position_id is not None:
            return candidate.position_id
        if fallback_position_id is not None:
            if not await position_repository.find_by_id(db, fallback_position_id):
                raise NotFoundException("Position not found")
            return fallback_position_id
        return None

    async def _normalize_save_question_items(
        self,
        db: AsyncSession,
        data: QuestionSaveRequest,
    ) -> list[SaveQuestionItemContext]:
        normalized_items: list[SaveQuestionItemContext] = []
        for question in data.questions:
            candidate_id = self._resolve_item_candidate_id(data, question)
            fallback_position_id = self._resolve_item_position_id(data, question)
            resolved_position_id = fallback_position_id
            generation_job_id = self._resolve_item_generation_job_id(data, question)

            if candidate_id is not None:
                candidate = await candidate_repository.find_by_id(db, candidate_id)
                if not candidate:
                    raise NotFoundException("Candidate not found")
                resolved_position_id = await self._resolve_save_position_id(
                    db,
                    candidate,
                    fallback_position_id,
                )
            elif fallback_position_id is not None and not await position_repository.find_by_id(
                db,
                fallback_position_id,
            ):
                raise NotFoundException("Position not found")

            question_type = (
                question.question_type
                or data.question_type
                or self._get_default_save_question_type(candidate_id, resolved_position_id)
            )

            normalized_items.append(
                SaveQuestionItemContext(
                    question_text=question.question_text,
                    question_type=question_type,
                    evaluation_intent=question.evaluation_intent,
                    generation_basis=question.generation_basis,
                    candidate_id=candidate_id,
                    position_id=resolved_position_id,
                    generation_job_id=generation_job_id,
                )
            )

        return normalized_items

    async def _build_existing_question_keys_by_target(
        self,
        db: AsyncSession,
        question_items: list[SaveQuestionItemContext],
    ) -> dict[tuple[int | None, int | None], set[tuple[str, str]]]:
        existing_question_keys_by_target: dict[
            tuple[int | None, int | None],
            set[tuple[str, str]],
        ] = {}

        targets = {(item.candidate_id, item.position_id) for item in question_items}
        for candidate_id, position_id in targets:
            existing_questions = await question_repository.find_by_target(
                db,
                position_id=position_id,
                candidate_id=candidate_id,
            )
            existing_question_keys_by_target[(candidate_id, position_id)] = {
                (existing_question.question_type, existing_question.question_text.strip())
                for existing_question in existing_questions
                if existing_question.question_text
            }

        return existing_question_keys_by_target

    def _get_unique_new_questions(
        self,
        question_items: list[SaveQuestionItemContext],
        existing_question_keys_by_target: dict[
            tuple[int | None, int | None],
            set[tuple[str, str]],
        ],
    ) -> list[SaveQuestionItemContext]:
        unique_question_items: list[SaveQuestionItemContext] = []
        for question_item in question_items:
            target_key = (question_item.candidate_id, question_item.position_id)
            seen_question_keys = existing_question_keys_by_target.setdefault(target_key, set())
            question_key = (
                question_item.question_type,
                question_item.question_text.strip(),
            )
            if question_key in seen_question_keys:
                continue

            seen_question_keys.add(question_key)
            unique_question_items.append(question_item)

        return unique_question_items

    def _get_default_save_question_type(
        self,
        candidate_id: int | None,
        position_id: int | None,
    ) -> str:
        if candidate_id is not None:
            if position_id is not None:
                return CANDIDATE_JOB_FIT_BASED_QUESTION_TYPE
            return CANDIDATE_RESUME_BASED_QUESTION_TYPE
        return POSITION_BASED_QUESTION_TYPE

    async def _validate_generation_job_questions(
        self,
        db: AsyncSession,
        question_items: list[SaveQuestionItemContext],
        request_generation_job_id: int | None,
        created_by_user_id: int | None,
        created_by_interviewer_id: int | None,
    ) -> None:
        job_cache: dict[int, QuestionGenerationJob] = {}
        generated_question_keys_cache: dict[int, set[tuple[str, str]]] = {}

        for question_item in question_items:
            generation_job_id = (
                question_item.generation_job_id
                if question_item.generation_job_id is not None
                else request_generation_job_id
            )
            if generation_job_id is None:
                continue

            job = job_cache.get(generation_job_id)
            if job is None:
                job = await question_generation_job_repository.find_by_id(
                    db,
                    generation_job_id,
                )
                if not job:
                    raise NotFoundException("질문 생성 작업을 찾을 수 없습니다.")

                self._validate_generation_job_owner(
                    job=job,
                    created_by_user_id=created_by_user_id,
                    created_by_interviewer_id=created_by_interviewer_id,
                )

                if job.status != QUESTION_GENERATION_STATUS_SUCCEEDED:
                    raise ConflictException("완료된 질문 생성 작업만 저장할 수 있습니다.")

                job_cache[generation_job_id] = job
                generated_question_keys_cache[generation_job_id] = self._get_generated_question_keys(job)

            if job.candidate_id != question_item.candidate_id:
                raise ConflictException("질문 생성 작업의 지원자 정보가 일치하지 않습니다.")

            if job.position_id is not None and job.position_id != question_item.position_id:
                raise ConflictException("질문 생성 작업의 직무 정보가 일치하지 않습니다.")

            generated_question_keys = generated_question_keys_cache[generation_job_id]
            if (
                question_item.question_type,
                question_item.question_text.strip(),
            ) not in generated_question_keys:
                raise ConflictException(
                    "선택한 질문이 해당 생성 작업의 결과에 포함되어 있지 않습니다."
                )

    def _resolve_item_candidate_id(
        self,
        data: QuestionSaveRequest,
        question: QuestionSaveItem,
    ) -> int | None:
        if question.candidate_id is not None:
            return question.candidate_id
        return data.candidate_id

    def _resolve_item_position_id(
        self,
        data: QuestionSaveRequest,
        question: QuestionSaveItem,
    ) -> int | None:
        if question.position_id is not None:
            return question.position_id
        return data.position_id

    def _resolve_item_generation_job_id(
        self,
        data: QuestionSaveRequest,
        question: QuestionSaveItem,
    ) -> int | None:
        if question.generation_job_id is not None:
            return question.generation_job_id
        return data.generation_job_id

    def _validate_generation_job_owner(
        self,
        job: QuestionGenerationJob,
        created_by_user_id: int | None,
        created_by_interviewer_id: int | None,
    ) -> None:
        if created_by_user_id is not None:
            if job.created_by_user_id != created_by_user_id:
                raise ForbiddenException("질문 생성 작업에 접근할 수 없습니다.")
            return

        if created_by_interviewer_id is not None:
            if job.created_by_interviewer_id != created_by_interviewer_id:
                raise ForbiddenException("질문 생성 작업에 접근할 수 없습니다.")
            return

        raise ForbiddenException("질문 생성 작업 소유자를 확인할 수 없습니다.")

    def _get_generated_question_keys(
        self,
        job: QuestionGenerationJob,
    ) -> set[tuple[str, str]]:
        generated_question_keys: set[tuple[str, str]] = set()
        for question in job.result_questions or []:
            question_text = (
                question.get("question_text")
                or question.get("questionText")
                or ""
            )
            question_type = (
                question.get("question_type")
                or question.get("questionType")
                or CANDIDATE_JOB_FIT_BASED_QUESTION_TYPE
            )
            stripped_question_text = str(question_text).strip()
            stripped_question_type = str(question_type).strip()
            if stripped_question_text and stripped_question_type:
                generated_question_keys.add(
                    (stripped_question_type, stripped_question_text)
                )

        return generated_question_keys


question_service = QuestionService()
