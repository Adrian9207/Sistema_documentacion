const express = require ('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const dns = require('dns').promises;
const enviarCorreo = require('./mailer');
const { crearToken, consumirToken } = require('./tokens');
const FRONT = process.env.FRONTEND_URL || 'http://localhost:5173';
//modificar el registro de dni de admin para que se 6 digitos y que no se pueda repetir, y que solo se pueda registrar un admin 31/11/2026

const TIPOS_USUARIO = ['usuario', 'trabajador', 'administrador'];

module.exports = function (verificarToken, verificarAdmin) {
    const router = express.Router();
    const SECRET_KEY = process.env.SECRET_KEY;

    router.post('/registro', async (req, res) => {
        try {
            const { nombre, password, dni, token, tipo} = req.body;
            const email = (req.body.email || '').trim().toLowerCase();
    
            if (!tipo || !email || !password) {
                return res.status(400).json({ error: 'Todos los campos son requeridos.' });
            }
            if (!TIPOS_USUARIO.includes(tipo)) {
                return res.status(400).json({ error: 'Tipo de usuario inválido.' });
            }

            let nombreFinal = null;
            let dniFinal = null;
    
            if (tipo === 'usuario') {
                if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido ' });

                nombreFinal = nombre.trim();
            }
    
            if (tipo === 'trabajador') {
                if (!dni?.trim()) return res.status(400).json({ error: 'El DNI es requerido.' });

                dniFinal = dni.trim();
                const autorizado = await pool.query(
                    'SELECT 1 FROM dnis_autorizados WHERE dni = $1', [dniFinal]
                );
                if (autorizado.rowCount === 0) {
                    return res.status(403).json({ error: 'El DNI no esta autorizado pro un administrador'});
                }
            }
    
            if (tipo === 'administrador') {
                if (!token) return res.status(400).json({ error: 'El token de administrador es requerido.'                 
                });

                if (token !== process.env.ADMIN_BOOTSTRAP_TOKEN) {
                    return res.status(403).json({ error: 'Token inválido.' });
                }
    
                // Solo puede existir un administrador en todo el sistema
                const hayAdmin = await pool.query("SELECT 1 FROM usuarios WHERE tipo = 'administrador' ");

                if (hayAdmin.rowCount >= 2) {
                    return res.status(403).json({ error: 'Ya existe un administrador registrado.' });
                }
            }
            
            const dominio = email.split('@')[1];
            try {
                if (!(await dns.resolveMx(dominio)).length) throw 0;
            } catch {
                return res.status(400).json({ error: 'El dominio del correo no es válido.' });
            }

            // Hashear la contraseña
            const passwordHash = await bcrypt.hash(password, 12);

            const { rows } = await pool.query(
                `INSERT INTO usuarios (tipo, nombre, dni, email, password_hash)
                VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [tipo, nombreFinal, dniFinal, email, passwordHash]
            );

            const verificarToken = await crearToken(pool, rows[0].id, 'verificar', 60 * 24);
            enviarCorreo(email, 'Verifica tu correo', 
                `<a href="${FRONT}/verificar?token=${verificarToken}">Verificar correo</a>`).catch(console.error);
            res.status(201).json({ mensaje: 'Registrado. Revisa tu correo antes de iniciar sesión.' 
            });

        } catch (error) {
           // 23505 = violación de UNIQUE (también cubre condiciones de carrera)
            if (error.code === '23505') {
                if (error.constraint === 'usuarios_email_key')
                    return res.status(400).json({ error: 'El correo elecetronico ya esta registrado.' });
            
                if (error.constraint === 'usuarios_dni_key')
                    return res.status(400).json({ error: 'El DNI ya esta registrado.' });
                if (error.constraint === 'un_solo_admin')
                    return res.status(403).json({ error: 'Ya existe un administrador registrado'});
           }
           console.error('Error detallado en registro: ', error);
           res.status(500).json({ error: 'Error al registrar el usuario.' });
        }
    });

    // Ruta de login
    router.post('/login', async (req, res) => {
        try {
            const { password } = req.body;
            const email = (req.body.email || '').trim().toLowerCase();

            // Buscar al usuario por su correo electrónico
            const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);

            const usuario = rows[0];
            if (!usuario) {
                return res.status(400).json({ error: 'Credenciales incorrectas.' });
            }
    
            // Verificar la contraseña
            const passwordCorrecta = await bcrypt.compare(password, usuario.password_hash);
            
            if (!passwordCorrecta) {
                return res.status(400).json({ error: 'Credenciales incorrectas.' });
            }

            if (!usuario.email_verificado) 
                return res.status(403).json({ error: 'Debes verificar tu correo antes de iniciar sesión. ' });

            // Generar token JWT usando la variable global SECRET_KEY    
            const token = jwt.sign(
                { id: usuario.id, nombre: usuario.nombre, email: usuario.email, tipo: usuario.tipo, dni: usuario.dni },
                SECRET_KEY, 
                { expiresIn: '1h' }
            );
    
            res.json({
                mensaje: 'Inicio de sesión exitoso.',
                token,
                usuario: {tipo: usuario.tipo, nombre: usuario.nombre, dni: usuario.dni, email: usuario.email}
            });
        } catch (error) {
            console.error('Error detallado en login: ', error)
            res.status(500).json({ error: 'Error al iniciar sesión.' });
        }
    });

    router.post('/verificar-email', async (req, res) => {
        try {
            const id = await consumirToken(pool, req.body.token, 'verificar');
            if (!id) return res.status(400).json({ error: 'Enlace inválido o expirado.' });
            await pool.query(
                'UPDATE usuarios SET email_verificado = true WHERE id = $1', [id]);
            return res.json({ mensaje: 'Correo verificado. '});
        } catch (error) {
            console.error('Error al verificar email');
            return res.status(500).json({ error: 'Error al verificar el correo.' });
        }
    });

    router.post('/olvide-password', async (req, res) => {
        try {
            const email = (req.body.email || '').trim().toLowerCase();
            const { rows } = await pool.query(
                'SELECT id FROM usuarios WHERE email = $1 AND email_verificado', [email]);
            if (rows[0]) {
                const token = await crearToken(pool, rows[0].id, 'recuperar', 30);
                enviarCorreo(email, 'Recuperar contraseña',
                `<a href="${FRONT}/restablecer?token=${token}">Restablecer contraseña</a>`).catch(console.error);
            }
            return res.json ({ mensaje: 'Si el correo esta registrado, te enviamos un enlace.' });
        } catch (error) {
            console.error('Error en olvide password', error);
            return res.status(500).json({ error: 'Error al procesar la solicitud.' });
        }
    });

    router.post('/reenviar-verificacion', async (req, res) => {
        try {
            const email = (req.body.email || '').trim().toLowerCase();
            const { rows } = await pool.query(
                'SELECT id FROM usuarios WHERE email = $1 AND NOT email_verificado', [email]);
            if (rows[0]) {
                const token = await crearToken(pool, rows[0].id, 'verificar', 60 * 24);
                enviarCorreo(email, 'Verifica tu correo',
                    `<a href="${FRONT}/verificar?token=${token}">Verificar correo</a>`).catch(console.error);
            }
            res.json({ mensaje: 'Si el correo está pendiente de verificación, te enviamos un enlace.' });
        } catch (error) {
            console.error('Error al reenviar verificación: ', error);
            res.status(500).json({ error: 'Error al procesar la solicitud.' });
        }
    });

    router.post('/restablecer-password', async(req, res) => {
        try {
            const { token, password } = req.body;
            if (!password || password.length < 8 )
                return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
            const id = await consumirToken(pool, token, 'recuperar');
            if (!id) return res.status(400).json({ error: 'Enlace invalido o expirado.' });
            await pool.query(
                'UPDATE usuarios SET password_hash = $1 WHERE id = $2',
                [await bcrypt.hash(password, 12), id]);
            return res.json({ mensaje: 'Contraseña actualizada.' });
        } catch (error) {
            console.error('Error en restablecer password: ', error);
            return  res.status(500).json({ error: 'Error al restablecer la contraseña.' });
        }
    });

    router.post('/admin/dnis', verificarToken, verificarAdmin, async (req, res) => {
        try {
            const dni = (req.body.dni || '').trim();
            if (!dni) return res.status(400).json({ error: 'El DNI es requerido.' });
            
            const r = await pool.query(
                `INSERT INTO dnis_autorizados (dni, autorizado_por) VALUES ($1, $2)
                ON CONFLICT (dni) DO NOTHING`,
                [dni, req.user.id]
            );
            if (r.rowCount === 0) {
                return res.status(400).json ({ error: 'Este DNI ya esta en la lista.' });
            }
            res.status(201).json({ mensaje: 'DNI agregado correctamente.' });
        } catch (error) {
            console.error('Error al autorizar DNI: ', error);
            res.status(500).json({ error: 'Error al agregar el DNI.' });
        }
    });

    // Admin: buscar usuarios (común por nombre, trabajador por DNI)
    router.get('/usuarios/buscar', verificarToken, verificarAdmin, async (req, res) => {
        try {
            const { tipo } = req.query;
            const q = (req.query.q || '').trim();
            if (!['usuario', 'trabajador'].includes(tipo)) {
                return res.status(400).json({ error: 'Tipo de busqueda invalido.' });
            }
            if (q.length < 2) return res.json([]);

            const limpio = q.replace(/[%_\\]/g, '\\$&'); // escapar comodines de LIKE
            const sql = tipo === 'usuario'
                ?  `SELECT tipo, nombre, dni, email FROM usuarios
                    WHERE tipo = 'usuario' AND unaccent(nombre) ILIKE unaccent($1)
                    ORDER BY nombre LIMIT 10`
                :  `SELECT tipo, nombre, dni, email FROM usuarios
                    WHERE tipo = 'trabajador' AND dni LIKE $1
                    ORDER BY dni LIMIT 10`;
            const param = tipo === 'usuario' ? `%${limpio}%` : `${limpio}%`;

            const { rows } = await pool.query(sql, [param]);
            res.json(rows);
        } catch (error) {
            console.error('Error en busqueda de usuarios: ', error);
            res.status(500).json({ error: 'Error al buscar usuarios.'});
        }   
    });
    return router;
};


