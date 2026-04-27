# 이력서 파싱 백엔드 — API 명세 & 논리 ERD

HTTP는 FastAPI, 비즈니스·I/O는 `app/` 패키지(라우터·서비스·레포지토리·스키마), 파싱·엑셀은 루트 `ParsingToExcel.py`를 기준으로 정리했습니다. **SQLAlchemy**로 지원자 연락처 테이블(`candidates`) ORM·Pydantic 스키마가 정의되어 있으나, **HTTP API·마이그레이션은 연동하지 않은 상태**이며 RDB 접속은 환경 변수 `DATABASE_URL`이 있을 때만 `get_engine()` 등으로 사용합니다. 아래 [5. ERD (논리 / DB 도입 시 참고)](#5-erd-논리--db-도입-시-참고)는 이력서·공고까지 확장할 때의 **추가 논리 모델**입니다.

**이름 구분:** `resume_parse_*` = 이력서 업로드·파싱 API 파이프라인. `candidate_orm` / `candidate_schemas` = 지원자 연락처(ERD·DB용 ORM/ Pydantic).

**백엔드 레이어(이력서 파싱 요청):** `routers` → `services` → `repositories` → `ParsingToExcel` (`app/` 하위는 `__init__.py` 없이 네임스페이스 패키지로 구성). 엔트리: 루트 `main.py`가 `app.main`의 ASGI `app`을 노출.

```mermaid
flowchart LR
  PR[routers/resume_parse_router] --> S[services/resume_parse_service]
  S --> R[repositories/resume_parse_repository]
  R --> P[ParsingToExcel.py]
```

*5절 논리 ERD는 **지원자·이력서·공고** 도입 시 참고용이고, 위 그림은 **현재 HTTP·파이프라인** 구조다.*

---

## 1. API 개요

| 항목 | 내용 |
|------|------|
| 프레임워크 | FastAPI |
| 런타임 기본 | `http://127.0.0.1:8000` (로컬) |
| OpenAPI (Swagger) | `GET /docs` |
| ReDoc | `GET /redoc` |
| CORS (개발) | `http://127.0.0.1:5173`, `http://localhost:5173` |

### 1.1 SQLAlchemy `candidates` (ORM·Pydantic)

연락처 ERD에 맞춘 **물리 컬럼** (내부 PK `id`는 ORM용). 엔진 생성: `DATABASE_URL` 설정 후 `app.db.base.get_engine()`.

| 컬럼 (Python) | SQLAlchemy | 제약 | 한글 |
|---------------|------------|------|------|
| `id` | `Integer` | PK, autoincrement | (내부 식별자) |
| `name` | `String(255)` | nullable | 이름 |
| `date_of_birth` | `Date` | nullable | 생년월일 |
| `gender` | `String(100)` | nullable | 성별 |
| `address` | `String(2000)` | nullable | 현주소 |
| `phone` | `String(100)` | nullable | 휴대폰 |
| `email` | `String(255)` | **UNIQUE**, index, nullable | 이메일(UK) |

- **ORM:** `app.models.candidate_orm.Candidate` — `__tablename__ = "candidates"`
- **Pydantic:** `app.schemas.candidate_schemas` — `CandidateBase` / `CandidateCreate` / `CandidateRead`

---

## 2. 엔드포인트

### 2.1 `POST /api/parse`

**설명** 이력서 파일(복수)을 업로드하면 `ResumeParseService`가 파일별로 `ResumeParseRepository`·`parse_resume_file`(내부: `ParsingToExcel.parse_resume_file`)을 실행하고, 성공한 건에 대해 `export_data_list_to_excel_path`로 xlsx를 만든 뒤 Base64로 함께 반환합니다. (Pydantic 응답 모델: `ResumeParseResponse` 등 — `app.schemas.resume_parse_schemas` 참고.)

**요청**

- **Content-Type:** `multipart/form-data`
- **필드명:** `files` (같은 이름으로 **여러 파트** 가능 — HTML `input file` `multiple` / FormData `append('files', file)`)

**응답** `200 OK` — `application/json`

| 필드 | 타입 | 설명 |
|------|------|------|
| `items` | `array` | 성공한 파일마다 `filename`, `record` |
| `errors` | `array` | 실패한 파일마다 `filename`, `detail` (예외 메시지) |
| `excelBase64` | `string \| null` | 성공 건이 1건 이상일 때만, xlsx 바이너리를 **표준 Base64** 인코딩한 문자열 |
| `excelFileName` | `string \| null` | 엑셀 권장 파일명(코드상 `지원자_통합관리.xlsx` 등) |

**성공 항목 (`items[]`)**

| 필드 | 타입 | 설명 |
|------|------|------|
| `filename` | `string` | 클라이언트가 보낸 원본 파일명 |
| `record` | `object` | 파싱 결과(아래 `record` 스키마) |

**오류 항목 (`errors[]`)**

| 필드 | 타입 | 설명 |
|------|------|------|
| `filename` | `string` | 실패한 파일명 |
| `detail` | `string` | 예외 메시지(예: `libreoffice` 없음, 파싱 실패 등) |

**HTTP 오류**

| 코드 | 조건 |
|------|------|
| `400` | 업로드된 파일이 없을 때(`detail`: 업로드된 파일이 없습니다.) |

**엑셀과 JSON의 차이**  
`export_data_list_to_excel_path`는 `ParsingToExcel`의 `_EXCEL_COLUMNS`만 엑셀에 씁니다. API의 `record`는 그보다 `파일형식` 등 **부가 필드**를 더 포함할 수 있습니다(아래 스키마 참고).

---

## 3. `record` 스키마 (`ParsingToExcel` 기준)

`_finalize_parsed_record` 이후 키입니다. 값은 **문자열**입니다.

### 3.1 핵심 필드(항상 키 존재)

| 키 | 설명 | 비고 |
|----|------|------|
| `이름` | 수신인 이름 | |
| `생년월일` | `YYYY.MM.DD` 등 | |
| `연락처` | 휴대/유선 | |
| `이메일` | | |
| `주소` | | |
| `원문 지원직무` | 문서에서 인식한 직무 문구 | 없으면 `"기타"` |
| `최종학력` | 최종학력 한 줄 요약 | 없으면 `"기타"` |
| `경력기간` | 여러 줄 가능(`\n`) | |
| `경력회사` | 여러 줄 가능 | 경력이 있는데 없으면 `"기타"` 보정 |
| `경력직무` | 여러 줄 가능 | 위와 동일 |

### 3.2 부가 필드(추가로 붙는 경우)

| 키 | 설명 |
|----|------|
| `파일형식` | 예: `DOCX`, `PDF`, `HWP` (확장자 기반) |

`USE_AI` 등으로 파이프라인이 바뀌면, `추출신뢰도`는 사용하지 않으며 **그 밖의 부가 키**는 `_finalize`에서 `추출신뢰도`를 제외하고 전달될 수 있습니다.

### 3.3 엑셀에만 쓰는 열 (`_EXCEL_COLUMNS`)

`이름`, `생년월일`, `연락처`, `이메일`, `주소`, `원문 지원직무`, `최종학력`, `경력기간`, `경력회사`, `경력직무` — `파일형식`은 엑셀 export 시 컬럼에서 제외됩니다.

---

## 4. 파이프라인(파일 → `record`)

`parse_resume_file` 요약:

| 확장자 | 동작 |
|--------|------|
| `.docx` | `python-docx` 기반 `extract_from_docx` |
| `.hwp` | `pyhwp` → 실패 시 LibreOffice로 PDF 변환 후 PyMuPDF |
| `.pdf` | PyMuPDF `extract_from_pdf` |
| `.doc`, `.pptx` 등 | LibreOffice headless → 임시 PDF → PyMuPDF (경로에 `libreoffice` 필요) |

환경 변수(`USE_AI`, API 키 등)는 `ParsingToExcel` 상단·AI 함수 참고.

---

## 5. ERD (논리 / DB 도입 시 참고)

**이력서·공고·지원 건**까지 묶는 RDB **참조 구조** 예시입니다(실제 RDB·마이그레이션은 프로젝트에 맞게 별도 적용). 연락처 단일 테이블 ORM은 [1.1](#11-sqlalchemy-candidates-ormpydantic)과 같습니다.

### 5.1 개념: 지원자 · 공고(직무) · 이력서(지원 건) · 파싱 스냅샷

```mermaid
erDiagram
    candidate {
        int candidate_id PK
        varchar name
        date birth_date
        varchar phone
        varchar email
        varchar address
    }

    position {
        int position_id PK
        varchar title
        varchar code
    }

    resume {
        int resume_id PK
        int candidate_id FK
        int position_id FK
        int second_position_id FK
        varchar desired_location
        int desired_salary
        varchar veteran_eligibility
        varchar disability
        varchar file_path
        timestamptz created_at
    }

    resume_parse {
        int resume_id PK FK
        varchar applied_job_text
        varchar final_education
        text career_period
        text career_company
        text career_role
        varchar file_format
    }

    candidate ||--o{ resume : applies
    position ||--o{ resume : "1st choice"
    position ||--o{ resume : "2nd choice"
    resume ||--o| resume_parse : "Parser snapshot"
```

- **`resume`의 비즈니스 메타** (희망지, 보훈, 장애, 연봉, 2지망 등)는 앱/양식에 맞게 정의.
- **API `record`와의 매핑(예):**

| API `record` | 저장 위치(예) |
|--------------|---------------|
| `이름`~`주소` | `candidate` |
| `원문 지원직무` | `resume_parse.applied_job_text` |
| `최종학력` | `resume_parse.final_education` |
| `경력기간` / `경력회사` / `경력직무` | `resume_parse` 텍스트 컬럼(또는 정규화한 `career_line` 자식 테이블) |
| `파일형식` | `resume_parse.file_format` |
| 업로드 원본 | API 레이어에서 임시 파일에 저장·삭제(현 `resume_parse_repository`)하며, DB 도입 시 서버 `resume.file_path` 등으로 영속화 |

- **대안:** `record` 전체를 **`JSONB` 한 컬럼**(`resume_parse_json`)에 그대로 저장하면 파서 변경에 유연합니다.

### 5.2 M:N이 필요하면

한 지원자가 동일 직무에 여러 번 지원하거나, 한 공고에 여러 이력서를 넣는 모델이면 `application` 중간 엔터티로 확장할 수 있습니다.

---

## 6. 참고 구조(코드)

| 경로 | 역할 |
|------|------|
| `backend/main.py` | `app.main`의 `app` re-export(기존 `uvicorn main:app` / `fastapi dev` 호환) |
| `backend/app/main.py` | `create_app()`: CORS, `/api` 라우터 등록 |
| `backend/app/routers/resume_parse_router.py` | `POST /api/parse` |
| `backend/app/dependencies.py` | `ResumeParseService` DI (`get_resume_parse_service` 등) |
| `backend/app/services/resume_parse_service.py` | 이력서 업로드 루프, `ResumeParseResponse` 조립 |
| `backend/app/repositories/resume_parse_repository.py` | 임시 업로드, `parse_resume_file` / 엑셀 Base64, 임시 파일 삭제 |
| `backend/app/schemas/resume_parse_schemas.py` | `ResumeParseItem`, `ResumeParseFileError`, `ResumeParseResponse` (JSON alias: `excelBase64`, `excelFileName`) |
| `backend/app/config.py` | `DATABASE_URL` (선택) |
| `backend/app/db/base.py` | SQLAlchemy `Base`, `get_engine`, `get_db` |
| `backend/app/models/candidate_orm.py` | ORM `Candidate` → `candidates` |
| `backend/app/schemas/candidate_schemas.py` | Pydantic `CandidateBase` / `CandidateCreate` / `CandidateRead` |
| `backend/ParsingToExcel.py` | 정규식/표 파싱, `parse_resume_file`, `_EXCEL_COLUMNS`, `export_data_list_to_excel_path` |

---

*문서 버전: 0.7 (파일명: `resume_parse_*` / `candidate_orm` / `candidate_schemas` 구분)*