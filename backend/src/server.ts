import app from "./app";
import dotenv from "dotenv";
import path from "path";
import { closeDB, connectDB } from "./config/db";
import { connectRedis, closeRedis } from "./config/redis";
import { Server } from "http";

dotenv.config({ path: path.join(__dirname, '../.env') });

const PORT = Number(process.env.PORT) || 3000;

let server: Server | null = null;
let shuttingDown = false;

const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n${signal} received. Shutting down...`);

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
        console.error("Forcing shutdown after timeout...");
        process.exit(1);
    }, 5000).unref();

    try {
        if (server) {
            await new Promise<void>((resolve) => server!.close(() => resolve()));
            console.log("HTTP server closed");
        }

        await closeDB();
        console.log("Database connection closed");

        await closeRedis();
        console.log("Redis connection closed");

        process.exit(0);
    } catch (err) {
        console.error("Shutdown error:", err);
        process.exit(1);
    }
};

// Register handlers FIRST
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGUSR2", shutdown);

// Optional safety nets
process.on("uncaughtException", (err) => {
    console.error(err);
    shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
    console.error(reason);
    shutdown("unhandledRejection");
});

const startServer = async () => {
    console.log("Starting server...");

    server = app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });

    await connectDB();
    await connectRedis();
};

startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
