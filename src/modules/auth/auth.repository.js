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
   * Finds a user by email within a business.
   */
  async findUserByEmail({
    businessId,
    email,
  }) {
    return prisma.user.findUnique({
      where: {
        businessId_email: {
          businessId,
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
        business: true,
      },
    });
  }

  /**
   * Finds a business by slug.
   */
  async findBusinessBySlug(slug) {
    return prisma.business.findUnique({
      where: {
        slug,
      },
    });
  }

  /**
   * Creates a business and its owner account
   * in a single database transaction.
   */
  async createBusinessWithOwner({
    business,
    user,
  }) {
    return prisma.$transaction(
      async (transaction) => {
        const createdBusiness =
          await transaction.business.create({
            data: {
              name: business.name,
              slug: business.slug,
              countryCode: business.countryCode,
            },
          });

        const createdUser =
          await transaction.user.create({
            data: {
              ...user,
              businessId:
                createdBusiness.id,
            },
          });

        return {
          business: createdBusiness,
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
        business: true,
      },
    });
  }
}

export default new AuthRepository();