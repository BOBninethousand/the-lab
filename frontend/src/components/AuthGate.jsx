import { useAuth } from '../hooks/useAuth'
import { LoginPage } from '../pages/LoginPage'
import { FlaskConical } from 'lucide-react'

export function AuthGate({ children }) {
  const { isAuthenticated, isLoading, login, logout } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center">
        <FlaskConical size={24} className="text-[#808791] animate-pulse" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={login} />
  }

  return children
}
