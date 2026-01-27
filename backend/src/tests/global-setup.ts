import { Client } from 'pg';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbName = 'mydb_test';

export default async () => {
    // console.log('\nSetting up test database...');

    // 1. Create the database
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
        await client.query(`CREATE DATABASE "${dbName}";`);

    } catch (err) {
        console.error('Error creating test database:', err);
        process.exit(1);
    } finally {
        await client.end();
    }

    // 2. Run Migrations
    // We need to set PGDATABASE to the test db for the migration command
    try {
        // execSync inherits stdio so we see migration output
        execSync('npm run migrate:up', {
            env: { ...process.env, PGDATABASE: dbName },
            stdio: 'inherit'
        });
    } catch (err) {
        console.error('Error running migrations for test database:', err);
        process.exit(1);
    }

    // console.log('Test database setup complete.\n');
};
