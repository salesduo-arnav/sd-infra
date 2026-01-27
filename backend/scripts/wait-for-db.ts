import sequelize from '../src/config/db';

const wait = async () => {
    console.log('Waiting for database connection...');
    let retries = 20;
    while (retries > 0) {
        try {
            await sequelize.authenticate();
            console.log('Database connected successfully (Sequelize Auth Check)');
            process.exit(0);
        } catch (error) {
            console.log(`Database connection failed. Retrying in 2s... (${retries} retries left)`);
            retries--;
            await new Promise(res => setTimeout(res, 2000));
        }
    }
    console.error('Could not connect to database after multiple retries');
    process.exit(1);
};

wait();
