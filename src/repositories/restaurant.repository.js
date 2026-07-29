import prisma from "../database/prisma.js";

class RestaurantRepository {
  async findBySlug(slug) {
    return prisma.restaurant.findUnique({
      where: {
        slug,
      },
    });
  }

  async create(data) {
    return prisma.restaurant.create({
      data,
    });
  }
}

export default new RestaurantRepository();