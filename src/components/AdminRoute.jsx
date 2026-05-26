import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Allows org members + app admins; everyone else → /organization-request
export default function AdminRoute({ children }) {
  const { session, memberships, isAppAdmin, loading } = useAuth()

  // Only show spinner on initial load when session is unknown.
  // If a session already exists (e.g. token refresh), keep children mounted
  // so that in-progress form data isn't wiped.
  if (loading && !session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  // Session exists but memberships are still refreshing — stay mounted
  if (loading) return children

  if (!isAppAdmin && memberships.length === 0) return <Navigate to="/organization-request" replace />

  return children
}
