import restaurantController from "../controllers/restaurant.controller.js";

export default async function restaurantRoutes(app) {
  app.post("/", restaurantController.createRestaurant);
}