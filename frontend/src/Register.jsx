import { useState } from 'react';

export default function Register({ alCambiarALogin }) {
    const [tipo, setTipo] = useState('usuario');
    const [nombre, setNombre] = useState('');
    const [email, setEmail] = useState('');
    const [dni, setDni] = useState('');
    const [token, setToken] = useState(''); // Valor por defecto para pruebas
    const [password, setPassword] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [cargando, setCargando] = useState(false);

    const manejarRegistro = async (e) => {
        e.preventDefault();
        setMensaje('');
        setCargando(true);
        try {

            const body = {tipo, email, password };
            if (tipo === 'usuario') body.nombre = nombre;
            if (tipo === 'trabajador') body.dni = dni;
            if (tipo === 'administrador') body.token = token;

            const response = await fetch('http://localhost:5000/api/registro', {
                method: 'POST',
                headers: {'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await response.json();
            if (response.ok) {
                setMensaje('Registro exitoso. Redirigiendo a inicio de sesión.');
                setTimeout(() => {alCambiarALogin();}, 1500);
            }else {
                setMensaje(data.error);
            }
        } catch {
            setMensaje('Error al conectar con el servidor.');
        } finally {
            setCargando(false);
        }
    };

    return (
        <div className="auth-container">
            <h2>Registro de Usuarios</h2>

            <div className="tipo-selector" style = {{ display: 'flex', gap: '8px', marginBottom: '12px'}}>
                <button type="button" onClick={() => setTipo('usuario')} disabled={tipo === 'usuario'}>Usuario</button>
                <button type="button" onClick={() => setTipo('trabajador')} disabled={tipo === 'trabajador'}>Trabajador</button>
                <button type="button" onClick={() => setTipo('administrador')} disabled={tipo === 'administrador'}>Administrador</button>
            </div>

            <form onSubmit={manejarRegistro}>
                {tipo === 'usuario' && (
                    <input
                        type="text"
                        placeholder="Nombre Completo"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)} required />
                )}
                {tipo === 'trabajador' && (
                    <input
                        type="text"
                        placeholder="DNI"
                        value={dni}
                        onChange={(e) => setDni(e.target.value)} required />
                )}

                <input
                    type="email"
                    placeholder="Correo Electronico"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)} required />
                <input
                    type="password"
                    placeholder="Contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)} required />

                {tipo === 'administrador' && (
                    <input
                        type="text"
                        placeholder="Token de Administrador"
                        value={token}
                        onChange={(e) => setToken(e.target.value)} required />
                )}
                
                <button type="submit" disabled={cargando}>{cargando ? 'Registrando...' : 'Registrarse'}</button>
            </form>
            {mensaje && <p>{mensaje}</p>}
            <button className="link-btn" onClick={alCambiarALogin}>¿Ya tienes cuenta? Inicia sesión</button>
        </div>
    );
}