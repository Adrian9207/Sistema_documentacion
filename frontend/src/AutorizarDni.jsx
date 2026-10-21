import { useState } from 'react';

export default function AutorizarDni() {
    const [dni, setDni] = useState('');
    const [mensaje, setMensaje] = useState('');

    const agregar = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('http://localhost:5000/api/admin/dnis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ dni })
            });
            const data = await res.json();
            setMensaje(res.ok ? 'DNI agregado correctamente.' : data.error);
            if (res.ok) setDni('');
        } catch {
            setMensaje('Error de conexion al agregar el DNI.');
        }
    };

    return (
        <form onSubmit={agregar}>
            <input type="text" placeholder="DNI a autorizar" value={dni} 
                onChange={(e) => setDni(e.target.value)} required />
            <button type="submit">Autorizar DNI</button>
            {mensaje && <p>{mensaje}</p>}
        </form>
    );
}