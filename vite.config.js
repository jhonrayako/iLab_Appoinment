import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    __SUPABASE_CONFIGURED__: Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY)
  },
  server: {
    port: 5173,
    host: '0.0.0.0'
  }
});
