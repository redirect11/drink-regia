// @vitest-environment happy-dom
// «AREA CLIENTI» DALL'APP È UN COLLEGAMENTO (REQ-FLOTTA-104). Da tana-drink,
// 14/11/2026: dalla 1.10.49 il tasto apre in una scheda nuova
// `<regia>/dashboard`, senza token (Daniele: «non può portarlo
// semplicemente all'app dove lui poi deve fare il login, ma se lo ha già
// fatto si ritrova già nella sua area?»). Quello che la regia tiene fermo:
// /dashboard è la pagina d'ingresso dell'area, e chi non è entrato passa
// dall'accesso e poi torna lì. Qui il ritorno dopo l'accesso con la password;
// quello con Google è in AccessoGoogle.test.jsx, il rinvio all'accesso in
// App.test.jsx. Dati inventati: nessuna persona reale.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({
  accedi: vi.fn(async () => {}),
  recuperaPassword: vi.fn(async () => {}),
  entraConGoogle: vi.fn(async () => {}),
}))
vi.mock('../src/lib/db.js', () => db)

import Accedi from '../src/pages/Accedi.jsx'

describe('«Area clienti» dall’app: l’accesso riporta a /dashboard', () => {
  it('entrato con email e password, chi arriva dall’app si ritrova nella sua area', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/accedi']}>
        <Routes>
          <Route path="/accedi" element={<Accedi />} />
          <Route path="/dashboard" element={<p>l’area del cliente</p>} />
        </Routes>
      </MemoryRouter>
    )
    await user.type(screen.getByLabelText('Email'), 'titolare@example.it')
    await user.type(screen.getByLabelText('Password'), 'una-password')
    await user.click(screen.getByRole('button', { name: 'Entra' }))
    expect(db.accedi).toHaveBeenCalledWith({ email: 'titolare@example.it', password: 'una-password' })
    expect(await screen.findByText('l’area del cliente')).toBeInTheDocument()
  })
})
