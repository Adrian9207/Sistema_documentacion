// para ejecutar es npm run dev
import React, { useState, useEffect } from 'react';
import './App.css';
import Register from './Register';
import Login from './Login';

function App() {
  const [archivo, setArchivo] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [vista, setVista] = useState('login'); // 'login' o 'register'

  // Estado del panel de administrador
  const [nuevoDni ,setNuevoDni] = useState('');
  const [mensajeAdmin, setMensajeAdmin] = useState('');

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

  const handleFileChange = (e) => {
    setArchivo(e.target.files[0]);
  };
  // enviar archivo adjuntando el token JWT de autorizacion
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!archivo) {
      setMensaje('Por favor, selecciona un archivo.');
      return;
    }

    const token = localStorage.getItem('token');
    // FormData es obligatorio para enviar archivos HTTP POST
    const formData = new FormData();
    formData.append('documento', archivo);

    try {
      const response = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        headers: {'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();
      if (response.ok) {
        setMensaje(`¡Exito! ${data.mensaje}`);
      } else {
        setMensaje(`Error: ${data.mensaje || data.error}`);
      }
    } catch (error) {
      setMensaje('Error de conexion al subir el archivo.');
    }
  };

  // solo administradores: autorizan el DNI de un trajador
  const handleAgregarDni = async (e) => {
    e.preventDefault();
    setMensajeAdmin('');
    const token = localStorage.getItem('token')
    try {
      const response = await fetch('http://localhost:5000/api/admin/dnis', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`
      },
        body: JSON.stringify({ dni: nuevoDni})
      });
      const data = await response.json();
      if (response.ok) {
        setMensajeAdmin('DNI autorizado correctamente.')
        setNuevoDni('');
      } else {
        setMensajeAdmin(data.error);
      }
    } catch {
      setMensajeAdmin('Error de conexion al agregar el DNI.');
    }
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

  return (
    <div className="main-layout">
      <header style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <h3>Bienvenido, {usuario.nombre || usuario.email} ({usuario.tipo})</h3>
        <button onClick={handleLogout}>Cerrar Sesión</button>
      </header>

      <main style={{ marginTop: '20px' }}>
        <h2>Panel de Recepcion de documentos</h2>
        <form onSubmit={handleSubmit}>
          <input type="file" onChange={handleFileChange} />
          <button type="submit">Subir Documentos</button>
        </form>
        {mensaje && <p>{mensaje}</p>}
      </main>

      {usuario.tipo === 'administrador' && (
        <section style={{ marginTop: '40px', borderTop: '1px solid #ccc', paddingTop: '20px'}}>
          <h3>Panel de Administrador</h3>

          <form onSubmit={handleAgregarDni} style={{marginTop: '15px'}}>
            <input
              type='text'
              placeholder='DNI del trabajador a autorizar'
              value={nuevoDni}
              onChange={(e) => setNuevoDni(e.target.value)} required />
              <button type='submit'>Autorizar DNI</button>
          </form>

          {mensajeAdmin && <p>{mensajeAdmin}</p>}
          </section>
      )}
    </div>
  );
}

export default App;
