import { useState } from 'react'
import { FlaskConical, Loader2 } from 'lucide-react'

export function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const result = await onLogin(email, password)
    if (!result.ok) {
      setError(result.error)
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-[#161618] border border-white/[0.08] rounded-lg p-8 animate-fadeIn"
        style={{ boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4)' }}
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <FlaskConical size={24} className="text-[#808791] mb-2" />
          <h1 className="text-xl font-semibold text-[#f9fafb] tracking-tight">The Lab</h1>
          <p className="text-sm text-[#9ca3af] mt-1">Sign in to continue</p>
        </div>

        {/* Email */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-[#9ca3af] mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
            placeholder="Email address"
            className="w-full bg-[#1e1e21] border border-white/[0.08] rounded-md px-3 py-2.5 text-sm text-[#f9fafb] placeholder-[#5e6470] outline-none focus:border-[#818cf8] focus:ring-1 focus:ring-[#818cf8]/30 transition-all duration-150"
          />
        </div>

        {/* Password */}
        <div className="mb-6">
          <label className="block text-xs font-medium text-[#9ca3af] mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Enter password"
            className="w-full bg-[#1e1e21] border border-white/[0.08] rounded-md px-3 py-2.5 text-sm text-[#f9fafb] placeholder-[#5e6470] outline-none focus:border-[#818cf8] focus:ring-1 focus:ring-[#818cf8]/30 transition-all duration-150"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-[#818cf8] hover:bg-[#818cf8]/90 active:scale-[0.98] text-white font-medium text-sm py-2.5 rounded-md transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </button>

        {/* Error */}
        {error && (
          <p className="mt-3 text-center text-[13px] text-[#ef4444] animate-slideIn">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
