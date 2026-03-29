/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'lab': {
          'bg': '#0a0a0b',
          'surface': '#161618',
          'elevated': '#1e1e21',
          'border': 'rgba(255, 255, 255, 0.08)',
          'border-hover': 'rgba(255, 255, 255, 0.14)',
          'text-primary': '#f9fafb',
          'text-secondary': '#9ca3af',
          'text-muted': '#808791',
          'text-faint': '#5e6470',
          'accent': '#818cf8',
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
