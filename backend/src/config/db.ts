import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') }); // ensure .env is valid

const sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT) || 5432,
    username: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    logging: false,
});

export const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connected successfully (Sequelize)');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
        process.exit(1);
    }
};

export const closeDB = async () => {
    await sequelize.close();
};

export default sequelize;
