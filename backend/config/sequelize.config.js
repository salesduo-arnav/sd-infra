require('dotenv').config();

module.exports = {
    development: {
        username: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        host: process.env.PGHOST,
        port: process.env.PGPORT,
        dialect: 'postgres',
        logging: console.log
    },
    test: {
        username: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE, // Or a separate test DB if desired
        host: process.env.PGHOST,
        port: process.env.PGPORT,
        dialect: 'postgres',
        logging: false
    },
    production: {
        username: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        host: process.env.PGHOST,
        port: process.env.PGPORT,
        dialect: 'postgres',
        logging: false
        // dialectOptions: {
        //   ssl: {
        //     require: true,
        //     rejectUnauthorized: false
        //   }
        // }
    }
};
