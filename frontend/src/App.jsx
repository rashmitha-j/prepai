import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import PublicLayout from './components/layout/PublicLayout';
import { GuestOnlyRoute, ProtectedRoute } from './components/layout/RouteGuards';
import { PageLoading } from './components/ui/Spinner';

const Landing = lazy(() => import('./pages/public/Landing'));
const Login = lazy(() => import('./pages/public/Login'));
const Register = lazy(() => import('./pages/public/Register'));
const About = lazy(() => import('./pages/public/About'));
const NotFound = lazy(() => import('./pages/public/NotFound'));

const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Resumes = lazy(() => import('./pages/app/Resumes'));
const ResumeDetail = lazy(() => import('./pages/app/ResumeDetail'));
const Jobs = lazy(() => import('./pages/app/Jobs'));
const JobNew = lazy(() => import('./pages/app/JobNew'));
const JobDetail = lazy(() => import('./pages/app/JobDetail'));
const InterviewNew = lazy(() => import('./pages/app/InterviewNew'));
const InterviewSession = lazy(() => import('./pages/app/InterviewSession'));
const InterviewResult = lazy(() => import('./pages/app/InterviewResult'));
const Interviews = lazy(() => import('./pages/app/Interviews'));
const Coding = lazy(() => import('./pages/app/Coding'));
const CodingProblem = lazy(() => import('./pages/app/CodingProblem'));
const Knowledge = lazy(() => import('./pages/app/Knowledge'));
const Profile = lazy(() => import('./pages/app/Profile'));

/** Remount a page when its :id changes so per-item state (drafts, results) never leaks between items. */
function KeyedById({ component: Component }) {
  const { id } = useParams();
  return <Component key={id} />;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="about" element={<About />} />
          <Route element={<GuestOnlyRoute />}>
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="resumes" element={<Resumes />} />
            <Route path="resumes/:id" element={<ResumeDetail />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="jobs/new" element={<JobNew />} />
            <Route path="jobs/:id" element={<JobDetail />} />
            <Route path="interview" element={<Navigate to="/interview/new" replace />} />
            <Route path="interview/new" element={<InterviewNew />} />
            <Route path="interview/:id" element={<KeyedById component={InterviewSession} />} />
            <Route path="interview/:id/result" element={<InterviewResult />} />
            <Route path="interviews" element={<Interviews />} />
            <Route path="coding" element={<Coding />} />
            <Route path="coding/:id" element={<CodingProblem />} />
            <Route path="knowledge" element={<Knowledge />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Route>

        <Route element={<PublicLayout />}>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
