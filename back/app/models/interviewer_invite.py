from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.dependencies.database import Base

if TYPE_CHECKING:
    from app.models.interviewer import Interviewer
    from app.models.user import User


class InterviewerInvite(Base):
    __tablename__ = "interviewer_invites"

    invite_id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )
    interviewer_id: Mapped[int] = mapped_column(
        ForeignKey("interviewers.interviewer_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        unique=True,
        index=True,
    )
    raw_token: Mapped[str | None] = mapped_column(
        String(256),
        nullable=True,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    availability_decision: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )
    availability_note: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
    )
    availability_decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    interviewer: Mapped["Interviewer"] = relationship(
        back_populates="invites",
    )
    created_by_user: Mapped["User | None"] = relationship(
        back_populates="created_interviewer_invites",
    )
