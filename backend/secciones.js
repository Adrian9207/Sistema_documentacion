const TODOS = ['administrador','trabajador','usuario'];

export const SECCIONES = {
    firma: {titulo: 'Firma',                roles: ['administrador']},
    proceso: {titulo: 'En proceso',         roles: ['administrador']},
    entrada: {titulo: 'Bandeja de entrada', roles: TODOS },
    delegados: {titulo: 'Delegados',        roles: ['administrador', 'trabajador']},
    salida: {titulo: 'Bandeja de salida',   roles: TODOS },
    derivar: {titulo: 'Derivar',            roles: TODOS },
    dnis: {titulo: 'Autorizar DNI',         roles: ['administrador']},
};

export const seccionesPara = (tipo) => {
    Object.entries(SECCIONES)
    .filter(([, s]) => s.roles.includes(tipo))
    .map(([id, s]) => ({id, titulo: s.titulo}));
}
