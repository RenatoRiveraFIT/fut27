import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { MarketPage } from './pages/MarketPage';
import { PlayerPage } from './pages/PlayerPage';
import { PlayersPage } from './pages/PlayersPage';
import { StatusPage } from './pages/StatusPage';

export function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">FUT27</span>
        <nav>
          <NavLink to="/jugadores">Jugadores</NavLink>
          <NavLink to="/mercado">Mercado</NavLink>
          <NavLink to="/estado">Estado</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/jugadores" replace />} />
          <Route path="/jugadores" element={<PlayersPage />} />
          <Route path="/jugador/:id" element={<PlayerPage />} />
          <Route path="/mercado" element={<MarketPage />} />
          <Route path="/estado" element={<StatusPage />} />
          <Route path="*" element={<p className="empty">Esta página no existe. Vuelve a Jugadores desde el menú.</p>} />
        </Routes>
      </main>
    </div>
  );
}
