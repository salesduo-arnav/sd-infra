import sequelize from '../src/config/db';
import Logger from '../src/utils/logger';

const wait = async () => {
    Logger.info('Waiting for database connection...');
    let retries = 20;
    while (retries > 0) {
        try {
            await sequelize.authenticate();
            Logger.info('Database connected successfully (Sequelize Auth Check)');
            process.exit(0);
        } catch (error) {
            Logger.error(`Database connection failed. Retrying in 2s... (${retries} retries left)`);
            retries--;
            await new Promise(res => setTimeout(res, 2000));
        }
    }
    Logger.error('Could not connect to database after multiple retries');
    process.exit(1);
};

wait();
