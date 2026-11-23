import { useCallback, useEffect, useState } from "react";

const API = 'http://localhost:5000/api';
const VISIBLES = ['application/pdf', 'image/png', 'image/jpeg']; // lo que el navegador puede mostrar

export default function Plantillas({ usuario }) {
    const esAdmin = usuario.tipo === 'administrador';
    const token = localStorage.getItem('token');
    const auth = { Authorization: `Bearer ${token}` };

    const [plantillas, setPlantillas] = useState([]);
    const [nombre, setNombre] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [archivo, setArchivo] = useState(null);
    const [mensaje, setMensaje] = useState('');
    const [subiendo, setSubiendo] = useState(false);

    const cargar = useCallback(async () => {
        try {
            const res = await fetch(`${API}/plantillas`, {headers: auth});
            const data = await res.json();
            if (!res.ok) return setMensaje(data.error);
            setPlantillas(data);
        } catch {
            setMensaje('Error al cargar las plantillas.');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    const pedirBlob = async (p, ver) => {
        try {
            const res = await fetch(`${API}/plantillas/${p.id}/descargar${ver ? '?ver=1' : ''}`, { headers: auth });
            if (!res.ok) { setMensaje((await res.json()).error); return null; }
            return await res.blob();
        } catch {
            setMensaje('Error de conexion.');
            return null;
        }
    };

    const descargar = async (p) => {
        const blob = await pedirBlob(p, false);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = p.nombreArchivo;
        a.click();
        URL.revokeObjectURL(url);
    };

    const ver = async (p) => {
        const w = window.open('', '_blank'); // abrir antes del await para evitar el bloqueo de popups
        const blob = await pedirBlob(p, true);
        if (!blob) return w?.close();
        w.location.href = URL.createObjectURL(blob);
    };

    const subir = async (e) => {
        e.preventDefault();
        const form = e.target;
        setMensaje('');
        setSubiendo(true);
        try {
            const fd = new FormData();
            fd.append('nombre', nombre);
            fd.append('descripcion', descripcion);
            fd.append('archivo', archivo);
            const res = await fetch(`${API}/plantillas`, { method: 'POST', headers: auth, body: fd});
            const data = await res.json();
            if (!res.ok) return setMensaje(data.error);
            setMensaje(data.mensaje);
            setNombre(''); setDescripcion(''); setArchivo(null);
            form.reset();
            cargar();
        } catch {
            setMensaje('Error de conexion al subir la plantilla.');
        } finally {
            setSubiendo(false);
        }
    };

    const eliminar = async (p) => {
        if (!window.confirm(`¿Eliminar la plantilla "${p.nombre}"?`)) return;
        try {
            const res = await fetch(`${API}/plantillas/${p.id}`, { method: 'DELETE', headers: auth });
            const data = await res.json();
            setMensaje(res.ok ? data.mensaje : data.error);
            if (res.ok) cargar();
        } catch {
            setMensaje('Error de conexion al eliminar.');
        }
    };

    return (
        <fieldset style={{ marginBottom: 24, maxWidth: 480 }}>
            <legend>Plantillas</legend>

            {plantillas.length === 0 ? <p>No hay plantillas disponibles.</p> : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {plantillas.map((p) => (
                        <li key={p.id} style={{ marginBottom: 8 }}>
                            <strong>{p.nombre}</strong>
                            {p.descripcion && <div><small>{p.descripcion}</small></div>}
                            <div style={{ display: 'flex', gap: 8 }}>
                                {VISIBLES.includes(p.mimeType) && (
                                    <button type="button" onClick={() => ver(p)}>Ver</button>
                                )}
                                <button type="button" onClick={() => descargar(p)}>Descargar</button>
                                {esAdmin && <button type="button" onClick={() => eliminar(p)}>Eliminar</button>}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {esAdmin && (
                <form onSubmit={subir} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input type="text" placeholder="Nombre de la Plantilla" value={nombre}
                        onChange={(e) => setNombre(e.target.value)} maxLength={100} required />
                    <input type="text" placeholder="Descripcion (opcional)" value={descripcion} 
                        onChange={(e) => setDescripcion(e.target.value)} maxLength={200} />
                    <input type="file" onChange={(e) => setArchivo(e.target.files[0])} required />
                    <button type="submit" disabled={subiendo}>{subiendo ? 'Subinedo...' : 'Subir plantilla'}</button>
                </form>
            )}
            {mensaje && <p>{mensaje}</p>}
        </fieldset>
    );
}