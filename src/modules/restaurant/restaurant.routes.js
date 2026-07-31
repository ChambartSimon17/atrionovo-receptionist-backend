import restaurantController from "../restaurant/restaurant.controller.js";

export default async function restaurantRoutes(app) {
  app.post("/", restaurantController.createRestaurant);
}