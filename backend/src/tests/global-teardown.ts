import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbName = 'mydb_test';

export default async () => {
    // console.log('\nTearing down test database...');

    const client = new Client({
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        host: process.env.PGHOST,
        port: parseInt(process.env.PGPORT || '5432'),
        database: 'postgres',
    });

    try {
        await client.connect();

        // Terminate existing connections
        await client.query(`
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = '${dbName}'
            AND pid <> pg_backend_pid();
        `);

        await client.query(`DROP DATABASE IF EXISTS "${dbName}";`);

    } catch (err) {
        console.error('Error deleting test database:', err);
    } finally {
        await client.end();
    }

    // console.log('Test database teardown complete.');
};
