import prisma from "../../db/prisma.js";

// ======================================================
// Restaurant Repository
// ======================================================
//
// Responsibility
// Persist and retrieve restaurant data.
//
// This repository is responsible only for database access.
// It does NOT contain business rules or validation.
// ======================================================

class RestaurantRepository {
  /**
   * Retrieves a restaurant by its unique identifier.
   */
  async findById(id) {
    return prisma.restaurant.findUnique({
      where: {
        id,
      },
    });
  }

  /**
   * Retrieves a restaurant by its unique slug.
   */
  async findBySlug(slug) {
    return prisma.restaurant.findUnique({
      where: {
        slug,
      },
    });
  }

  /**
   * Creates a new restaurant.
   */
  async create(data) {
    return prisma.restaurant.create({
      data,
    });
  }

  /**
   * Updates an existing restaurant.
   */
  async update(id, data) {
    return prisma.restaurant.update({
      where: {
        id,
      },
      data,
    });
  }
}

export default new RestaurantRepository();