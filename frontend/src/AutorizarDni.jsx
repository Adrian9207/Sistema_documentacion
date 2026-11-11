import { useState } from 'react';

export default function AutorizarDni() {
    const [dni, setDni] = useState('');
    const [mensaje, setMensaje] = useState('');

    const agregar = async (e) => {
        e.preventDefault();

        if (dni.length !== 8) {
            setMensaje('El DNI debe tener 8 dígitos.');
            return;
        }

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

    const manejarCambioDni = (e) => {
        const valor = e.target.value;
        if (/^\d*$/.test(valor) && valor.length <= 8) {
            setDni(valor);
        }
    };

    return (
        <form onSubmit={agregar}>
            <input type="text" placeholder="DNI a autorizar" value={dni} 
                onChange={manejarCambioDni} pattern="[0-9]{8}" title="El DNI debe tener 8 dígitos" required />
            <button type="submit">Autorizar DNI</button>
            {mensaje && <p>{mensaje}</p>}
        </form>
    );
}