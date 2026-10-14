// para ejecutar es node server.js
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db')

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

const upload = multer({
    storage: storage, 
    limits: { fileSize: MAX_SIZE_BYTES }, // Limite de tamaño de archivo
});

// ruta protegida de subida de archivos con manejo de errores de multer
app.post('/api/upload', verificarToken, (req, res) => {
    // ejecutamos la funcion de subida dentro de un callback para capturar errores de multer
    upload.single('documento')(req, res, (err) => {
        // validar si multer arrojo un error (como exceder el tamaño)
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    error: `El archivo excede el tamaño máximo permitido de ${MAX_FILE_SIZE_MB} MB.`
                });
            }
            return res.status(400).json({ error: `Error en la subida: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ error: 'Error interno del servidor al procesar el archivo.' });
        }

        // validar que el usuario haya subido un archivo
        if (!req.file) {
            return res.status(400).json({ error: 'Porfavor, seleccione un archivo para subir.' });
        }

        // respuesta exitosa
        res.json({
            mensaje: 'Archivo subido exitosamente.',
            usuario: req.user.nombre,
            archivo: req.file.filename,
            tamanoMB: (req.file.size / (1024 * 1024)).toFixed(2) // tamaño en MB
        });
    });
});

// iniciar servidor en el puerto 5000
app.listen(5000, () => {
    console.log('Servidor iniciado en http://localhost:5000');
});
