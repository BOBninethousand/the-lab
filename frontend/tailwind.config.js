/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'lab': {
          'bg': '#0C0C0D',
          'surface': '#141415',
          'elevated': '#1C1C1E',
          'border': 'rgba(255, 255, 255, 0.05)',
          'border-hover': 'rgba(255, 255, 255, 0.1)',
          'text-primary': '#f9fafb',
          'text-secondary': '#9ca3af',
          'text-muted': '#6b7280',
          'text-faint': '#4b5563',
          'accent': '#6366f1',
          'success': '#22c55e',
          'warning': '#f59e0b',
          'error': '#ef4444',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        'gutter': '32px',
      },
      borderRadius: {
        'xs': '4px',
        'sm': '6px',
        'md': '8px',
      }
    },
  },
  plugins: [],
}
