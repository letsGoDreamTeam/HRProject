import AgentClient from "@/components/interviewer/agent/AgentClient";
import { QuestionGenerationJobProvider } from "@/components/hr/question-generation/QuestionGenerationJobProvider";
import {
  fetchCandidates,
  fetchMyInterviewerPositionId,
  fetchPositions,
} from "../server/interviewer/interviewer.server";

export default async function InterviewerPage() {
  const [positionsData, candidatesData, myPositionId] = await Promise.all([
    fetchPositions(),
    fetchCandidates(),
    fetchMyInterviewerPositionId(),
  ]);

  const filteredCandidatesData =
    myPositionId == null
      ? candidatesData
      : candidatesData.filter(
          (candidate) => candidate.position_id === myPositionId,
        );

  const filteredPositionsData =
    myPositionId == null
      ? positionsData
      : positionsData.filter(
          (position) => position.positionId === myPositionId,
        );

  return (
    <div className="animate-in fade-in duration-500 h-full flex flex-col">
      <div className="mb-6 shrink-0">
        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
          <i className="bx bx-bot text-indigo-600 text-3xl"></i> AI 면접 질문
          에이전트
        </h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          부서와 지원자를 선택하면 맞춤형 심층 질문을 자동으로 생성합니다.
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <QuestionGenerationJobProvider>
          <AgentClient
            initialPositions={filteredPositionsData}
            initialCandidates={filteredCandidatesData}
          />
        </QuestionGenerationJobProvider>
      </div>
    </div>
  );
}
