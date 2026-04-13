import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HrProtected } from './components/HrProtected'
import { Layout } from './components/Layout'
import { HrAuthProvider } from './context/HrAuthContext'
import { ThemeProvider } from './context/ThemeProvider'
import { ApassFitPage } from './pages/ApassFitPage'
import { ApassHomePage } from './pages/ApassHomePage'
import { ApassInstitutionDashboardPage } from './pages/ApassInstitutionDashboardPage'
import { ApassInterviewPage } from './pages/ApassInterviewPage'
import { ApassRecordPage } from './pages/ApassRecordPage'
import { ApassStudentDashboardPage } from './pages/ApassStudentDashboardPage'
import { HistoryDetailPage } from './pages/HistoryDetailPage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { HrAdminPage } from './pages/HrAdminPage'
import { HrApplicationsPage } from './pages/HrApplicationsPage'
import { HrCompanyPage } from './pages/HrCompanyPage'
import { HrHubPage } from './pages/HrHubPage'
import { HrInterviewQuestionsPage } from './pages/HrInterviewQuestionsPage'
import { HrJobRolesPage } from './pages/HrJobRolesPage'
import { HrLoginPage } from './pages/HrLoginPage'
import { HrRegisterPage } from './pages/HrRegisterPage'
import { HrRejectionsPage } from './pages/HrRejectionsPage'
import { HrEvaluationsPage } from './pages/HrEvaluationsPage'
import { HrScheduleBookingStatusPage } from './pages/HrScheduleBookingStatusPage'
import { HrSchedulesPage } from './pages/HrSchedulesPage'
import { PublicEvaluationPage } from './pages/PublicEvaluationPage'
import { PublicSchedulePickPage } from './pages/PublicSchedulePickPage'

export default function App() {
  return (
    <ThemeProvider>
      <HrAuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="history/:id" element={<HistoryDetailPage />} />
              <Route path="apass" element={<ApassHomePage />} />
              <Route path="apass/record" element={<ApassRecordPage />} />
              <Route path="apass/fit" element={<ApassFitPage />} />
              <Route path="apass/interview" element={<ApassInterviewPage />} />
              <Route path="apass/dashboard/student" element={<ApassStudentDashboardPage />} />
              <Route path="apass/dashboard/institution" element={<ApassInstitutionDashboardPage />} />
              <Route path="hr/login" element={<HrLoginPage />} />
              <Route path="hr/register" element={<HrRegisterPage />} />
              <Route path="schedule/pick/:token" element={<PublicSchedulePickPage />} />
              <Route path="evaluate/:token" element={<PublicEvaluationPage />} />
              <Route path="hr" element={<HrProtected />}>
                <Route index element={<HrHubPage />} />
                <Route path="company" element={<HrCompanyPage />} />
                <Route path="job-roles" element={<HrJobRolesPage />} />
                <Route path="applications" element={<HrApplicationsPage />} />
                <Route path="schedules" element={<HrSchedulesPage />} />
                <Route path="schedules/:roundId/status" element={<HrScheduleBookingStatusPage />} />
                <Route path="schedules/:roundId/evaluations" element={<HrEvaluationsPage />} />
                <Route path="interviews" element={<HrInterviewQuestionsPage />} />
                <Route path="rejections" element={<HrRejectionsPage />} />
                <Route path="admin" element={<HrAdminPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </HrAuthProvider>
    </ThemeProvider>
  )
}
