/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        deploy: {
          dark: '#0a0a0a',
          card: '#111111',
          border: '#333333',
          accent: '#0070f3',
        }
      }
    },
  },
  plugins: [],
}