import Fastify from "fastify";
import healthRoutes from "./routes/health.routes.js";
import crmRoutes from "./routes/crm.routes.js";

const app = Fastify({
  logger: true,
});

app.get("/", async (request, reply) => {
  return {
    status: "OK",
    message: "AtrioNovo backend is running",
  };
});

app.register(healthRoutes);
app.register(crmRoutes);

export default app;