import app from "./app";
import dotenv from "dotenv";
import path from "path";
import http from "http";
import { closeDB, connectDB } from "./config/db";
import { connectRedis, closeRedis } from "./config/redis";

dotenv.config({ path: path.join(__dirname, "../.env") });

const PORT = Number(process.env.PORT) || 3000;

let server: http.Server;

const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] Graceful shutdown started...`);

    const forceExit = setTimeout(() => {
        console.error("⚠️ Force shutdown after 10s");
        process.exit(1);
    }, 10000);

    try {
        if (server) {
            console.log("Closing HTTP server...");
            await new Promise<void>((resolve, reject) => {
                server.close(err => (err ? reject(err) : resolve()));
            });
            console.log("HTTP server closed.");
        }

        console.log("Closing database...");
        await closeDB();
        console.log("Database closed.");

        console.log("Closing redis...");
        await closeRedis();
        console.log("Redis closed.");

        clearTimeout(forceExit);
        console.log("✅ Graceful shutdown complete.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Shutdown failed:", err);
        process.exit(1);
    }
};

const startServer = async () => {
    try {
        console.log("Initializing services...");

        await connectDB();
        await connectRedis();

        server = app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error("❌ Failed to start server:", err);
        process.exit(1);
    }
};

// Ctrl+C / Docker stop
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Nodemon restart
process.once("SIGUSR2", async () => {
    await shutdown("SIGUSR2");
    process.kill(process.pid, "SIGUSR2");
});

startServer();