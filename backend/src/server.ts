import app from './app';
import dotenv from 'dotenv';
import { closeDB, connectDB } from './config/db';

dotenv.config();

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        console.log('Starting server...');
        await connectDB(); // Initial connection check

        const server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

        // Graceful Shutdown Logic
        const shutdown = async (signal: string) => {
            console.log(`${signal} received: closing HTTP server`);

            server.close(async () => {
                console.log('HTTP server closed');

                try {
                    // Close Database Pool
                    await closeDB();
                    console.log('Database connection closed');
                    process.exit(0);
                } catch (err) {
                    console.error('Error closing database connection:', err);
                    process.exit(1);
                }
            });
        };

        // Listen for termination signals
        process.on('SIGTERM', () => shutdown('SIGTERM')); // Docker stop
        process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C locally

    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};

startServer();