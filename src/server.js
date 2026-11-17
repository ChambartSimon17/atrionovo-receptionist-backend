import 'dotenv/config.js';
import app from "./app.js";
import { env } from "./config/env.js";
import { startCalendarSync } from "./modules/calendar-sync/calendar-sync.scheduler.js";

const start = async () => {
  try {
    await app.listen({
      port: env.port,
      host: "0.0.0.0",
    });

    console.log("🚀 Server running on http://localhost:" + env.port);

    startCalendarSync();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();