import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import HolidaysPage from './pages/HolidaysPage';
import EmployeesPage from './pages/EmployeesPage';
import AttendancePage from './pages/AttendancePage';
import LeavePage from './pages/LeavePage';
import DepartmentsPage from './pages/DepartmentsPage';
import DesignationsPage from './pages/DesignationsPage';
import OrgChartPage from './pages/OrgChartPage';
import DocumentsPage from './pages/DocumentsPage';
import ReportsPage from './pages/ReportsPage';
import TasksPage from './pages/TasksPage';
import NewTaskPage from './pages/NewTaskPage';
import TaskDetailsPage from './pages/TaskDetailsPage';
import ClientsPage from './pages/ClientsPage';
import ProjectsPage from './pages/ProjectsPage';
import UsersPage from './pages/UsersPage';
import PlaceholderPage from './pages/PlaceholderPage';
import EventDetailPage from './pages/EventDetailPage';
import EmployeeAttendanceDetailPage from './pages/EmployeeAttendanceDetailPage';
import RecruitmentPage from './pages/RecruitmentPage';
import JobOpeningDetailPage from './pages/JobOpeningDetailPage';
import OnboardingPage from './pages/OnboardingPage';
import AppShell from './layouts/AppShell';
import ProtectedRoute, { RoleProtectedRoute } from './components/ProtectedRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="holidays" element={<HolidaysPage />} />
          <Route path="events/:id" element={<EventDetailPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="attendance/:employeeId" element={<EmployeeAttendanceDetailPage />} />
          <Route path="leave" element={<LeavePage />} />
          <Route path="departments" element={<DepartmentsPage />} />
          <Route path="designations" element={<DesignationsPage />} />
          <Route path="org-chart" element={<OrgChartPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route
            path="clients"
            element={<RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'HR', 'MANAGER']}><ClientsPage /></RoleProtectedRoute>}
          />
          <Route
            path="projects"
            element={<RoleProtectedRoute allowedRoles={['SUPER_ADMIN', 'HR', 'MANAGER']}><ProjectsPage /></RoleProtectedRoute>}
          />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tasks/new" element={<NewTaskPage />} />
          <Route path="tasks/:id" element={<TaskDetailsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="recruitment" element={<RecruitmentPage />} />
          <Route path="recruitment/jobs/:id" element={<JobOpeningDetailPage />} />
          <Route path="candidates" element={<RecruitmentPage />} />
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="*" element={<PlaceholderPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}