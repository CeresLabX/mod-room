import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import RoomLanding from './components/RoomLanding.jsx';
import RoomView from './components/RoomView.jsx';
// Legacy /room/code/:roomCode route: normalize to canonical readable /room/:roomCode
function ResolveRoomCode() {
  const { roomCode } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!roomCode) { navigate('/'); return; }
    navigate(`/room/${roomCode.toUpperCase()}`, { replace: true });
  }, [roomCode]);

  return <div style={{ padding: 32, textAlign: 'center', color: 'var(--dim)' }}>Joining room...</div>;
}

export default function App() {
  const [theme, setTheme] = useState('dos');

  useEffect(() => {
    const saved = localStorage.getItem('modroom-theme');
    if (saved) setTheme(saved);
  }, []);

  const applyTheme = (t) => {
    setTheme(t);
    localStorage.setItem('modroom-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoomLanding theme={theme} applyTheme={applyTheme} />} />
        <Route path="/room/code/:roomCode" element={<ResolveRoomCode />} />
        <Route path="/room/:roomId" element={<RoomView theme={theme} applyTheme={applyTheme} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
