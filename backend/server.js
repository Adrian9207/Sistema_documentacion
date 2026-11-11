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
    console.error('ERROR: La variable de entorno ADMIN_BOOTSTRAP_TOKEN no esta configurada');
    process.exit(1);
}
/*
// arreglos temporales para simular la base de datos
const usuarios = [];  // { id, tipo, nombre?, dni?, email, password }
const dnisValidos = [];  // DNIs de trabajadores autorizados por un admin
const documentos = []; // {id, remitente, destinatario, asunto, archivo, nombreOriginal, fecha, seccion, delegadoA }
const SECCIONES_MOVILES = ['firma', 'proceso', 'entrada', 'delegados'];
const TIPOS_DOCUMENTO = ['incidente', 'solicitud_empleo',
    'certificado_estudios', 'constancia_estudios', 'solicitud_practicas', 'solicitud_permiso', 'solicitud_licencia', 'otros'];
*/
// minúsculas y sin tildes, para buscar "jose" y encontrar "José"
const normalizar = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// conexion a la base de datos PostgreSQL
pool.query('SELECT NOW()')
    .then(() => {
        console.log('PostgreSQL conectado correctamente');
    })
    .catch((error) => {
        console.error('Error al conectar con PostgreSQL: ', error);
    })

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

app.use('/api', require('./auth.routes')(verificarToken, verificarAdmin));

app.use('/api', require('./documentos.routes')(verificarToken, verificarAdmin));

// iniciar servidor en el puerto 5000
app.listen(5000, () => {
    console.log('Servidor iniciado en http://localhost:5000');
});
