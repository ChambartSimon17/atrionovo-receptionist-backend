import Fastify from "fastify";
import healthRoutes from "./system/health.routes.js";
import reservationRoutes from "./modules/reservation/reservation.routes.js";
import restaurantRoutes from "./modules/restaurant/restaurant.routes.js";
import openingHourRoutes from "./modules/restaurant/opening-hours/opening-hour.routes.js";
import customerRoutes from "./modules/customer/customer.routes.js";
import errorHandler from "./middleware/error.middleware.js";
import specialOpeningDayRoutes from "./modules/restaurant/special-opening-days/special-opening-day.routes.js";

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
app.register(reservationRoutes, {
  prefix: "/reservations",
});
app.register(customerRoutes, {
  prefix: "/customers",
});
app.register(restaurantRoutes, {
  prefix: "/restaurants",
});
app.register(openingHourRoutes, {
  prefix: "/restaurants",
});
await app.register(specialOpeningDayRoutes);

app.setErrorHandler(errorHandler);

export default app;