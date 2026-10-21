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
    
    return (
        <div>
            {error && <p>Error: {error}</p>}
            {docs.length === 0 ? <p>No hay documentos en esta sección.</p> : (
                <table>
                    <thead>
                        <tr>
                            <th>Fecha</th><th>Asunto</th><th>De</th><th>Para</th><th>Archivo</th>
                            {puedeMover && <th>Acción</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {docs.map((d) => (
                            <tr key={d.id}>
                                <td>{etiquetaTipo(d)}</td>
                                <td>{d.asunto}</td>
                                <td>{d.nombreRemitente || d.remitente}</td>
                                <td>{d.telefono}</td>
                                <td>{d.destinatario}</td>
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



