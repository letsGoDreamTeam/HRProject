#!/usr/bin/env python3
"""
로컬 CLI: 이력서 파일을 파싱한 뒤 직무기술서와 합쳐 면접 질문을 생성합니다.

예 (backend 폴더에서):
    uv sync
    uv run python scripts/generate_interview.py -r ./sample_resume.pdf \\
        -j ./job_description.txt

TSV 예:
    uv run python scripts/generate_interview.py -r ./a.docx \\
        --job-tsv ./table.tsv -d 해외영업
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    backend_dir = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend_dir))

    from ParsingToExcel import parse_resume_file

    from app.services.interview_questions_service import (
        bundle_to_markdown,
        generate_bundle_from_parsed_resume,
    )
    from app.services.job_description_text import load_job_description_text, pick_jd_from_tsv
    from dotenv import load_dotenv

    load_dotenv(backend_dir / ".env")

    p = argparse.ArgumentParser(description="이력서 파싱 + 직무기술서 → 면접 질문 (OpenAI)")
    p.add_argument("-r", "--resume", required=True, help="이력서 파일 (.pdf .docx .hwp 등)")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("-j", "--job-file", help="직무기술서 파일")
    g.add_argument("--job-text", help="직무기술서 본문 문자열")
    g.add_argument("--job-tsv", help="부서\t직무 TSV 파일")
    p.add_argument("-d", "--department", help="TSV 검색 부서 부분 문자열")
    p.add_argument("--model", help="OPENAI_MODEL 대체값")
    p.add_argument("--json-out", type=Path, help="JSON 저장 경로")
    p.add_argument("--md-out", type=Path, help="마크다운 저장 경로")
    args = p.parse_args()

    resume_path = str(Path(args.resume).resolve())

    parsed = parse_resume_file(resume_path)

    jd = ""
    if args.job_text is not None:
        jd = args.job_text.strip()
    elif args.job_file:
        jd = load_job_description_text(Path(args.job_file).resolve())
    elif args.job_tsv:
        _dept, jd = pick_jd_from_tsv(Path(args.job_tsv).resolve(), args.department)
        if dept := _dept:
            print(f"[선택된 부서] {dept}", file=sys.stderr)
        if not jd.strip():
            print("직무기술서를 찾지 못했습니다. --department 로 좁히세요.", file=sys.stderr)
            return 1

    try:
        bundle = generate_bundle_from_parsed_resume(parsed, jd, model=args.model)
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 2
    except Exception as e:
        print(f"실패: {e}", file=sys.stderr)
        return 3

    md = bundle_to_markdown(bundle)
    print(md)

    if args.json_out:
        args.json_out.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"JSON: {args.json_out}", file=sys.stderr)
    if args.md_out:
        args.md_out.write_text(md, encoding="utf-8")
        print(f"MD: {args.md_out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
