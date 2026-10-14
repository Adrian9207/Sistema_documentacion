const { Pool } = require('pg')

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'gestion_documentos',
    password: process.env.DB_KEY,
    port: 5432
});

module.exports = pool;