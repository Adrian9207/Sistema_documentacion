import {useEffect, useState, useCallback} from 'react';
import { SECCIONES } from './secciones';
import { etiquetaTipo } from './tiposDocumento';
// encabezado: <th>Tipo</th><th>Asunto</th><th>De</th><th>Teléfono</th><th>Para</th>...

const API = 'http://localhost:5000/api';
const DESTINOS = ['firma', 'proceso', 'entrada', 'delegados'];

export default function Bandeja({ seccion, usuario }) {
    const [docs, setDocs] = useState([]);
    const [error, setError] = useState('');
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const puedeMover = usuario.tipo === 'administrador' && seccion !== 'salida';
    const puedeFirmar = usuario.tipo === 'administrador' && seccion === 'firma';

    const cargar = useCallback(async () => {
        try {
            const res = await fetch(`${API}/documentos?seccion=${seccion}`, {headers});
            const data = await res.json();
            if (!res.ok) return setError(data.error);
            setError('');
            setDocs(data);
        } catch {
            setError('Error al conectar con el servidor. ');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seccion]);

    useEffect(() => {cargar(); }, [cargar]);

    const mover = async (id, destino) => {
        if (!destino) return;
        let delegadoA;
        if (destino === 'delegados') {
            delegadoA = window.prompt('Correo del trabajador a quien delegas:');
            if (!delegadoA) return;
        }
        const res = await fetch(`${API}/documentos/${id}/mover`, {
            method: 'PATCH', headers, body: JSON.stringify({ destino, delegadoA })
        });
        const data = await res.json();
        if (!res.ok) return setError(data.error);
        cargar();
    };

    const firmar = async (docId, archivo) => {
        if (!archivo) return;
        const fd = new FormData();
        fd.append('documento', archivo);
        try {
            const res = await fetch(`${API}/documentos/${docId}/firmar`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd
            });
            const data = await res.json();
            if (!res.ok) return setError(data.error);
            setError('');
            cargar();
        } catch {
            setError('Error al subir la version firmada.');
        }
    };

    // El token va a en el header, por eso se descarga como blob y no con un <a herf>
    const descargar = async (docId, v) => {
        try {
            const res = await fetch(`${API}/documentos/${docId}/versiones/${v.id}/descargar`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                const data = await res.json();
                return setError(data.error);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = v.nombre;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            setError('Error al descargar el archivo.');
        }
    };

    
    return (
        <div>
            {error && <p>Error: {error}</p>}
            {docs.length === 0 ? <p>No hay documentos en esta sección.</p> : (
                <table>
                    <thead>
                        <tr>
                            <th>Fecha</th><th>Tipo</th><th>Asunto</th><th>De</th><th>Telefono</th><th>Para</th><th>Archivo</th>
                            {puedeFirmar && <th>Subir firmada</th>}
                            {puedeMover && <th>Acción</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {docs.map((d) => (
                            <tr key={d.id}>
                                <td>{new Date(d.fecha).toLocaleString('es-PE')}</td>
                                <td>{etiquetaTipo(d)}</td>
                                <td>{d.asunto}</td>
                                <td>{d.nombreRemitente || d.remitente}</td>
                                <td>{d.telefono}</td>
                                <td>{d.destinatario}</td>
                                <td>
                                    {d.versiones.map((v) => (
                                        <button key={v.id} type="button" onClick={() => descargar(d.id, v)}>
                                            {v.clase === 'original' ? 'Original' : 'Firmada'}
                                        </button>
                                    ))}
                                </td>
                                {puedeFirmar && (
                                    <td>
                                        <input type="file" accept="application/pdf" 
                                            onChange={(e) => {firmar(d.id, e.target.files[0]); e.target.value = ''; }}/>
                                    </td>
                                )}
                                {puedeMover && (
                                    <td>
                                        <select value="" onChange={(e) => mover(d.id, e.target.value)}>
                                            <option value="">Mover a...</option>
                                            {DESTINOS.filter((s) => s !== seccion).map((s) => (
                                                <option key={s} value={s}>{SECCIONES[s].titulo}</option>
                                            ))}
                                        </select>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}



