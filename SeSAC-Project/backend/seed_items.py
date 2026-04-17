#!/usr/bin/env python3
"""
지원자 아이템 더미 데이터 DB 직접 삽입 스크립트.
실행: uv run python seed_items.py  (backend 폴더에서)
seed_dummy.py 실행 후 이 스크립트를 실행하세요.
"""

import sys
import os
import uuid
from datetime import datetime, timezone

# 백엔드 경로 추가
sys.path.insert(0, os.path.dirname(__file__))

from app.database import init_db, get_engine
from app.models_hr import ApplicationFilterBatch, ApplicationFilterItem, User
from app.models import Base
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy import select

SEED_EMAIL = "seed@demo.com"

CANDIDATES_BY_DEPT = {
    "프론트엔드팀": [
        ("최행채", "React 18 기반 웹앱 개발 경험. Next.js App Router 최적화로 LCP 40% 개선. TypeScript strict mode 운영.", "A", True, "document_screening"),
        ("조최택", "Lighthouse 퍼포먼스 90+ 달성. 번들 사이즈 최적화 및 코드 스플리팅 적용 경험.", "A", True, "interview_1"),
        ("박에이", "Redux→Zustand 마이그레이션 리드. 크로스브라우저 호환성 전담.", "B", True, "interview_2"),
        ("정리덱", "Next.js 14 App Router 도입 및 SSR/RSC 최적화로 응답속도 40% 단축.", "B", True, "interview_3"),
        ("이이웹", "React Native 경험. 반응형 웹 구현에 능숙. 인턴 6개월.", "C", False, "document_screening"),
        ("강웅음", "Vue.js 주 사용. React 학습 중. 포트폴리오 3건.", "C", False, "rejected"),
        ("김프레임", "Svelte 및 React 경험. WebSocket 기반 실시간 협업 기능 구현.", "B", True, "interview_1"),
    ],
    "백엔드팀": [
        ("오그레", "FastAPI + PostgreSQL 기반 마이크로서비스 설계. 트래픽 3배 증가 대응 경험.", "A", True, "document_screening"),
        ("임데이터", "Django REST Framework, Celery 비동기 처리, Redis 캐시 레이어 구축.", "A", True, "interview_1"),
        ("권드룸", "Go + gRPC 마이크로서비스 전환 경험. 쿠버네티스 배포 자동화.", "A", True, "interview_2"),
        ("전영선", "Spring Boot→FastAPI 전환 경험. 대용량 파일 처리 배치 시스템 개발.", "B", True, "interview_3"),
        ("윤보하이", "Node.js Express API 서버 개발, MySQL 쿼리 최적화 경험.", "B", False, "interview_1"),
        ("한에버", "Flask 기반 소규모 API 경험. 백엔드 전향 준비 중.", "C", False, "rejected"),
        ("서버맨", "NestJS + TypeORM 기반 REST API, JWT 인증 미들웨어 직접 구현.", "B", True, "interview_4"),
    ],
    "AI연구소": [
        ("신마기", "LangChain + Pinecone RAG 시스템 구축. GPT-4 Fine-tuning 프로젝트 리드.", "A", True, "document_screening"),
        ("안벡터", "Hugging Face Transformers NLP 모델 학습. arXiv 논문 2편 게재.", "A", True, "interview_1"),
        ("통흠노", "PyTorch 멀티모달 모델 개발. 카카오 AI 챌린지 3위 입상.", "A", True, "interview_2"),
        ("박채운", "TensorFlow Lite 모바일 추론 최적화. MLflow 기반 ML 파이프라인 관리.", "B", True, "interview_3"),
        ("이알파", "Stable Diffusion Fine-tuning, ComfyUI 커스텀 노드 개발.", "B", False, "interview_2"),
        ("고디비", "Sklearn 기반 분류 모델 경험. 딥러닝 실무 경험 부족.", "C", False, "rejected"),
        ("류엘엠", "Llama2 로컬 서빙, vLLM 최적화. 논문 리뷰 스터디 운영.", "A", True, "interview_4"),
        ("박파인", "데이터 레이블링 파이프라인 구축. 모델 성능 지표 대시보드 제작.", "B", True, "interview_5"),
    ],
    "데이터팀": [
        ("송리드", "Redshift + dbt 기반 DW 구축. A/B 테스트 통계 분석 전담.", "A", True, "document_screening"),
        ("백에이", "Spark 기반 대용량 로그 처리. Tableau 대시보드 구축 경험.", "A", True, "interview_1"),
        ("김프론", "SQL 고급 쿼리, Python 데이터 분석 자동화 스크립트 개발.", "B", True, "interview_2"),
        ("최데이터", "Google Analytics 분석, 마케팅 데이터 파이프라인 구축.", "B", True, "interview_1"),
        ("정기획", "Excel·Power BI 수준. SQL 입문 단계.", "C", False, "rejected"),
    ],
    "디자인팀": [
        ("유스포", "Figma 컴포넌트 시스템 구축. 디자인 시스템 문서화. B2C 앱 리디자인 리드.", "A", True, "document_screening"),
        ("전려진", "사용자 리서치 기반 UX 개선. Maze 프로토타입 테스트 운영.", "A", True, "interview_1"),
        ("이개발", "모바일 앱 UI 디자인. 개발자 협업 핸드오프 경험.", "B", True, "interview_2"),
        ("박디자", "Figma 초급. 에셋 제작 위주. 인터랙션 디자인 학습 중.", "C", False, "rejected"),
    ],
}

DEPT_TO_BATCH_TITLE = {
    "프론트엔드팀": "2026 상반기 프론트엔드팀 채용",
    "백엔드팀": "2026 상반기 백엔드팀 채용",
    "AI연구소": "2026 상반기 AI연구소 채용",
    "데이터팀": "2026 상반기 데이터팀 채용",
    "디자인팀": "2026 상반기 디자인팀 채용",
}


def main():
    print("=" * 60)
    print("지원자 아이템 더미 데이터 삽입")
    print("=" * 60)

    init_db()
    engine = get_engine()
    if engine is None:
        print("[FAIL] DATABASE_URL이 설정되지 않았습니다. .env 파일을 확인하세요.")
        sys.exit(1)

    SessionLocal = sessionmaker(bind=engine)
    db: Session = SessionLocal()

    try:
        # 시드 계정 찾기
        user = db.scalars(select(User).where(User.email == SEED_EMAIL)).first()
        if not user:
            print(f"[FAIL] 계정 '{SEED_EMAIL}'을 찾을 수 없습니다. seed_dummy.py를 먼저 실행하세요.")
            sys.exit(1)

        print(f"[OK] 계정 확인: {user.email} (id: {user.id})")

        total_items = 0
        for dept, candidates in CANDIDATES_BY_DEPT.items():
            batch_title = DEPT_TO_BATCH_TITLE[dept]
            batch = db.scalars(
                select(ApplicationFilterBatch)
                .where(ApplicationFilterBatch.user_id == user.id)
                .where(ApplicationFilterBatch.title == batch_title)
            ).first()

            if not batch:
                print(f"  [FAIL] 배치 없음: '{batch_title}' (seed_dummy.py를 먼저 실행하세요)")
                continue

            # 기존 아이템 삭제 후 재삽입 (중복 방지)
            existing = db.scalars(
                select(ApplicationFilterItem).where(ApplicationFilterItem.batch_id == batch.id)
            ).all()
            for item in existing:
                db.delete(item)
            db.flush()

            for name, summary, tier, preferred, stage in candidates:
                item = ApplicationFilterItem(
                    id=uuid.uuid4(),
                    batch_id=batch.id,
                    filename=f"{name}_이력서.pdf",
                    content_text=summary,
                    blind_tier=tier,
                    blind_summary=summary,
                    blind_snippets=[summary[:80]],
                    preferred_met=preferred,
                    preferred_reason="우대 조건 충족" if preferred else "우대 조건 미충족",
                    keyword_flags=["Python", "협업"] if preferred else [],
                    candidate_name=name,
                    stage=stage,
                    analyzed_at=datetime.now(timezone.utc),
                )
                db.add(item)
                total_items += 1

            db.commit()
            print(f"  [OK] {dept}: {len(candidates)}명 삽입 (배치: {batch.id})")

        print(f"\n[OK] 총 {total_items}명 지원자 데이터 삽입 완료")
        print("=" * 60)

    except Exception as e:
        db.rollback()
        print(f"[FAIL] 오류 발생: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
