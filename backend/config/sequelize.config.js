const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const RDS_CA_BUNDLE_PATH = '/app/rds-combined-ca-bundle.pem';

let rdsCaCert;
if (process.env.DB_SSL_CA) {
    rdsCaCert = process.env.DB_SSL_CA;
} else {
    try {
        rdsCaCert = fs.readFileSync(RDS_CA_BUNDLE_PATH, 'utf8');
    } catch {
        // File won't exist in local dev — SSL config will omit ca
    }
}

module.exports = {
    development: {
        username: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        host: process.env.PGHOST,
        port: process.env.PGPORT,
        dialect: 'postgres',
        logging: false
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
        logging: false,
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: true,
                ca: rdsCaCert,
            }
        }
    }
};
