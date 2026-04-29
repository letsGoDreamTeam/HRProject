# 면접 질문 생성 파이프라인 상세 분석 문서

이 문서는 `backend`의 면접 질문 생성 로직이 **RAG + LangChain + LangGraph**를 어떻게 결합해 동작하는지, 실제 코드 기준으로 매우 상세하게 설명한다.

---

## 1) 한눈에 보는 아키텍처

현재 파이프라인의 핵심 구조는 다음과 같다.

1. 이력서 파일을 파싱하여 구조화 데이터 확보
2. 구조화 데이터를 LLM 입력용 텍스트(`resume_text`)로 직렬화
3. JD(직무기술서)를 벡터화(FAISS)하고 이력서 기반 질의로 관련 컨텍스트 검색(RAG)
4. 검색 컨텍스트 + 이력서 텍스트를 프롬프트에 넣어 질문 JSON 생성(LangChain)
5. 생성된 질문의 점수 평균을 기준으로 재생성 여부 판단(LangGraph 분기)
6. 결과를 응답 및 DB 저장

코드 진입점:
- API 라우터: `backend/app/routers/interview_questions_router.py`
- 생성 서비스: `backend/app/services/interview_questions_service.py`
- 이력서 프롬프트 직렬화: `backend/app/services/parsed_resume_for_llm.py`
- 질문 저장/세션/반응: `backend/app/repositories/interview_questions_repository.py`

---

## 2) 구성 요소별 책임

### 2.1 FastAPI Router 계층

파일:
- `backend/app/routers/interview_questions_router.py`

주요 엔드포인트:

1. `POST /api/interview-questions`
- 이력서 파일(`resume`) + JD 입력(`job_description_text` 또는 파일/TSV) 기반 생성
- `liked_questions`, `disliked_questions`, `session_id`를 받아 재생성 시 취향/제외 반영

2. `POST /api/interview-questions/from-db`
- DB에 저장된 `resume_id`를 기반으로 이력서 복원 후 생성

3. `POST /api/interview-questions/more`
- 기존 질문 이후 추가 질문 생성(레거시 호환 경로)

Router의 역할은 **입력 정규화/검증** + **서비스 호출** + **응답 조립**이며, 실제 RAG/LLM 조합은 서비스 계층에서 수행한다.

---

### 2.2 이력서 파싱/직렬화 계층

파일:
- 파싱 호출: `ParsingToExcel.py`의 `parse_resume_file(...)` (라우터에서 호출)
- 직렬화: `backend/app/services/parsed_resume_for_llm.py`

핵심 동작:

1. 파싱 결과(dict)를 생성
- 학력/경력/자격/병역/자기소개 블록까지 포함한 구조화 결과

2. `build_resume_prompt_text(parsed)`로 LLM 입력 텍스트 생성
- 섹션형 마크다운 텍스트로 직렬화
- 기본적으로 `AI_ANONYMIZE=true`일 때 이메일/전화/주민번호를 마스킹

즉, LLM은 raw 파일을 직접 보지 않고 **파싱된 구조화 텍스트**를 본다.

---

### 2.3 생성 서비스 계층 (RAG + LangChain + LangGraph)

파일:
- `backend/app/services/interview_questions_service.py`

이 파일이 사실상 파이프라인의 중심이다.

---

## 3) RAG 분석 (Retrieval-Augmented Generation)

### 3.1 왜 JD를 RAG로 검색하나

JD 전체를 그대로 프롬프트에 넣으면 토큰 낭비와 잡음이 커진다.  
그래서 JD를 청크로 나누고, 이력서와 연관도가 높은 청크만 추려 LLM 입력으로 사용한다.

---

### 3.2 현재 구현 상세

핵심 함수:
- `_retrieve_jd_context(job_description, resume_text, top_k=5)`
- `_build_resume_queries(resume_text, ...)`
- `node_rag_retrieve(state)`

#### (A) JD 청크 분할

```python
splitter = RecursiveCharacterTextSplitter(chunk_size=600, chunk_overlap=80)
jd_chunks = splitter.split_text(job_description.strip())
```

- `chunk_size=600`, `chunk_overlap=80`
- 너무 작은 청크로 쪼개는 것을 피하면서도 의미 단위를 유지하려는 균형값

#### (B) 임베딩 + 벡터스토어

```python
embeddings = OpenAIEmbeddings(api_key=_api_key())
vectorstore = FAISS.from_texts(jd_chunks, embeddings)
```

- OpenAI 임베딩으로 텍스트 벡터화
- 로컬 메모리 기반 FAISS 인덱스 사용

#### (C) 질의 생성 전략 (중요 변경점)

기존에는 `resume_text[:1500]` 고정 길이만 질의로 사용했으나, 현재는 다음으로 개선됨:

1. 전체 이력서 질의(기본 최대 12,000자)
2. 섹션별 질의(기본 4개까지)
- `##` 헤더 기준으로 섹션 분리
- 헤더에 `경력/프로젝트/자기소개/경험/직무/역할/성과` 키워드가 있는 섹션 우선
- 각 섹션 질의는 최대 2,200자

즉, **전역 맥락 + 핵심 실무 섹션 맥락**을 동시에 질의한다.

#### (D) 다중 검색 + 중복 제거

각 질의마다 `similarity_search(q, k)`를 수행하고, 페이지 콘텐츠를 dedup하여 병합:

```python
for q in queries:
    docs = vectorstore.similarity_search(q, k=k)
    ...
```

결과적으로 `retrieved_context`는 단일 쿼리 top-k가 아니라, **멀티 쿼리 합성 컨텍스트**가 된다.

---

## 4) LangChain 분석 (Prompt + Model + Parser)

### 4.1 체인 구성

`node_generate_questions(...)`에서 아래 체인을 구성:

```python
prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("human",  USER_TEMPLATE),
])
chain = prompt | _llm(model_name, temperature) | JsonOutputParser()
```

구성 요소:
- `ChatPromptTemplate`: 시스템/유저 프롬프트 템플릿
- `ChatOpenAI`: OpenAI chat completion 모델 호출
- `JsonOutputParser`: JSON 파싱

---

### 4.2 모델 호출 설정

`_llm(...)`:
- `model`: 기본 `OPENAI_MODEL` (없으면 `gpt-4o-mini`)
- `temperature`: 기본 0.65, 재생성 시 증가
- `response_format={"type":"json_object"}`로 JSON 형식 강제 유도

---

### 4.3 프롬프트 규칙 상세

`SYSTEM_PROMPT` 핵심:
- 문서에 없는 정보 가정 금지
- JD 키워드 × 이력서 경험 연결 우선
- 질문별 `type`, `difficulty`, `evaluation_point` 포함
- 점수 기준(직무 연관성/근거 구체성/변별력)

`USER_TEMPLATE` 핵심:
- 출력은 JSON 하나만
- 고정 스키마:
  - `applicant_summary`
  - `job_basic`(2)
  - `job_intermediate`(3)
  - `job_advanced`(2)
  - `personality`(3)
- 총 10개 목표
- 피드백 입력:
  - 좋아요 스타일(`liked_questions`)
  - 싫어요 스타일(`disliked_questions`)
  - 재생성 힌트(`refine_hint`)

---

## 5) LangGraph 분석 (상태 머신 + 분기)

### 5.1 상태 정의

`InterviewState` 필드:
- `resume_text`
- `job_description`
- `retrieved_context`
- `questions_bundle`
- `liked_questions`
- `disliked_questions`
- `model_name`
- `iteration`

### 5.2 노드 구성

그래프 정의:

1. `rag_retrieve`
- JD 벡터 검색 후 `retrieved_context` 생성

2. `generate`
- 프롬프트 + LLM 체인으로 질문 번들 생성
- `iteration` 증가

3. 조건 분기 `should_refine`
- 질문 아이템들의 `score` 평균이 55 미만이고
- `iteration < 2`인 경우 재생성으로 루프

그래프 구조:

```text
rag_retrieve -> generate -> (refine ? generate : END)
```

즉 최대 2회 생성 시도를 허용한다(초기 + 1회 재시도).

---

## 6) “분석”이 실제로 어떻게 이뤄지는가

면접 질문 분석/생성 관점에서 보면, 이 시스템은 다음의 3중 분석을 수행한다.

1. 문서 구조 분석 (Resume Serialization)
- 파싱된 이력서를 필드/행 단위로 정규화해 LLM이 읽기 쉬운 구조로 제공

2. 의미 연관 분석 (RAG Retrieval)
- JD를 청크 벡터 공간으로 만들고
- 이력서 전체 + 핵심 섹션 질의로 연관 청크를 다중 수집

3. 질문 품질 분석 (Self-scored Refinement)
- 모델이 각 질문 `score`를 부여
- 평균 점수가 낮으면 재생성 분기로 재시도

주의:
- 3번은 “독립 평가기”가 아니라 모델 self-score 기반이라 절대적 품질 보장은 아니다.

---

## 7) DB 저장/후속 인터랙션 분석

파일:
- `backend/app/repositories/interview_questions_repository.py`

동작:

1. 생성 번들을 질문 테이블에 저장
- `job_basic`, `job_intermediate`, `job_advanced`, `personality` 키를 순회 저장
- 각 질문 dict에 `_db_id` 주입

2. 세션 생성
- `interview_sessions`에 행 생성 후 `session_id` 부여

3. 좋아요/싫어요 반영
- `/react` 호출로 `question_reactions` UPSERT
- 다음 생성 요청 시 `session_id` 기반으로 기존 dislike를 자동 병합

결과적으로 “생성 → 반응 → 재생성”의 폐루프를 구성한다.

---

## 8) 요청별 실행 시퀀스

### 8.1 `POST /api/interview-questions`

1. 이력서 업로드 수신
2. `parse_resume_file(...)`
3. JD 텍스트 확보
4. (선택) `session_id` dislike 로딩
5. `generate_bundle_from_parsed_resume(...)`
6. 그래프 실행(`rag_retrieve -> generate -> refine?`)
7. 질문 DB 저장 + 세션 생성
8. 응답 반환 (`bundle`, `markdown`, `sessionId`, excerpt)

### 8.2 `POST /api/interview-questions/more`

1. 이력서 재파싱
2. 제외 질문 목록 수신
3. 동일 RAG 전략으로 JD 컨텍스트 구성
4. `MORE_TEMPLATE`로 3개 추가 질문 생성

---

## 9) 강점과 한계

### 강점

1. 단순 프롬프트 생성이 아닌 RAG 기반 컨텍스트 압축
2. 피드백(좋아요/싫어요)을 재생성에 반영
3. LangGraph로 생성 루프를 명시적으로 관리
4. 파싱 구조 + 개인정보 마스킹으로 안정적 입력 형식 제공

### 한계

1. 출력 스키마 강제 검증이 약함
- JSON 파싱 후 필드 completeness/개수 검증이 없음

2. 품질평가가 self-score 기반
- 별도 evaluator 모델/룰 기반 검증 없음

3. Retrieval ranking 고도화 여지
- 현재는 `similarity_search` 중심, MMR/reranker 미적용

---

## 10) 운영 관점 권장 개선안

1. 출력 검증 레이어 추가
- Pydantic 스키마로 필수 필드/type/개수 강제
- 실패 시 자동 재시도 프롬프트 보정

2. Retrieval 개선
- `similarity_search` + `max_marginal_relevance_search` 혼합
- JD metadata(섹션/우선순위) 기반 가중치

3. 평가 분리
- 독립 평가 노드 추가(LangGraph에 evaluator node)
- 점수 외에 중복률/구체성/직무어 매칭률 규칙 적용

4. 추적성(Observability)
- 질의 세트, 검색 청크, 최종 선택 컨텍스트를 로그/trace로 남겨 디버깅 강화

---

## 11) 현재 기준 핵심 파라미터 요약

`interview_questions_service.py` 기준:

- JD chunk size: `600`
- JD chunk overlap: `80`
- 질의 수:
  - 전체 질의 1개(`max 12,000자`)
  - 섹션 질의 최대 4개(`각 max 2,200자`)
- retrieval top-k: `5`
- 생성 temperature: `0.65 + iteration*0.08`
- refine 조건: `avg(score) < 55 and iteration < 2`

---

## 12) 관련 파일 인덱스

- `backend/app/routers/interview_questions_router.py`
- `backend/app/services/interview_questions_service.py`
- `backend/app/services/parsed_resume_for_llm.py`
- `backend/app/repositories/interview_questions_repository.py`
- `backend/app/services/job_description_text.py`
- `backend/pyproject.toml` (LangChain/LangGraph/RAG 의존성)

