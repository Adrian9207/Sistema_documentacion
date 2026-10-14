import React, { useState } from 'react';

export default function Login({ alIniciarSesion, alCambiarARegistro }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mensaje, setMensaje] = useState('');

    const manejarLogin = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch('http://localhost:5000/api/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (response.ok) {
                // Guardar token y datos en localStorage
                localStorage.setItem('token', data.token);
                localStorage.setItem('usuario', JSON.stringify(data.usuario));
                alIniciarSesion(data.usuario);
            }else {
                setMensaje(data.error);
            }
        } catch {
            setMensaje('Error al conectar con el servidor.');
        }
    };

    return (
        <div className="auth-container">
            <h2>Iniciar Sesión</h2>
            <form onSubmit={manejarLogin}>
                <input
                    type="email"
                    placeholder="Correo electrónico"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)} required />
                <input
                    type="password"
                    placeholder="Contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)} required />
                <button type="submit">Ingresar</button>
            </form>
            {mensaje && <p>{mensaje}</p>}
            <button className="link-btn" onClick={alCambiarARegistro}>¿No tienes cuenta? Registrate aquí</button>
        </div>
    );
}