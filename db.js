const { Pool } = require('pg');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
};

if (process.env.INSTANCE_UNIX_SOCKET) {
    dbConfig.host = process.env.INSTANCE_UNIX_SOCKET;
} else {
    dbConfig.host = process.env.DB_HOST;
    dbConfig.port = process.env.DB_PORT;
}

const pool = new Pool(dbConfig);

module.exports = pool;