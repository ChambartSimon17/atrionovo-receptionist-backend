import "dotenv/config";
import app from "./app.js";
import { env } from "./config/env.js";

const start = async () => {
  try {
    await app.listen({
      port: env.port,
      host: "0.0.0.0",
    });

    console.log("🚀 Server running on http://localhost:" + env.port);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();