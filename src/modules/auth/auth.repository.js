import prisma from "../../db/prisma.js";

// ======================================================
// Auth Repository
// ======================================================
//
// Responsibility
// Handle database operations related to
// authentication and user accounts.
//
// This repository contains no business logic.
// ======================================================

class AuthRepository {
  /**
   * Finds a user by email within a restaurant.
   */
  async findUserByEmail({
    restaurantId,
    email,
  }) {
    return prisma.user.findUnique({
      where: {
        restaurantId_email: {
          restaurantId,
          email,
        },
      },
    });
  }

  /**
   * Finds a user by ID.
   */
  async findUserById(id) {
    return prisma.user.findUnique({
      where: {
        id,
      },
      include: {
        restaurant: true,
      },
    });
  }

  /**
   * Finds a restaurant by slug.
   */
  async findRestaurantBySlug(slug) {
    return prisma.restaurant.findUnique({
      where: {
        slug,
      },
    });
  }

  /**
   * Creates a restaurant and its owner account
   * in a single database transaction.
   */
  async createRestaurantWithOwner({
    restaurant,
    user,
  }) {
    return prisma.$transaction(
      async (transaction) => {
        const createdRestaurant =
          await transaction.restaurant.create({
            data: {
              name: restaurant.name,
              slug: restaurant.slug,
              countryCode: restaurant.countryCode,
            },
          });

        const createdUser =
          await transaction.user.create({
            data: {
              ...user,
              restaurantId:
                createdRestaurant.id,
            },
          });

        return {
          restaurant: createdRestaurant,
          user: createdUser,
        };
      }
    );
  }

  /**
   * Finds a user by email.
   */
  async findUserByEmailAddress(email) {
    return prisma.user.findUnique({
      where: {
        email,
      },
      include: {
        restaurant: true,
      },
    });
  }
}

export default new AuthRepository();