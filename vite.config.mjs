import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import autoprefixer from 'autoprefixer'

// Activa HTTPS local solo cuando se ejecuta `npm run start:movil`.
// getUserMedia() exige un origen seguro, así que la cámara del teléfono
// únicamente funciona por HTTPS (o en localhost).
const httpsHabilitado = process.env.HTTPS === 'true'

export default defineConfig(async () => {
  const complementos = [react()]

  if (httpsHabilitado) {
    const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl')
    complementos.push(basicSsl())
  }

  return {
    base: './',
    build: {
      outDir: 'build',
    },
    css: {
      postcss: {
        plugins: [
          autoprefixer({}), // add options if needed
        ],
      },
    },
    plugins: complementos,
    resolve: {
      alias: [
        {
          find: 'src/',
          replacement: `${path.resolve(__dirname, 'src')}/`,
        },
      ],
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.scss'],
    },
    server: {
      host: httpsHabilitado,
      port: 3000,
      proxy: {
        // https://vitejs.dev/config/server-options.html
      },
    },
  }
})
