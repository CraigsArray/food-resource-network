import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// App-admin-only gate
export default function AppAdminRoute({ children }) {
  const { session, isAppAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      </div>
    )
  }

  if (!session)    return <Navigate to="/login" replace />
  if (!isAppAdmin) return <Navigate to="/admin" replace />

  return children
}
