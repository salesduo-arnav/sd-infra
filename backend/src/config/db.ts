import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import Logger from '../utils/logger';

dotenv.config({ path: path.join(__dirname, '../../.env') }); // ensure .env is valid

const isProduction = process.env.NODE_ENV === 'production';

const sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT) || 5432,
    username: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    logging: false,
    pool: {
        max: 10,
        min: 2,
        acquire: 30000,
        idle: 10000
    },
    ...(isProduction && {
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: true,
                ...(process.env.DB_SSL_CA && { ca: process.env.DB_SSL_CA }),
            },
        },
    }),
});

export const connectDB = async () => {
    try {
        await sequelize.authenticate();
        Logger.info('Database connected successfully (Sequelize)');
    } catch (error) {
        Logger.error('Unable to connect to the database:', error);
        throw error;
    }
};

export const closeDB = async () => {
    await sequelize.close();
};

export default sequelize;
