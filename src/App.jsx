import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute  from './components/ProtectedRoute'
import AdminRoute      from './components/AdminRoute'
import AppAdminRoute   from './components/AppAdminRoute'
import LoginPage            from './pages/LoginPage'
import AuthCallback         from './pages/AuthCallback'
import OrganizationRequest  from './pages/OrganizationRequest'
import PublicFeed           from './pages/PublicFeed'
import AdminDashboard       from './pages/AdminDashboard'
import PendingProviders     from './pages/PendingProviders'
import Widget               from './pages/Widget'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/"              element={<PublicFeed />} />
          <Route path="/widget"        element={<Widget />} />
          <Route path="/login"         element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Authenticated — any signed-in user */}
          <Route path="/organization-request" element={
            <ProtectedRoute><OrganizationRequest /></ProtectedRoute>
          } />

          {/* Org members + app admins */}
          <Route path="/admin" element={
            <AdminRoute><AdminDashboard /></AdminRoute>
          } />

          {/* App admins only */}
          <Route path="/admin/pending-providers" element={
            <AppAdminRoute><PendingProviders /></AppAdminRoute>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
