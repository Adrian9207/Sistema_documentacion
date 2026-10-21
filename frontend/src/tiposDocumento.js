const ROL_TODOS = ['administrador','trabajador','usuario'];

export const TIPOS = [
    { id: 'incidente',               label: 'Incidente',                roles: ['administrador', 'trabajador'] },
    { id: 'solicitud_empleo',        label: 'Solicitud de empleo',      roles: ['administrador', 'usuario'] },
    { id: 'certificado_estudios',    label: 'Certificado de estudios',  roles: ['administrador', 'usuario'] },
    { id: 'constancia_estudios',     label: 'Constancia de estudios',   roles: ['administrador', 'usuario'] },
    { id: 'solicitud_practicas',     label: 'Solicitud de prácticas',   roles: ['administrador', 'usuario'] },
    { id: 'solicitud_permiso',       label: 'Solicitud de permiso',     roles: ROL_TODOS },
    { id: 'solicitud_licencia',      label: 'Solicitud de licencia',    roles: ['administrador', 'trabajador'] },
    { id: 'otros',                   label: 'Otros',                    roles: ROL_TODOS },
];

export const tiposPara = (rol) => 
    TIPOS.filter((t) => t.roles.includes(rol));

export const etiquetaTipo = (d) =>
    d.tipoDocumento === 'otros'
        ? `Otros: ${d.tipoOtro}`
        : TIPOS.find((t) => t.id === d.tipoDocumento)?.label || '-';
