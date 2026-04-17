from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from app.config import Settings


def _safe_name(name: str) -> str:
    raw = (name or "document").strip() or "document"
    return "".join(ch if ch.isalnum() or ch in ("-", "_", ".") else "_" for ch in raw)[:180] or "document"


def _local_root(settings: Settings) -> Path:
    p = Path(settings.resume_object_store_local_dir or ".resume_objects")
    if not p.is_absolute():
        p = Path.cwd() / p
    p.mkdir(parents=True, exist_ok=True)
    return p


def put_resume_source_bytes(*, settings: Settings, user_id: str, filename: str, data: bytes) -> str:
    backend = (settings.resume_object_store_backend or "local").strip().lower()
    if backend == "s3":
        try:
            import boto3  # type: ignore
        except Exception as e:  # noqa: BLE001
            raise RuntimeError("S3 백엔드를 쓰려면 boto3 패키지가 필요합니다.") from e
        bucket = (settings.resume_object_store_s3_bucket or "").strip()
        if not bucket:
            raise RuntimeError("resume_object_store_s3_bucket 설정이 필요합니다.")
        prefix = (settings.resume_object_store_s3_prefix or "resume-objects").strip().strip("/")
        key = f"{prefix}/{user_id}/{uuid4()}_{_safe_name(filename)}"
        client = boto3.client("s3", region_name=(settings.resume_object_store_s3_region or None))
        client.put_object(Bucket=bucket, Key=key, Body=data)
        return f"s3://{bucket}/{key}"

    root = _local_root(settings)
    key = f"{user_id}/{uuid4()}_{_safe_name(filename)}"
    out = root / key
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    return f"local://{key.replace('\\', '/')}"


def get_resume_source_bytes(*, settings: Settings, source_object_key: str) -> bytes:
    key = (source_object_key or "").strip()
    if not key:
        raise FileNotFoundError("source_object_key is empty")

    if key.startswith("s3://"):
        try:
            import boto3  # type: ignore
        except Exception as e:  # noqa: BLE001
            raise RuntimeError("S3 백엔드를 쓰려면 boto3 패키지가 필요합니다.") from e
        # s3://bucket/path/to/key
        no_scheme = key[len("s3://") :]
        bucket, _, obj_key = no_scheme.partition("/")
        if not bucket or not obj_key:
            raise FileNotFoundError("잘못된 S3 객체 키 형식입니다.")
        client = boto3.client("s3", region_name=(settings.resume_object_store_s3_region or None))
        obj = client.get_object(Bucket=bucket, Key=obj_key)
        return obj["Body"].read()

    if key.startswith("local://"):
        rel = key[len("local://") :].lstrip("/")
        path = _local_root(settings) / rel
        if not path.is_file():
            raise FileNotFoundError("원본 객체를 찾을 수 없습니다.")
        return path.read_bytes()

    raise FileNotFoundError("지원하지 않는 source_object_key 형식입니다.")
