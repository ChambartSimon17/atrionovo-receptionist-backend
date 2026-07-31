import Fastify from "fastify";
import healthRoutes from "./system/health.routes.js";
import crmRoutes from "./modules/crm/crm.routes.js";
import reservationRoutes from "./modules/reservation/reservation.routes.js";
import restaurantRoutes from "./modules/restaurant/restaurant.routes.js";
import openingHourRoutes from "./modules/restaurant/opening-hours/opening-hour.routes.js";
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
app.register(restaurantRoutes, {
  prefix: "/restaurants",
});
app.register(openingHourRoutes, {
  prefix: "/restaurants",
});

app.setErrorHandler(errorHandler);

export default app;