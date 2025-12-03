import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// CRITICAL FIX: Expose API_KEY from Vercel Environment to the Client
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  }
})