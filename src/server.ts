import { createApp } from "./app";
import { env } from "./config/env";
import { connectDB, disconnectDB } from "./config/db";

const start = async (): Promise<void> => {
  await connectDB(env.mongoUri);
  const server = createApp().listen(env.port, () => {
    console.log(`Server listening on port ${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
