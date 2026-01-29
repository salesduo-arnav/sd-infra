import app from "./app";
import dotenv from "dotenv";
import path from "path";
import { Server } from "http";
import { closeDB, connectDB } from "./config/db";
import { connectRedis, closeRedis } from "./config/redis";

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const PORT = Number(process.env.PORT) || 3000;
let server: Server | null = null;

const shutdown = (signal: string) => {
    console.log(`\n[${signal}] signal received: closing HTTP server...`);

    // 1. Force shutdown if cleanup hangs longer than 10 seconds
    const forceExitTimeout = setTimeout(() => {
        console.error("⚠️ Force shutdown: Cleanup timed out.");
        process.exit(1);
    }, 10000);

    const cleanupResources = async () => {
        try {
            console.log("HTTP server closed.");

            // Close external connections
            await closeDB();
            console.log("Database connection closed.");

            await closeRedis();
            console.log("Redis connection closed.");

            // Clear the force timeout since we finished successfully
            clearTimeout(forceExitTimeout);
            console.log("✅ Graceful shutdown completed.");
            process.exit(0);
        } catch (err) {
            console.error("❌ Error during resource cleanup:", err);
            process.exit(1);
        }
    };

    // 2. Stop the server from accepting new connections
    if (server) {
        server.close(cleanupResources);
    } else {
        cleanupResources();
    }
};

// Start the Server
const startServer = async () => {
    try {
        console.log("Initializing services...");

        // Connect to Data Sources first
        await connectDB();
        await connectRedis();

        // Start listening
        server = app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
        });

    } catch (err) {
        console.error("❌ Failed to start server:", err);
        process.exit(1);
    }
};

// --- Signal Listeners ---

// Handle Nodemon restart
process.once("SIGUSR2", () => shutdown("SIGUSR2"));

// Handle generic termination (Ctrl+C, Docker stop, etc.)
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

// Execute
startServer();