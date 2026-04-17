from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps_auth import get_current_user
from app.models_hr import RecruitmentProcessConfig, User
from app.schemas_hr import (
    RecruitmentProcessCreate,
    RecruitmentProcessOut,
    RecruitmentProcessPatch,
)

router = APIRouter(prefix="/api/hr/recruitment-process", tags=["hr-recruitment-process"])


def _to_out(cfg: RecruitmentProcessConfig) -> RecruitmentProcessOut:
    return RecruitmentProcessOut(
        id=cfg.id,
        name=cfg.name,
        department=cfg.department,
        stages=cfg.stages or [],
        created_at=cfg.created_at,
        updated_at=cfg.updated_at,
    )


@router.get("", response_model=list[RecruitmentProcessOut])
def list_configs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(503, "DATABASE_URL not set")
    rows = db.scalars(
        select(RecruitmentProcessConfig)
        .where(RecruitmentProcessConfig.user_id == current_user.id)
        .order_by(RecruitmentProcessConfig.created_at)
    ).all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=RecruitmentProcessOut, status_code=201)
def create_config(
    body: RecruitmentProcessCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(503, "DATABASE_URL not set")
    cfg = RecruitmentProcessConfig(
        user_id=current_user.id,
        name=body.name,
        department=body.department,
        stages=[s.model_dump() for s in body.stages],
    )
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return _to_out(cfg)


@router.get("/{config_id}", response_model=RecruitmentProcessOut)
def get_config(
    config_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(503, "DATABASE_URL not set")
    cfg = db.get(RecruitmentProcessConfig, config_id)
    if not cfg or cfg.user_id != current_user.id:
        raise HTTPException(404, "Not found")
    return _to_out(cfg)


@router.patch("/{config_id}", response_model=RecruitmentProcessOut)
def patch_config(
    config_id: uuid.UUID,
    body: RecruitmentProcessPatch,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(503, "DATABASE_URL not set")
    cfg = db.get(RecruitmentProcessConfig, config_id)
    if not cfg or cfg.user_id != current_user.id:
        raise HTTPException(404, "Not found")
    if body.name is not None:
        cfg.name = body.name
    if body.department is not None:
        cfg.department = body.department
    if body.stages is not None:
        cfg.stages = [s.model_dump() for s in body.stages]
    db.commit()
    db.refresh(cfg)
    return _to_out(cfg)


@router.delete("/{config_id}")
def delete_config(
    config_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session | None, Depends(get_db)],
):
    if db is None:
        raise HTTPException(503, "DATABASE_URL not set")
    cfg = db.get(RecruitmentProcessConfig, config_id)
    if not cfg or cfg.user_id != current_user.id:
        raise HTTPException(404, "Not found")
    db.delete(cfg)
    db.commit()
    return {"ok": True, "deleted_id": str(config_id)}
