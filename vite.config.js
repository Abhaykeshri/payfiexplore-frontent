import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

export default defineConfig({
  plugins: [react()],

  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },

  preview: {
    port: 8080,
    host: '0.0.0.0',
    allowedHosts: [
      "synkroo-ur2xc.ondigitalocean.app",
      "synkroo.com",
      "www.sinkroo.com"      
    ]
  }
})