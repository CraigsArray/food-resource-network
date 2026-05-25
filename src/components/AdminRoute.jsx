import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Allows org members + app admins; everyone else → /organization-request
export default function AdminRoute({ children }) {
  const { session, memberships, isAppAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (!isAppAdmin && memberships.length === 0) return <Navigate to="/organization-request" replace />

  return children
}
