// agregar una restablecimiento de contraseña todos los usuarios.
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
    
    const [verificando, setVerificando] = useState(false);
    const [emailPendiente, setEmailPendiente] = useState('');
    const [codigo, setCodigo] = useState('');

    const manejarRegistro = async (e) => {
        e.preventDefault();
        setMensaje('');
        setCargando(true);
        try {
            const correo = email.trim().toLowerCase();
            const body = {tipo, email: correo, password };
            if (tipo === 'usuario') body.nombre = nombre;
            if (tipo === 'trabajador') body.dni = dni;
            if (tipo === 'administrador') body.token = token;

            const response = await fetch('http://localhost:5000/api/registro', {
                method: 'POST',
                headers: {'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await response.json();
            if (!response.ok) {
                setMensaje(data.error || 'No se pudo iniciar el registro.');
                return;
            }

            setEmailPendiente(correo);
            setVerificando(true);
            setMensaje(data.mensaje || 'Revisa tu correo e introduce el codigo de verificacion.');
        } catch {
            setMensaje('Error al conectar con el servidor.');
        } finally {
            setCargando(false);
        }
    };

    const manejarVerificacion = async (e) => {
        e.preventDefault();
        setMensaje('');
        setCargando(true);

        try {
            const response = await fetch('http://localhost:5000/api/verificar-correo', {
                method: 'POST',
                headers: {'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailPendiente, codigo })
            });
            const data = await response.json();
            if (!response.ok) {
                setMensaje(data.error || 'No se pudo verificar el correo.');
                return;
            }

            setMensaje(data.mensaje || 'Correo verificado correctamente.');
            setTimeout(() => alCambiarALogin(), 1200);
        } catch {
            setMensaje('Error al conectar con el servidor.');
        } finally {
            setCargando(false);
        }
    };

    return (
        <div className="auth-container">
            <h2>{verificando ? 'Verificar correo electronico' : 'Registro de Usuarios'}</h2>

            {!verificando ? (
                <>
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
                        
                        <button type="submit" disabled={cargando}>{cargando ? 'Enviando codigo...' : 'Registrarse'}</button>
                    </form>
                </>
            ) : (
                <form onSubmit={manejarVerificacion}>
                    <p>Enviamos un codigo de tres digitos a <strong>{emailPendiente}</strong>. Caduca en 5 minutos.</p>
                    <input type="text" inputMode="numeric" pattern="[0-9]{3}" maxLength={3} placeholder="Codigo de verificacion" 
                    value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))} required/>
                    <button type="submit" disabled={cargando || codigo.length !== 3}>
                    {cargando ? 'Verificando...' : 'Verificar correo'}
                    </button>
                </form>
            )}

            {mensaje && <p role="status">{mensaje}</p>}
            <button className="link-btn" onClick={alCambiarALogin} disabled={cargando}>
                ¿Ya tienes cuenta? Inicia sesión
            </button>
        </div>
    );
}