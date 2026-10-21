import {useEffect, useState } from 'react';
import { tiposPara } from './tiposDocumento';

const API = 'http://localhost:5000/api';

export default function Derivar({ usuario }) {
    const esAdmin = usuario.tipo === 'administrador';
    const esComun = usuario.tipo === 'usuario';
    const token = localStorage.getItem('token');

    const tiposDisponibles = tiposPara(usuario.tipo);
    const [tipoDocumento, setTipoDocumento] = useState('');
    const [tipoOtro, setTipoOtro] = useState('');
    const [asunto, setAsunto] = useState('');
    const [nombreCompleto, setNombreCompleto] = useState(usuario.nombre || '');
    const [telefono, setTelefono] = useState('');
    const [archivo, setArchivo] = useState(null);
    const [mensaje, setMensaje] = useState('');
    const [enviando, setEnviando] = useState(false);

    // Busqueda de destinatario (solo admin)
    const [tipoBusqueda, setTipoBusqueda] = useState('usuario');
    const [consulta, setConsulta] = useState('');
    const [resultados, setResultados] = useState([]);
    const [destinatario, setDestinatario] = useState(null);

    const lista = consulta.trim().length >= 2 ? resultados : [];

    useEffect(() => {
        if (!esAdmin || consulta.trim().length < 2) return;
        const t = setTimeout(async () => {
            try {
                const res = await fetch(
                    `${API}/usuarios/buscar?tipo=${tipoBusqueda}&q=${encodeURIComponent(consulta.trim())}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const data = await res.json();
                setResultados(res.ok ? data : []);
            } catch {
                setResultados([]);
            }
        }, 300); //debounce
        return () => clearTimeout(t);
    }, [consulta, tipoBusqueda, esAdmin, token]);

    const cambiarTipoBusqueda = (t) => {
        setTipoBusqueda(t);
        setConsulta('');
        setResultados([]);
    };

    const enviar = async (e) => {
        e.preventDefault();
        const form = e.target;
        setMensaje('');
        if (!tipoDocumento) return setMensaje('Selecciona el tipo de documento.');
        if (esAdmin && !destinatario) return setMensaje('Selecciona un destinatario.');
        const fd = new FormData();
        fd.append('tipoDocumento', tipoDocumento);
        if (tipoDocumento === 'otros') fd.append('tipoOtro', tipoOtro);
        fd.append('asunto', asunto);
        if (esAdmin) fd.append('destinatario', destinatario.email);
        if (esComun) {
            fd.append('nombreCompleto', nombreCompleto);
            fd.append('telefono', telefono);
        }
        fd.append('documento', archivo);

        setEnviando(true);
        try {
            const res = await fetch(`${API}/derivar`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: fd
            });
            const data = await res.json();
            if (res.ok) { 
                setMensaje(data.mensaje);
                setTipoDocumento(''); setTipoOtro(''); setAsunto('');
                setTelefono(''); setArchivo(null);
                setDestinatario(null); setConsulta(''); setResultados([]);
                form.reset(); // limpiar el input file
            } else {
                setMensaje(data.error);
            }
        }catch{
            setMensaje('Error de conexion al derivar el documento.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
            <fieldset>
                <legend>Tipo de Documento</legend>
                {tiposDisponibles.map((t) => (
                    <label key={t.id} style={{ display: 'block' }}>
                        <input type="radio" name="tipoDocumento" checked={tipoDocumento === t.id} 
                        onChange={() => setTipoDocumento(t.id)}/> {t.label}
                    </label>
                ))}
                {tipoDocumento === 'otros' && (
                    <input type="text" placeholder="Especifica el tipo de documento" value={tipoOtro}
                    onChange={(e) => setTipoOtro(e.target.value)} maxLength={80} required />
                )}
            </fieldset>

            <input type="text" placeholder="Asunto" value={asunto}
                onChange={(e) => setAsunto(e.target.value)} required />

            {esComun && (
                <>
                    <input type='text' placeholder='Nombre y apellido' value={nombreCompleto}
                    onChange={(e) => setNombreCompleto(e.target.value)} required />
                    <input type='tel' inputMode='numeric' placeholder='Telefono (9 digitos)' value={telefono}
                    onChange={(e) => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    pattern='9[0-9]{8}' title='Debe tener 9 digitos y empezar con 9' required />
                </>
            )}

            {esAdmin ? (
                <fieldset>
                    <legend>Destinatario</legend>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <button type='button' disabled={tipoBusqueda === 'usuario'}
                            onClick={() => cambiarTipoBusqueda('usuario')}>Usuario comun</button>
                        <button type='button' disabled={tipoBusqueda === 'trabajador'}
                            onClick={() => cambiarTipoBusqueda('trabajador')}>Trabajador</button>
                    </div>
                    <input type='text' value={consulta} onChange={(e) => setConsulta(e.target.value)}
                        placeholder={tipoBusqueda === 'usuario' ? 'Buscar por nombre completo' : 'Buscar por DNI'} />
                    {lista.length > 0 && (
                        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0'}}>
                            {lista.map((u) = (
                                <li key={u.email}>
                                    <button type='button' onClick={() => {setDestinatario(u); setConsulta(''); setResultados([]);}}>
                                    {u.nombre || `DNI ${u.dni}`} - {u.email}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p>
                        Seleccionado: {destinatario
                        ? `${destinatario.nombre || `DNI ${destinatario.dni}`}(${destinatario.email})`
                        : 'ninguno'}
                    </p>
                </fieldset>
            ) : (
                <p><strong>Destinatario:</strong>Administracion (todos los documentos son revisados por el administrador)</p>
            )}

            <input type="file" onChange={(e) => setArchivo(e.target.files[0])} required />
            <button type="submit" disabled={enviando}>{enviando ? 'Enviando...' : 'Derivar'}</button>
            {mensaje && <p>{mensaje}</p>}
        </form>
    );
}