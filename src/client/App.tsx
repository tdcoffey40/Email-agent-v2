import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { LoadingBlock } from './components/ui/Feedback';
import { useSession } from './lib/session';
import { AgentEditorPage } from './pages/AgentEditorPage';
import { AgentsPage } from './pages/AgentsPage';
import { ActivityPage } from './pages/ActivityPage';
import { SignInPage } from './pages/SignInPage';

export default function App() {
  const { user, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingBlock label="Starting up" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<SignInPage mode="login" />} />
        <Route path="/register" element={<SignInPage mode="register" />} />
        <Route
          path="*"
          element={<Navigate to="/login" replace state={{ from: location.pathname }} />}
        />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<AgentsPage />} />
        <Route path="/agents/new" element={<AgentEditorPage />} />
        <Route path="/agents/:id" element={<AgentEditorPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
