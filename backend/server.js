// para ejecutar es node server.js
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { error } = require('console');
const fs = require('fs');

const SECRET_KEY = process.env.SECRET_KEY || 'clave_secreta_desrrollo_local';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' })); // permite conectar con el frontend(react)
app.use(express.json());

if (!process.env.SECRET_KEY) {
    console.error('ERROR: La variable de entorno SECRET_KEY no está configurada');
    process.exit(1);
}
// token que tú defines en .env y le das manualmente a la única persona que será administrador
if (!process.env.ADMIN_BOOTSTRAP_TOKEN) {
    console.error('ERROR: La variable de entorno ADMIN_BOOSTRAP_TOKEN no esta configurada');
    process.exit(1);
}

// arreglos temporales para simular la base de datos
const usuarios = [];  // { id, tipo, nombre?, dni?, email, password }
const dnisValidos = [];  // DNIs de trabajadores autorizados por un admin
const documentos = []; // {id, remitente, destinatario, asunto, archivo, nombreOriginal, fecha, seccion, delegadoA }
const SECCIONES_MOVILES = ['firma', 'proceso', 'entrada', 'delegados'];
const TIPOS_DOCUMENTO = (s = '') => ['incidente', 'solicitud_empleo',
    'certificado_estudios', 'constancia_estudios', 'solicitud_practicas', 'solicitud_permiso', 'solicitud_licencia', 'otros'];

// minúsculas y sin tildes, para buscar "jose" y encontrar "José"
const normalizar = (s = '') => s.normalize('NFD').replace(/[\u03000-\u036f]/g, '').toLowerCase().trim();

// conexion a la base de datos PostgreSQL
pool.query('SELECT NOW()')
    .then(() => {
        console.log('PostgreSQL conectado correctamente');
    })
    .catch((error) => {
        console.error('Error al conectar con PostgreSQL: ', error);
    })

// ruta de registro
app.post('/api/registro', async (req, res) => {
    try {
        const { nombre, email, password, dni, token, tipo} = req.body;

        if (!tipo || !email || !password) {
            return res.status(400).json({ error: 'Todos los campos son requeridos.' });
        }
        if (!['usuario', 'trabajador', 'administrador'].includes(tipo)) {
            return res.status(400).json({ error: 'Tipo de usuario inválido.' });
        }
        // Verificar si el usuario ya existe
        if (usuarios.find(u => u.email === email)) {
            return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
        }

        let datosExtra = {};

        if (tipo === 'usuario') {
            if (!nombre) return res.status(400).json({ error: 'El nombre es requerido ' });
            
            datosExtra = {nombre};
        }

        if (tipo === 'trabajador') {
            if (!dni) return res.status(400).json({ error: 'El DNI es requerido.' });
            if (!dnisValidos.includes(dni)) {
                return res.status(403).json({ error: 'El DNI no esta autorizado por un administrador.' });
            }
        if (usuarios.find(u => u.dni === dni)) {
                return res.status(400).json({ error: 'El DNI ya esta registrado.' });
            }

            datosExtra = {dni};
        }

        if (tipo === 'administrador') {
            if (!token) return res.status(400).json({ error: 'El token de administrador es requerido.'                 
            });

            // Solo puede existir un administrador en todo el sistema
            const hayAdministradores = usuarios.some(u => u.tipo === 'administrador');
            if (hayAdministradores) {
                return res.status(403).json({ error: 'Ya existe un administrador registrado.' });
            }
            if (token !== process.env.ADMIN_BOOTSTRAP_TOKEN) {
                return res.status(403).json({ error: 'Token inválido.' });
            }
        }

        // Hashear la contraseña
        const hashedPassword = await bcrypt.hash(password, 12);

        // Crear nuevo usuario
        const nuevoUsuario = {
            id: Date.now().toString(),
            tipo,
            email,
            password: hashedPassword,
            ...datosExtra
        };

        usuarios.push(nuevoUsuario);

        res.status(201).json({ mensaje: 'Usuario registrado correctamente.' });
    } catch (error) {
       // res.status(500).json({ error: 'Error al registrar el usuario.' });
       console.error('Error detallado en registro: ', error)
       res.status(500).json({ error: 'Error al registrar el usuario.' });
    }
});

// Ruta de login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Buscar al usuario por su correo electrónico
        const usuario = usuarios.find(u => u.email === email);
        if (!usuario) {
            return res.status(400).json({ error: 'Credenciales incorrectas.' });
        }

        // Verificar la contraseña
        const passwordCorrecta = await bcrypt.compare(password, usuario.password);
        if (!passwordCorrecta) {
            return res.status(400).json({ error: 'Credenciales incorrectas.' });
        }
        
        // Generar token JWT usando la variable global SECRET_KEY    
        const token = jwt.sign(
            { id: usuario.id, nombre: usuario.nombre || null, email: usuario.email, tipo: usuario.tipo, dni: usuario.dni || null },
            SECRET_KEY, 
            { expiresIn: '1h' }
        );

        res.json({
            mensaje: 'Inicio de sesión exitoso.',
            token,
            usuario: {tipo: usuario.tipo, nombre: usuario.nombre || null,dni: usuario.dni || null, email: usuario.email}
        });
    } catch (error) {
        console.error('Error detallado en login: ', error)
        res.status(500).json({ error: 'Error al iniciar sesión.' });
    }
});

// middleware de verificacion de token
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Acceso denegado.' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido o sesión expirada.' });
        }
        req.user = user;
        next();
    });
};

const verificarAdmin = (req, res, next) => {
    if (req.user.tipo !== 'administrador') {
        return res.status(403).json({ error: 'Acceso denegado. Solo administradores.' });
    }
    next();
};

// Un admin autoriza el DNI de un trabajador para que pueda registrarse
app.post('/api/admin/dnis', verificarToken, verificarAdmin, (req, res) => {
    const { dni } = req.body;
    if (!dni) return res.status(400).json({ error: 'El DNI es requerido.' });
    if (dnisValidos.includes(dni)) {
        return res.status(400).json({ error: 'Este DNI ya está en la lista.' });
    }
    dnisValidos.push(dni);
    res.status(201).json({ mensaje: 'DNI agregado correctamente.' });
});

// Definimos el limite en Megas para la subida de archivos
const MAX_FILE_SIZE_MB = 10; // 10 MB
const MAX_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Configuracion de almacenamineto y limites
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'), // Carpeta donde se guardarán los archivos
  // Renombramos el archivo con la fecha actual para evitar que se sobrescriban
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  } // Nombre único para cada archivo
});

const subirArchivo = (req, res, next) => {
    upload.single('documento')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            const msg = err.code === 'LIMIT_FILE_SIZE'
                ? `El archivo excede el tamaño maximo permitido de {MAX_FILE_SIZE_MB} MB.`
                : `Error en la subida: ${err.message}`;
            return res.status(400).json({ error: msg });
        }
        if (err) return res.status(500).json ({ error: 'Error al procesar el archivo.'})
        next();
    });
};

// Buscar usuarios (solo admin): común por nombre, trabajador por DNI
app.get('/api/usuarios/buscar', verificarToken, verificarAdmin, (req, res) => {
    const { tipo, q }= req.query;
    if (!['usuario', 'trabajador'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo de busqueda invalido.' });
    }
    const termino = normalizar(q);
    if (termino.length < 2) return res.json([]);

    const resultados = usuarios
        .filter(u => u.tipo === tipo)
        .filter(u => tipo === 'usuario'
            ? normalizar(u.nombre).includes(termino)
            : u.dni.startsWith(q.trim()))
        .slice(0, 10)
        .map(u => ({ tipo: u.tipo, nombre: u.nombre || null, dni: u.dni || null, email: u.email}));

    res.json(resultados);
});

app.post('/api/derivar', verificarToken, subirArchivo, (req, res) => {
    if (!req.file) return res.status(400). json({ error: 'Selecione un archivo.' });

    // Si algo falla, borramos el archivo ya guardado por multer
    const rechazar = (status, error) => {
        fs.unlink(req.file.path, () => {});
        return res.status(status). josn({ error });
    };

    const { tipoDocumento, tipoOtro, asunto, nombreCompleto, telefono } = req.body;
    const { tipo, email } = req.user;

    if (!TIPOS_DOCUMENTO.includes(tipoDocumento)) return rechazar(400, 'Tipo de documento invalido.');
    if (tipoDocumento === 'otros' && !tipoOtro?.trim()) return rechazar(400, 'Especifica el tipo de documento.');
    if (!asunto?.trim()) return rechazar(400, 'El asunto es requrido.');

    if (tipo === 'usuario') {
        if (!nombreCompleto?.trim()) return rechazar(400, 'El nombre y apellido son requeridos.');
        if (!/^9\d{8}$/.test(telefono || '')) return rechazar(400, 'El teléfono debe tener 9 dígitos y empezar con 9.');
    }

    // Destinatario: admin elige; los demas simepre van al administrador
    let destinatario;
    if (tipo === 'administrador') {
        destinatario = req.body.destinatario;
        if (destinatario === email) return rechazar(400, 'No puedes derivarte un documento a ti mismo.');
        if(!usuarios.find(u => u.email === destinatario)) return rechazar(400, 'El destinatario no existe.');
    } else {
        const admin = usuarios.find(u => u.tipo === 'administrador');
        if (!admin) return rechazar(400, 'Aun no hay un administrador registrado,');
        destinatario = admin.email;
    }

    documentos.push({
        id: Date.now().toString(),
        remitente: email,
        destinatario,
        tipoDocumento,
        tipoOtro: tipoDocumento === 'otros' ? tipoOtro.trim() : null,
        asunto: asunto.trim(),
        nombreRemitente: tipo === 'usuario' ? nombreCompleto.trim() : null,
        telefono: tipo === 'usuario' ? telefono : null,
        archivo: req.file.filename,
        nombreOriginal: req.file.originalname,
        fecha: new Date().toString(),
        seccion: 'entrada',
        delegadoA: null
    });
    res.status(201).json({ mensaje: 'Documento derivado correctamente.'});
});

// Listar documentos por seccion, validando permisos por rol
const SECCIONES_POR_ROL = {
    administrador: ['firma', 'proceso', 'entrada', 'delegados', 'salida'],
    trabajador: ['entrada', 'delegados', 'salida'],
    usuario: ['entrada', 'salida']
};

app.get('/api/documentos', verificarToken, (req, res) => {
    const { seccion } = req.query;
    const { tipo, email } = req.user;

    if (!SECCIONES_POR_ROL[tipo]?.includes(seccion)) {
        return res.status(403).json({error: 'No tienes acceso a esta seccion.' });
    }

    let lista;
    switch (seccion) {
        case 'entrada':
            lista = documentos.filter(d => d.seccion === 'entrada' && d.destinatario === email); break;
        case 'salida':
            lista = documentos.filter(d => d.remitente === email); break;
        case 'delegados':
            lista = documentos.filter(d => d.seccion === 'delegados' && (tipo === 'administrador' || d.delegadoA === email)); break;
        default: // firma, proceso (solo admin, ya validado)
            lista = documentos.filter(d => d.seccion === seccion);
    }
    res.json(lista);
});

// Mover documento entre secciones (solo admin)
app.patch('/api/documentos/:id/mover', verificarToken, verificarAdmin, (req, res) => {
    const { destino, delegadoA } = req.body;
    if (!SECCIONES_MOVILES.includes(destino)) {
        return res.status(400).json({ error: 'Seccion de destino invalida.' });
    }
    const doc = documentos.find(d => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documento  no encontrado.' });

    if  (destino === 'delegados') {
        if (!usuarios.find(u => u.email === delegadoA && u.tipo === 'trabajador')) {
            return res.status(400).json({ error: 'El delegado debe ser un trabajadpr registrado.' });
        }
        doc.delegadoA = delegadoA;
    } else {
        doc.delegadoA = null;
    }
    doc.seccion = destino;
    res.json({ mensaje: 'Documento movido correctamente.' });
});

// iniciar servidor en el puerto 5000
app.listen(5000, () => {
    console.log('Servidor iniciado en http://localhost:5000');
});
