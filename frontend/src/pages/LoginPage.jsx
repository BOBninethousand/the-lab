import { useState, useEffect, useRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('team@irislab.com')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [exiting, setExiting] = useState(false)
  const passwordRef = useRef(null)

  useEffect(() => {
    passwordRef.current?.focus()
  }, [])

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 4000)
      return () => clearTimeout(t)
    }
  }, [error])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Invalid credentials')
      setExiting(true)
      setTimeout(() => onLogin(data.token), 300)
    } catch (err) {
      setError(err.message)
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background orb */}
      <div className="absolute w-[500px] h-[500px] rounded-full bg-[#818cf8]/[0.06] blur-[120px] animate-orb pointer-events-none" />

      <form
        onSubmit={handleSubmit}
        className={`w-full max-w-[400px] bg-[#161618] border border-white/[0.08] rounded-xl p-10 relative z-10 ${
          exiting ? 'animate-login-exit' : 'animate-login-enter'
        }`}
        style={{ boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)' }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-3 h-3 rounded-full bg-[#818cf8] animate-glow-pulse mb-4" />
          <h1 className="text-xl font-semibold text-[#f9fafb] tracking-tight">The Lab</h1>
          <p className="text-xs text-[#808791] mt-1">AI Operations Centre</p>
        </div>

        {/* Email */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-[#9ca3af] mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-[#1e1e21] border border-white/[0.08] rounded-md px-3 py-2.5 text-sm text-[#f9fafb] placeholder-[#5e6470] outline-none focus:border-[#818cf8] focus:ring-1 focus:ring-[#818cf8]/30 transition-all duration-150"
          />
        </div>

        {/* Password */}
        <div className="mb-6">
          <label className="block text-xs font-medium text-[#9ca3af] mb-1.5">Password</label>
          <div className="relative">
            <input
              ref={passwordRef}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter password"
              className="w-full bg-[#1e1e21] border border-white/[0.08] rounded-md px-3 py-2.5 pr-10 text-sm text-[#f9fafb] placeholder-[#5e6470] outline-none focus:border-[#818cf8] focus:ring-1 focus:ring-[#818cf8]/30 transition-all duration-150"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#808791] hover:text-[#f9fafb] transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-[#818cf8] hover:bg-[#818cf8]/90 active:scale-[0.98] text-white font-medium text-sm py-2.5 rounded-md transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center h-10"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            'Sign In'
          )}
        </button>

        {/* Error */}
        {error && (
          <p className="mt-3 text-center text-[13px] text-red-400 animate-shake">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
