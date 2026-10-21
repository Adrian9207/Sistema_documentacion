import { useState } from "react";
import { SECCIONES, seccionesPara } from "./secciones";
import Bandeja from "./Bandeja";
import Derivar from "./Derivar";
import AutorizarDni from "./AutorizarDni";

export default function Dashboard({ usuario, alCerrarSesion }) {
    const menu = seccionesPara(usuario.tipo);
    const [activa, setActiva] = useState('entrada');

    return (
        <div Style={{display: 'flex', minHeight: '100vh'}}>
            <nav style={{width: 220, padding: 16, borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column', gap: 8}}>
                <h3>{usuario.nombre || usuario.email}</h3>
                <small>{usuario.tipo}</small>
                {menu.map((s) =>(
                    <button key={s.id} onClick = {() => setActiva(s.id)} disabled={activa === s.id}>
                        {s.titulo}
                    </button>
                ))}
                <button onClick={alCerrarSesion} style={{marginTop: 'auto'}}>
                    Cerrar sesión
                </button>
            </nav>

            <main style = {{flex: 1, padding: 24}}>
                <h2>{SECCIONES[activa].titulo}</h2>
                {activa === 'derivar' ? <Derivar usuario={usuario} />
                : activa === 'dnis' ? <AutorizarDni />
                : <Bandeja key={activa} seccion={activa} usuario={usuario} />}
            </main>
        </div>
    );
}


