// para ejecutar es npm run dev
import React, { useState, useEffect } from 'react';
import './App.css';
import Register from './Register';
import Login from './Login';
import Dashboard from './Dashboard';

function App() {
  const [usuario, setUsuario] = useState(null);
  const [vista, setVista] = useState('login'); // 'login' o 'register'

  // Mantener la sesion al recargar la pagina
  useEffect(() => {
    const usuarioGuardado = localStorage.getItem('usuario');
    if (usuarioGuardado) {
      setUsuario(JSON.parse(usuarioGuardado));
    }

  }, []);

  // Funcion de logout
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setUsuario(null);
    setVista('login');
  };


  if (!usuario) {
    return (
      <div>
        {vista === 'login' ? (
          <Login
          alIniciarSesion={(usr) => setUsuario(usr)}
          alCambiarARegistro={() => setVista('register')}
          />
        ) : (
          <Register
          alCambiarALogin={() => setVista('login')}
          />
        )}
      </div>
    );
  }

  return <Dashboard usuario={usuario} alCerrarSesion={handleLogout} />;
}

export default App;
