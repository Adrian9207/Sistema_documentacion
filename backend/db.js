const { Pool } = require('pg')

const pool = new Pool({
    user: 'postgres', // cambiar el usuario en la base de datos PostgreSQL, pensar dos veces.
    host: 'localhost',
    database: 'gestion_documentos', // crear la base de datos en PostgreSQL, verificarlo
    password: process.env.DB_KEY,
    port: 5432
});

module.exports = pool;