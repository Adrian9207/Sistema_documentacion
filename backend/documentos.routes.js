const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('./db');

// configuracion de almacenamiento
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || './storage');
// puedes cambiarla la configuracion de almacenamineto
const MAX_FILE_SIZE_MB = 10;
const EXTENSIONES = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg'];

const TIPOS_DOCUMENTO = ['incidente', 'solicitud_empleo', 'certificado_estudios', 'constancia_estudios', 
    'solicitud_practicas', 'solicitud_permiso', 'solicitud_licencia', 'otros'];
const SECCIONES_MOVILES = ['firma', 'proceso', 'entrada', 'delegados'];
const SECCIONES_POR_ROL = {
    administrador: ['firma', 'proceso', 'entrada', 'delegados', 'salida'],
    trabajador: ['entrada', 'delegados', 'salida'],
    usuario: ['entrada', 'salida']
};

const esUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || '');

// Estructura: STORAGE_DIR/AAAA/MM/<uuid>.<ext>  (el nombre original solo vive en la BD)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const hoy = new Date();
        const dir = path.join(STORAGE_DIR, String(hoy.getFullYear()), String(hoy.getMonth() + 1).padStart(2, '0'));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) =>
        cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase())
});

// Un middleware de subida que solo acepta las extensiones indicadas
const crearSubida = extensiones => {
    const upload = multer({
        storage,
        limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            if (!extensiones.includes(ext)) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE')); cb(null, true);
        }
    });
    return (req, res, next) => {
        upload.single('documento')(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                const msg = err.code === 'LIMIT_FILE_SIZE'
                    ?`El archivo excede el tamaño maximo permitido de ${MAX_FILE_SIZE_MB} MB. `
                    : err.code === 'LIMIT_UNEXPECTED_FILE'
                        ? `Tipo de archivo no permitido. Usa: ${extensiones.join(', ')}`
                        : `Error en la subida: ${err.message}`;
                return res.status(400).json ({ error: msg });
            }
            if (err) return res.status(500).json({ error: 'Error al procesar el archivo. '});
            next();
        });
    };
};

const subirArchivo = crearSubida(EXTENSIONES); // original: varios formatos
const subirFirmada = crearSubida(['.pdf']); // firmada: solo pdf

const hashArchivo = (ruta) => new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(ruta)
        .on('data', (d) => h.update(d))
        .on('error', reject)
        .on('end', () => resolve(h.digest('hex')));
});

const esPdf = (ruta) =>{
    const fd = fs.openSync(ruta, 'r');
    try {
        const buf = Buffer.alloc(5);
        fs.readSync(fd, buf, 0, 5, 0);
        return buf.toString('latin1') === '%PDF-';
    } finally {
        fs.closeSync(fd);
    }
};

// permisos(el backend decide por rol y relacion con el documento)
// doc: {remitente_id, destinatario_id, delegado_id}
const puede = (user, doc, accion) => {
    if (user.tipo === 'administrador') return true;
    const involucrado = doc.remitente_id === user.id || doc.destinatario_id === user.id;
    const delegado = doc.delegado_id === user.id;
    switch (accion) {
        case 'ver':
        case 'descargar':
            return involucrado || delegado;
        default: // revisar, firmar, derivar, mover: por ahora solo admin
            return false;
    }
};

module.exports = function (verificarToken, verificarAdmin) {
    const router = express.Router();

    // Derivar: sube el archivo y registra metadatos
    router.post('/derivar', verificarToken, subirArchivo, async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'Selecione un archivo.' });

        const rechazar = (status, error) => {
            fs.unlink(req.file.path, () => {});
            return res.status(status).json({ error });
        };

        const client = await pool.connect();
        try {
            const { tipoDocumento, tipoOtro, asunto, nombreCompleto, telefono } = req.body;
            const { tipo, email, id: usuarioId } = req.user;

            if (!TIPOS_DOCUMENTO.includes(tipoDocumento)) return rechazar(400, 'Tipo de documento invalido');
            if (tipoDocumento === 'otros' && !tipoOtro?.trim()) return rechazar(400, 'Especifica el tipo de documento.');
            if (!asunto?.trim()) return rechazar(400, 'El asunto es requerido.');
            if (tipo === 'usuario') {
                if (!nombreCompleto?.trim()) return rechazar(400, 'El nombre y apellido es requeridos.');
                if (!/^9\d{8}$/.test(telefono || '')) return rechazar(400, 'El telefono debe tener 9 digitos y empezar con 9.');
            }

            // Destinatario: el admin elige: los demas siempre van al administrador
            let destinatarioId;
            if (tipo === 'administrador') {
                const destEmail = (req.body.destinatario || '').trim().toLowerCase();
                if (destEmail === email) return rechazar(400, 'No puedes derivarte un documento a ti mismo');
                const r = await client.query ('SELECT id FROM usuarios WHERE email = $1', [destEmail]);
                if (r.rowCount === 0) return rechazar(400, 'El destinatario no existe.');
                destinatarioId = r.rows[0].id;
            } else {
                const r = await client.query("SELECT id FROM usuarios WHERE tipo = 'administrador'");
                if (r.rowCount === 0) return rechazar(400, 'Aun no hay administrador registrado.');
                destinatarioId = r.rows[0].id;
            }

            const rutaRelativa = path.relative(STORAGE_DIR, req.file.path).split(path.sep).join('/');
            const nombreOriginal = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); //tildes/ñ
            const sha256 = await hashArchivo(req.file.path);
            await client.query('BEGIN');

            const doc = await client.query(
                `INSERT INTO documentos 
                    (tipo_documento, tipo_otro, asunto, remitente_id, destinatario_id, nombre_remitente, telefono)
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                [tipoDocumento, 
                tipoDocumento === 'otros' ? tipoOtro.trim() : null,
                asunto.trim(), usuarioId, destinatarioId,
                tipo === 'usuario' ? nombreCompleto.trim() : null,
                tipo === 'usuario' ? telefono : null]
            );
            const documentoId = doc.rows[0].id;

            const ver = await client.query(
                `INSERT INTO documento_versiones 
                    (documento_id, version, clase, nombre_original, ruta_archivo, mime_type, tamano_bytes, sha256, subido_por)
                VALUES ($1, 1, 'original', $2, $3, $4, $5, $6, $7) RETURNING id`,
                [documentoId, nombreOriginal, rutaRelativa, req.file.mimetype, req.file.size, sha256, usuarioId]
            );

            await client.query(
                `INSERT INTO movimientos (documento_id, accion, seccion_destino, usuario_id, version_id)
                VALUES ($1, 'derivar', 'entrada', $2, $3)`,
                [documentoId, usuarioId, ver.rows[0].id]
            );

            await client.query('COMMIT');
            res.status(201).json({ mensaje: 'Documento derivado correctamente.'});
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            fs.unlink(req.file.path, () => {}); // no dejar archivos huerfanos
            console.error('Error al derivar: ', error);
            if (!res.headersSent) res.status(500).json({ error: 'Error al derivar el documento.' });
        } finally {
            client.release();
        }
    });

    // Listar documentos por seccion
    router.get('/documentos', verificarToken, async (req, res) => {
        try {
            const { seccion } = req.query;
            const { tipo, id } = req.user;

            if (!SECCIONES_POR_ROL[tipo]?.includes(seccion)) {
                return res.status(403).json({ error: 'No tienes acceso a esta seccion.'});
            }

            let where, params;
            switch (seccion) {
                case 'entrada':
                    where = "d.seccion_actual = 'entrda' AND d.destinatario_id = $1"; params = [id]; break;
                case 'salida':
                    where = 'd.remitente_id = $1'; params = [id]; break;
                case 'delegados':
                    if (tipo === 'administrador') {where = "d.seccion_actual = 'delegados'"; params = []; }
                    else { where = "d.seccion_actual = 'delegados' AND d.delegado_id = $1"; params = [id]; }
                    break;
                default: // firma, proceso (solo admin, ya valido)
                    where = 'd.seccion_actual = $1'; params = [seccion];
            }

            const { rows }  = await pool.query(
                `SELECT d.id,
                        d.tipo_documento    AS "tipoDocumento",
                        d.tipo_otro         AS "tipoOtro",
                        d.asunto,
                        d.nombre_remitente  AS "nombreRemitente",
                        d.telefono,
                        d.creado_en         AS fecha,
                        d.seccion_actual    AS seccion,
                        ur.email            AS remitente,
                        ud.email            AS destinatario,
                        COALESCE(json_agg(json_build_object(
                            'id', v.id, 'version', v.version,
                            'clase', v.clase, 'nombre', v.nombre_original
                            ) ORDER BY v.version) FILTER (WHERE v.id IS NOT NULL), '[]') AS versiones
                    FROM documentos d
                    JOIN usuarios ur ON ur.id = d.remitente_id
                    JOIN usuarios ud ON ud.id = d.destinatario_id
                    LEFT JOIN documento_versiones v ON v.documento_id = d.id
                    WHERE ${where}
                    GROUP BY d.id, ur.email, ud.email
                    ORDER BY d.creado_en DESC`,
                    params
            );
            res.json(rows);
        } catch (error) {
            console.error('Error al listar documentos: ', error);
            res.status(500).json({ error: 'Error al listar documentos.' });
        }
    });

    // Descargar una version (original o firmada)
    router.get('/documentos/:id/versiones/:versionId/descargar', verificarToken, async (req, res) => {
        try {
            const { id, versionId } = req.params;
            if (!esUuid(id) || !esUuid(versionId)) return res.status(400).json({ error: 'Identificador invalido.' });

            const { rows } = await pool.query(
                `SELECT d.id AS documento_id, d.remitente_id, d.destinatario_id, d.delegado_id,
                    v.id AS version_id, v.ruta_archivo, v.nombre_original
                FROM documento_versiones v
                JOIN documentos d ON d.id = v.documento_id
                WHERE v.id = $1 AND d.id = $2`,
                [versionId, id]
            );
            const doc = rows[0];
            if (!doc) return res.status(404).json({ error: 'Archivo no encontrado.' });
            if (!puede(req.user, doc, 'descargar')) {
                return res.status(403).json({ error: 'No tienes permiso para descargar este documento.' });
            }

            // Proteccion contra path traversal
            const absoluta = path.resolve(STORAGE_DIR, doc.ruta_archivo);
            if (!absoluta.startsWith(STORAGE_DIR + path.sep)) {
                return res.status(400).json({ error: 'Ruta invalida.' });                
            }
            if (!fs.existsSync(absoluta)) {
                return res.status(404).json({ error: 'El archivo fisico no existe en el servidor.' });
            }

            await pool.query(
                `INSERT INTO movimientos (documento_id, accion, usuario_id, version_id)
                VALUES ($1, 'descargar', $2, $3)`,
                [doc.documento_id, req.user.id, doc.version_id]
            );

            res.download(absoluta, doc.nombre_original);
        } catch (error) {
            console.error('Error al descargar: ', error);
            if (!res.headersSent) res.status(500).json({ error: 'Error al descargar el documento.' });
        }
    });

    // Mover documento entre secciones (solo admin). El archivo fisico no se toca
    router.patch('/documentos/:id/mover', verificarToken, verificarAdmin, async (req, res) => {
        const client = await pool.connect();
        try {
            const { destino } = req.body;
            const delegadoEmail = (req.body.delegadoA || '').trim().toLowerCase();

            if (!esUuid(req.params.id)) return res.status(400).json({ error: 'Identificador invalido.' });
            if (!SECCIONES_MOVILES.includes(destino)) {
                return res.status(400).json({ error: 'Seccion de destino invalida.' });
            }

            await client.query('BEGIN');

            const r = await client.query(
                'SELECT seccion_actual FROM documentos WHERE id = $1 FOR UPDATE', [req.params.id]
            );
            if (r.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Documento no encontrado.' });
            }
            const origen = r.rows[0].seccion_actual;

            let delegadoId = null;
            if (destino === 'delegados') {
                const t = await client.query(
                    "SELECT id FROM usuarios WHERE email = $1 AND tipo = 'trabajador'", [delegadoEmail]
                );
                if (t.rowCount === 0) {
                    await client.query('ROllBACK');
                    return res.status(400).json({ error: 'El delegado debe ser un trabajador registrado.' });
                }
                delegadoId = t.rows[0].id;
            }

            await client.query(
                'UPDATE documentos SET seccion_actual = $1, delegado_id = $2 WHERE id = $3',
                [destino, delegadoId, req.params.id]
            );
            await client.query(
                `INSERT INTO movimientos
                    (documento_id, accion, seccion_origen, seccion_destino, usuario_id, delegado_id)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [req.params.id, destino === 'delegados' ? 'delegar' : 'mover',
                    origen, destino, req.user.id, delegadoId]
            );

            await client.query('COMMIT');
            res.json({ mensaje: 'Documento movido correctamente.' });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('Error al mover: ', error);
            if (!res.headersSent) res.status(500).json({ error: 'Error al mover el documento.' });
        } finally {
            client.release();
        }
    });

    // Firmar: sube la version firmada (solo admin ). El original no se toca

    router.post('/documentos/:id/firmar', verificarToken, verificarAdmin, subirFirmada, async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'Seleciona el archivo firmado (PDF).' });

        const rechazar = (status, error) => {
            fs.unlink(req.file.path, () => {});
            return res.status(status).json({ error });
        };

        if (!esUuid(req.params.id)) return rechazar(400, 'Identificador invalido.');
        if (!esPdf(req.file.path)) return rechazar(400, 'El archivo no es un PDF valido.');

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Bloquea la fila para que dos firmas simultaneas no choquen en el numero de version
            const d = await client.query(
                'SELECT seccion_actual FROM documentos WHERE id = $1 FOR UPDATE', [req.params.id]
            );
            if (d.rowCount === 0) {
                await client.query('ROLLBACK');
                return rechazar(404, 'Documento no encontrado.');
            }
            const seccion = d.rows[0].seccion_actual;

            const nv = await client.query(
                'SELECT COALESCE(MAX(version), 0) + 1 AS v FROM documento_versiones WHERE documento_id = $1',
                [req.params.id]
            );
            const version = nv.rows[0].v;

            const rutaRelativa = path.relative(STORAGE_DIR, req.file.path).split(path.sep).join('/');
            const nombreOriginal = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
            const sha256 = await hashArchivo(req.file.path);

            const ver = await client.query(
                `INSERT INTO documento_versiones
                    (documento_id, version, clase, nombre_original, ruta_archivo, mime_type, tamano_bytes, sha256, subido_por)
                VALUES ($1, $2, 'firmada', $3, $4, $5, $6, $7, $8) RETURNING id`,
                [req.params.id, version, nombreOriginal, rutaRelativa,
                    req.file.mimetype, req.file.size, sha256, req.user.id]
            );

            await client.query(
                `INSERT INTO movimientos 
                (documento_id, accion, seccion_origen, seccion_destino, usuario_id, version_id)
                VALUES ($1, 'firmar', $2, $2, $3, $4)`,
                [req.params.id, seccion, req.user.id, ver.rows[0].id]
            );

            await client.query('COMMIT');
            res.status(201).json({ mensaje: 'Version firmada guardada correctamente.', version });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            fs.unlink(req.file.path, () => {});
            console.error('Error al firmar: ', error);
            if (!res.headersSent) res.status(500).json({ error: 'Error al guardar la version firmada.' });
        } finally {
            client.release();
        }
    });

    return router;
};


