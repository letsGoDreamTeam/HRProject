# 기존
# from sqlalchemy import select

# 건우 추가
from sqlalchemy import select, update, delete

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.candidate import Candidate


class CandidateRepository:
    # 건우코드
    # [추가] 전체 지원자 목록 조회
    async def find_all(self, db: AsyncSession) -> list[Candidate]:
        # 지원자 전체 목록 최신순으로 조회
        result = await db.scalars(
            select(Candidate)
            .options(selectinload(Candidate.position))
            .order_by(Candidate.candidate_id.desc())
        )
        return result.all()

    async def find_all_by_position_id(
        self,
        db: AsyncSession,
        position_id: int,
    ) -> list[Candidate]:
        result = await db.scalars(
            select(Candidate)
            .where(Candidate.position_id == position_id)
            .options(selectinload(Candidate.position))
            .order_by(Candidate.candidate_id.desc())
        )
        return list(result.all())

    # 기존
    async def find_by_id(
        self,
        db: AsyncSession,
        candidate_id: int,
    ) -> Candidate | None:
        return await db.get(Candidate, candidate_id)

    # 기존
    async def find_by_id_with_position(
        self,
        db: AsyncSession,
        candidate_id: int,
    ) -> Candidate | None:
        result = await db.scalars(
            select(Candidate)
            .where(Candidate.candidate_id == candidate_id)
            .options(selectinload(Candidate.position))
        )
        return result.one_or_none()

    async def find_by_id_with_details(
        self,
        db: AsyncSession,
        candidate_id: int,
    ) -> Candidate | None:
        result = await db.scalars(
            select(Candidate)
            .where(Candidate.candidate_id == candidate_id)
            .options(
                selectinload(Candidate.position),
                selectinload(Candidate.booking_invitations),
            )
        )
        return result.one_or_none()

    # 기존
    async def find_by_identity(
        self,
        db: AsyncSession,
        phone: str | None,
        name: str | None,
    ) -> Candidate | None:
        if phone and name:
            return await db.scalar(
                select(Candidate)
                .where(
                    Candidate.phone == phone,
                    Candidate.name == name,
                )
                .order_by(Candidate.candidate_id.asc())
                .limit(1)
            )

        return None

    # 기존
    def save(self, db: AsyncSession, candidate: Candidate) -> Candidate:
        db.add(candidate)
        return candidate

    # 건우코드
    # [추가] 지원자 정보 수정
    async def update_candidate(
        self, db: AsyncSession, candidate_id: int, update_data: dict
    ) -> Candidate | None:
        # 입력된 데이터(dict)를 기반으로 지원자 정보 수정
        await db.execute(
            update(Candidate)
            .where(Candidate.candidate_id == candidate_id)
            .values(**update_data)
        )
        await db.flush()
        # 업데이트된 객체 다시 확인
        return await self.find_by_id(db, candidate_id)

    # 건우코드
    # [추가] 지원자 삭제
    async def delete_candidate(self, db: AsyncSession, candidate_id: int) -> bool:
        candidate = await self.find_by_id(db, candidate_id)
        if candidate:
            await db.delete(candidate)
            await db.flush()
            return True
        return False


candidate_repository = CandidateRepository()
