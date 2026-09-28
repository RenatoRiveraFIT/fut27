import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
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
          <Route path="/estado" element={<StatusPage />} />
          <Route path="*" element={<p className="empty">Esta página no existe. Vuelve a Jugadores desde el menú.</p>} />
        </Routes>
      </main>
    </div>
  );
}
