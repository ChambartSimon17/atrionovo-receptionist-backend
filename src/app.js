import Fastify from "fastify";
import healthRoutes from "./routes/health.routes.js";
import crmRoutes from "./routes/crm.routes.js";
import reservationRoutes from "./routes/reservation.routes.js";
import errorHandler from "./middleware/error.middleware.js";

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
app.register(reservationRoutes, {
  prefix: "/reservations",
});

app.setErrorHandler(errorHandler);

export default app;