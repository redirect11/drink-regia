import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// La regia: un'app a sé, sul suo progetto Firebase (drink-regia). Servita
// dalla radice su Firebase Hosting.
export default defineConfig({
  plugins: [react()],
  // La versione di riserva per il piè di pagina (REQ-DEV-002): nel deploy
  // vince VITE_APP_VERSION, che è il tag; qui c'è quella di package.json.
  define: { __APP_VERSION__: JSON.stringify(`v${pkg.version}`) },
})
