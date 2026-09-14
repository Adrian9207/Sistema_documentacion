import React, { useState } from 'react';
import './App.css';

function App() {
  const [archivo, setArchivo] = useState(null);
  const [mensaje, setMensaje] = useState('');

  const handleFileChange = (e) => {
    setArchivo(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!archivo) {
      setMensaje('Por favor, selecciona un archivo.');
      return;
    }

    // FormData es obligatorio para enviar archivos HTTP POST
    const formData = new FormData();
    formData.append('documento', archivo);

    try {
      const respuesta = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await respuesta.json();
      if (respuesta.ok) {
        setMensaje(`¡Exito! ${data.mensaje}`);
      } else {
        setMensaje(`Error: ${data.mensaje}`);
      }
    } catch (error) {
      setMensaje('Error de conexion con el servidor.');
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'Arial' }}>
      <h2>Subida de Documentos</h2>
      <form onSubmit={handleSubmit}>
        <input type="file" onChange={handleFileChange} />
        <button type="submit" style={{ marginLeft: '10px' }}>Subir Archivo</button>
      </form>
      {mensaje && <p style={{marginTop: '20px', fontWeight: 'bold' }}>{mensaje}</p>}
    </div>
  );
}

export default App;
