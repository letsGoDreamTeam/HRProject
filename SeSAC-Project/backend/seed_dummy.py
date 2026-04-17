#!/usr/bin/env python3
"""
더미 데이터 시드 스크립트.
실행: uv run python seed_dummy.py  (backend 폴더에서)
또는: python seed_dummy.py
백엔드 서버가 실행 중이어야 합니다 (기본 http://127.0.0.1:8000).
"""

import json
import sys
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8000"
SEED_EMAIL = "seed@demo.com"
SEED_PASSWORD = "seed1234!"
SEED_NAME = SEED_EMAIL.split("@")[0]


def req(method, path, body=None, token=None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_bytes = e.read()
        try:
            msg = body_bytes.decode("utf-8")[:200]
        except Exception:
            msg = repr(body_bytes[:200])
        print(f"  [FAIL] {method} {path} HTTP {e.code}: {msg}")
        return None


def main():
    print("=" * 60)
    print("A-RECRUIT 더미 데이터 시드")
    print("=" * 60)

    # ── 1. 계정 등록 또는 로그인 ──────────────────────────────
    print("\n[1] 계정 확인...")
    token_data = req("POST", "/api/hr/auth/login", {"email": SEED_EMAIL, "password": SEED_PASSWORD})
    if not token_data:
        print("  -> 계정 없음, 신규 등록...")
        reg = req("POST", "/api/hr/auth/register", {
            "email": SEED_EMAIL, "password": SEED_PASSWORD, "full_name": SEED_NAME
        })
        if not reg:
            print("  [FAIL] 계정 등록 실패. 백엔드가 실행 중인지 확인하세요.")
            sys.exit(1)
        token_data = req("POST", "/api/hr/auth/login", {"email": SEED_EMAIL, "password": SEED_PASSWORD})

    token = token_data["access_token"]
    print(f"  [OK] 로그인 완료: {token_data['user']['email']}")

    # ── 2. 직무 등록 ──────────────────────────────────────────
    print("\n[2] 직무 등록...")
    job_roles_payload = {
        "source_document_name": "2026 상반기 채용 직무 가이드",
        "jobs": [
            {"department": "프론트엔드팀", "job_title": "프론트엔드 엔지니어", "role_grade": "신입/경력", "body_text": "React/Next.js 기반 서비스 개발"},
            {"department": "백엔드팀", "job_title": "백엔드 엔지니어", "role_grade": "경력 2년+", "body_text": "FastAPI/Django 기반 서버 개발"},
            {"department": "AI연구소", "job_title": "ML 엔지니어", "role_grade": "경력 3년+", "body_text": "LLM Fine-tuning, RAG 시스템 구축"},
            {"department": "데이터팀", "job_title": "데이터 분석가", "role_grade": "신입/경력", "body_text": "SQL, Python 기반 데이터 분석"},
            {"department": "디자인팀", "job_title": "UX 디자이너", "role_grade": "경력 1년+", "body_text": "Figma 기반 UX/UI 설계"},
            {"department": "인프라팀", "job_title": "DevOps 엔지니어", "role_grade": "경력 3년+", "body_text": "Kubernetes, CI/CD 파이프라인 운영"},
        ],
    }
    jobs_result = req("PUT", "/api/hr/job-roles/bulk", job_roles_payload, token)
    if not jobs_result:
        print("  [FAIL] 직무 등록 실패")
        job_roles = []
    else:
        job_roles = jobs_result
        print(f"  [OK] 직무 {len(job_roles)}개 등록 완료")

    # job_role id 매핑
    job_map = {j["job_title"]: j["id"] for j in job_roles}

    # ── 3. 채용 절차 설정 등록 ────────────────────────────────
    print("\n[3] 채용 절차 설정 등록...")

    PROCESS_CONFIGS = [
        {
            "name": "프론트엔드팀 채용절차",
            "department": "프론트엔드팀",
            "stages": [
                {"key": "document_screening", "label": "서류 접수"},
                {"key": "interview_1", "label": "1차 코딩테스트"},
                {"key": "interview_2", "label": "2차 기술면접"},
                {"key": "interview_3", "label": "3차 임원면접"},
                {"key": "final", "label": "최종 합격"},
                {"key": "rejected", "label": "불합격"},
            ],
        },
        {
            "name": "백엔드팀 채용절차",
            "department": "백엔드팀",
            "stages": [
                {"key": "document_screening", "label": "서류 접수"},
                {"key": "interview_1", "label": "1차 과제전형"},
                {"key": "interview_2", "label": "2차 코드리뷰"},
                {"key": "interview_3", "label": "3차 기술면접"},
                {"key": "interview_4", "label": "4차 임원면접"},
                {"key": "final", "label": "최종 합격"},
                {"key": "rejected", "label": "불합격"},
            ],
        },
        {
            "name": "AI연구소 채용절차",
            "department": "AI연구소",
            "stages": [
                {"key": "document_screening", "label": "서류 접수"},
                {"key": "interview_1", "label": "1차 논문·포트폴리오 리뷰"},
                {"key": "interview_2", "label": "2차 코딩테스트"},
                {"key": "interview_3", "label": "3차 ML 설계 면접"},
                {"key": "interview_4", "label": "4차 팀장 면접"},
                {"key": "interview_5", "label": "5차 CTO 최종면접"},
                {"key": "final", "label": "최종 합격"},
                {"key": "rejected", "label": "불합격"},
            ],
        },
        {
            "name": "데이터팀 채용절차",
            "department": "데이터팀",
            "stages": [
                {"key": "document_screening", "label": "서류 접수"},
                {"key": "interview_1", "label": "1차 SQL 테스트"},
                {"key": "interview_2", "label": "2차 기술면접"},
                {"key": "final", "label": "최종 합격"},
                {"key": "rejected", "label": "불합격"},
            ],
        },
        {
            "name": "디자인팀 채용절차",
            "department": "디자인팀",
            "stages": [
                {"key": "document_screening", "label": "서류 접수"},
                {"key": "interview_1", "label": "1차 포트폴리오 발표"},
                {"key": "interview_2", "label": "2차 실기 테스트"},
                {"key": "interview_3", "label": "3차 컬처핏 면접"},
                {"key": "final", "label": "최종 합격"},
                {"key": "rejected", "label": "불합격"},
            ],
        },
    ]

    process_ids = {}
    for pc in PROCESS_CONFIGS:
        result = req("POST", "/api/hr/recruitment-process", pc, token)
        if result:
            process_ids[pc["department"]] = result["id"]
            print(f"  [OK] {pc['name']} ({len(pc['stages'])}단계)")
        else:
            print(f"  [FAIL] {pc['name']} 등록 실패")

    # ── 4. 지원서 배치 + 아이템 등록 ─────────────────────────
    print("\n[4] 지원서 배치 + 지원자 데이터 등록...")

    CANDIDATES_BY_DEPT = {
        "프론트엔드팀": [
            ("최행채", "React 18 기반 웹앱 개발 경험. Next.js App Router 최적화로 LCP 40% 개선.", "A", True, "document_screening"),
            ("조최택", "Lighthouse 퍼포먼스 90+ 달성. TypeScript 엄격 모드 적용 및 번들 사이즈 최적화.", "A", True, "interview_1"),
            ("박에이", "Redux -> Zustand 마이그레이션, 크로스브라우저 호환성 전담 경험.", "B", True, "interview_2"),
            ("정리덱", "SSR/RSC 구조 설계, Web Vitals 지표 기반 A/B 테스트 운영.", "B", True, "interview_3"),
            ("이이웹", "React Native 경험, 반응형 웹 구현에 능숙. 인턴 6개월.", "C", False, "document_screening"),
            ("강웅음", "Vue.js 주 사용, React 학습 중. 포트폴리오 3건.", "C", False, "rejected"),
        ],
        "백엔드팀": [
            ("오그레", "FastAPI + PostgreSQL 기반 마이크로서비스 설계. 트래픽 3배 증가 대응 경험.", "A", True, "document_screening"),
            ("임데이터", "Django REST Framework, Celery 비동기 처리, Redis 캐시 레이어 구축.", "A", True, "interview_1"),
            ("권드룸", "Go + gRPC 마이크로서비스 전환 경험. 쿠버네티스 배포 자동화.", "A", True, "interview_2"),
            ("전영선", "Spring Boot에서 FastAPI로 전환 경험. 대용량 파일 처리 배치 시스템 개발.", "B", True, "interview_3"),
            ("윤보하이", "Node.js Express API 서버 개발, MySQL 쿼리 최적화 경험.", "B", False, "interview_1"),
            ("한에버", "Flask 기반 소규모 API 경험. 백엔드 전향 준비 중.", "C", False, "rejected"),
        ],
        "AI연구소": [
            ("신마기", "LangChain + Pinecone RAG 시스템 구축, GPT-4 Fine-tuning 프로젝트 리드.", "A", True, "document_screening"),
            ("안벡터", "Hugging Face Transformers 활용 NLP 모델 학습. arXiv 논문 2편 게재.", "A", True, "interview_1"),
            ("통흠노", "PyTorch 기반 멀티모달 모델 개발. 카카오 AI 챌린지 3위 입상.", "A", True, "interview_2"),
            ("박채운", "TensorFlow Lite 모바일 추론 최적화 경험. ML 파이프라인 MLflow 관리.", "B", True, "interview_3"),
            ("이알파", "Stable Diffusion Fine-tuning, ComfyUI 커스텀 노드 개발.", "B", False, "interview_2"),
            ("고디비", "Sklearn 기반 분류 모델 경험. 딥러닝 실무 경험 부족.", "C", False, "rejected"),
        ],
        "데이터팀": [
            ("송리드", "Redshift + dbt 기반 데이터 웨어하우스 구축. A/B 테스트 통계 분석 전담.", "A", True, "document_screening"),
            ("백에이", "Spark 기반 대용량 로그 처리, Tableau 대시보드 구축 경험.", "A", True, "interview_1"),
            ("김프론", "SQL 고급 쿼리 작성, Python 데이터 분석 자동화 스크립트 개발.", "B", True, "interview_2"),
            ("최데이터", "Google Analytics 분석, 마케팅 데이터 파이프라인 구축 경험.", "B", True, "interview_1"),
            ("정기획", "Excel·Power BI 수준의 분석. SQL 입문 단계.", "C", False, "rejected"),
        ],
        "디자인팀": [
            ("유스포", "Figma 컴포넌트 시스템 구축, 디자인 시스템 문서화 경험. B2C 앱 리디자인 리드.", "A", True, "document_screening"),
            ("전려진", "사용자 리서치 기반 UX 개선, Maze 프로토타입 테스트 운영.", "A", True, "interview_1"),
            ("이개발", "모바일 앱 UI 디자인, 개발자 협업 핸드오프 경험 풍부.", "B", True, "interview_2"),
            ("박디자", "Figma 초급, 에셋 제작 위주. 인터랙션 디자인 학습 중.", "C", False, "rejected"),
        ],
    }

    for dept, candidates in CANDIDATES_BY_DEPT.items():
        job_role_id = job_map.get(
            {"프론트엔드팀": "프론트엔드 엔지니어", "백엔드팀": "백엔드 엔지니어",
             "AI연구소": "ML 엔지니어", "데이터팀": "데이터 분석가", "디자인팀": "UX 디자이너"}.get(dept, "")
        )
        batch_payload = {
            "title": f"2026 상반기 {dept} 채용",
            "jd_preferred_text": f"{dept} 관련 실무 경험, 협업 도구 활용 능력",
            "job_role_id": job_role_id,
            "employer_sector": "private",
        }
        batch = req("POST", "/api/hr/applications/batches/json", batch_payload, token)
        if not batch:
            print(f"  [FAIL] {dept} 배치 생성 실패")
            continue
        batch_id = batch["id"]

        # 지원자 아이템 직접 DB 추가는 API가 없어 stage PATCH로 대신 처리
        # -> batches/json으로 배치만 만든 후, 아이템은 별도 경로가 없으므로
        #   실제 업로드 없이 stage를 PATCH할 수 없음.
        # 대신: 기존 배치에 items가 있다면 stage만 업데이트
        # -> 실제로는 items가 없으므로, 이 스크립트는 배치+절차 설정만 만들고
        #   아이템은 실제 업로드나 아래 JSON 직접 삽입 방식 사용
        print(f"  [OK] {dept} 배치 생성: {batch_id}")

    print("\n" + "=" * 60)
    print("[OK] 시드 완료!")
    print(f"  - 직무: {len(job_roles)}개")
    print(f"  - 채용 절차: {len(process_ids)}개")
    print(f"  - 배치: {len(CANDIDATES_BY_DEPT)}개")
    print("\nNOTE: 지원자 아이템은 /hr/applications 에서 PDF 업로드 후 AI 분석하거나,")
    print("  아래 seed_items.py 를 실행하여 DB에 직접 삽입할 수 있습니다.")
    print("=" * 60)


if __name__ == "__main__":
    main()
