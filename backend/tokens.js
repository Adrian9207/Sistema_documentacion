const crypto = require('crypto');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function crearToken(db, usuarioId, proposito, minutos) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.query(
        `UPDATE tokens_email SET usado_en = now()
        WHERE usuario_id = $1 AND proposito = $2 AND usado_en IS NULL`, [usuarioId, proposito]);
    await db.query(
        `INSERT INTO tokens_email (usuario_id, proposito, token_hash, expira_en)
        VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
        [usuarioId, proposito, sha256(token), minutos]);
    return token;
}

async function consumirToken(db, token, proposito) {
    const r = await db.query(
        `UPDATE tokens_email SET usado_en = now()
        WHERE token_hash = $1 AND proposito = $2 AND usado_en IS NULL AND expira_en > now()
        RETURNING usuario_id`, [sha256(token || ''), proposito]);
    return r.rows[0]?.usuario_id;
}
module.exports = { crearToken, consumirToken };