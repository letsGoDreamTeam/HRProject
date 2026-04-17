import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HrProtected } from './components/HrProtected'
import { HrShellLayout } from './components/HrShellLayout'
import { Layout } from './components/Layout'
import { AdminLayout } from './components/AdminLayout'
import { HrAuthProvider } from './context/HrAuthContext'
import { HrAdminPage } from './pages/HrAdminPage'
import { HrApplicationsPage } from './pages/HrApplicationsPage'
import { HrCompanyPage } from './pages/HrCompanyPage'
import { HrHubPage } from './pages/HrHubPage'
import { HrInterviewQuestionsPage } from './pages/HrInterviewQuestionsPage'
import { HrJobRolesPage } from './pages/HrJobRolesPage'
import { HrLoginPage } from './pages/HrLoginPage'
import { HrRegisterPage } from './pages/HrRegisterPage'
import { HrRecruitmentSummaryPage } from './pages/HrRecruitmentSummaryPage'
import { HrRejectionsPage } from './pages/HrRejectionsPage'
import { HrEvaluationsPage } from './pages/HrEvaluationsPage'
import { HrSystemDashboardPage } from './pages/HrSystemDashboardPage'
import { HrScheduleBookingStatusPage } from './pages/HrScheduleBookingStatusPage'
import { HrSchedulesPage } from './pages/HrSchedulesPage'
import { HrScheduleCalendarPage } from './pages/HrScheduleCalendarPage'
import { HrScheduleIntegratedPage } from './pages/HrScheduleIntegratedPage'
import { HrPipelinePage } from './pages/HrPipelinePage'
import { HrPipelineOverviewPage } from './pages/HrPipelineOverviewPage'
import { HrBatchResumeInsightsPage } from './pages/HrBatchResumeInsightsPage'
import { HrRecruitmentProcessPage } from './pages/HrRecruitmentProcessPage'
import { HrVideoInterviewTestPage } from './pages/HrVideoInterviewTestPage'
import { CandidateConfirmPage } from './pages/CandidateConfirmPage'
import { CareersLandingPage, CareersTokenRedirect } from './pages/CareersPortalPages'
import { PublicEvaluationPage } from './pages/PublicEvaluationPage'
import { PublicSchedulePickPage } from './pages/PublicSchedulePickPage'

export default function App() {
  return (
    <HrAuthProvider>
      <BrowserRouter>
        <Routes>
            {/* 지원자 일정 확인 페이지 (토큰 기반, 인증 불필요) */}
            <Route path="confirm/:token" element={<CandidateConfirmPage />} />

            {/* 지원자: /careers 는 안내, /careers/:token 은 일정 선택(공식 경로로 리다이렉트) */}
            <Route path="careers/:token" element={<CareersTokenRedirect />} />
            <Route path="careers" element={<CareersLandingPage />} />

            {/* 어드민 패널 (다크 사이드바 레이아웃) */}
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/accounts" replace />} />
              <Route path="accounts" element={<HrAdminPage />} />
              <Route path="dashboard" element={<HrSystemDashboardPage />} />
            </Route>

            {/* HR 포털 (기존 레이아웃) */}
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/hr" replace />} />
              <Route path="hr/login" element={<HrLoginPage />} />
              <Route path="hr/register" element={<HrRegisterPage />} />
              <Route path="schedule/pick/:token" element={<PublicSchedulePickPage />} />
              <Route path="evaluate/:token" element={<PublicEvaluationPage />} />
              <Route path="hr" element={<HrProtected />}>
                <Route element={<HrShellLayout />}>
                  <Route index element={<HrHubPage />} />
                  <Route path="company" element={<HrCompanyPage />} />
                  <Route path="job-roles" element={<HrJobRolesPage />} />
                  <Route path="applications" element={<HrApplicationsPage />} />
                  <Route path="pipeline" element={<HrPipelineOverviewPage />} />
                  <Route path="pipeline/:batchId" element={<HrPipelinePage />} />
                  <Route path="pipeline/:batchId/insights" element={<HrBatchResumeInsightsPage />} />
                  <Route path="recruitment-process" element={<HrRecruitmentProcessPage />} />
                  <Route path="recruitment-summary" element={<HrRecruitmentSummaryPage />} />
                  <Route path="schedules" element={<HrSchedulesPage />} />
                  <Route path="schedules/:roundId/status" element={<HrScheduleBookingStatusPage />} />
                  <Route path="schedules/:roundId/evaluations" element={<HrEvaluationsPage />} />
                  <Route path="calendar" element={<HrScheduleCalendarPage />} />
                  <Route path="schedule-integrated" element={<HrScheduleIntegratedPage />} />
                  <Route path="video-interview-test" element={<HrVideoInterviewTestPage />} />
                  <Route path="interviews" element={<HrInterviewQuestionsPage />} />
                  <Route path="rejections" element={<HrRejectionsPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/hr" replace />} />
            </Route>
        </Routes>
      </BrowserRouter>
    </HrAuthProvider>
  )
}
