import prisma from "../../db/prisma.js";

// ======================================================
// Business Repository
// ======================================================
//
// Responsibility
// Persist and retrieve business data.
//
// This repository is responsible only for database access.
// It does NOT contain business rules or validation.
// ======================================================

class BusinessRepository {
  /**
   * Retrieves a business by its unique identifier.
   */
  async findById(id) {
    return prisma.business.findUnique({
      where: {
        id,
      },
    });
  }

  /**
   * Retrieves a business by its unique slug.
   */
  async findBySlug(slug) {
    return prisma.business.findUnique({
      where: {
        slug,
      },
    });
  }

  /**
   * Creates a new business.
   */
  async create(data) {
    return prisma.business.create({
      data,
    });
  }

  /**
   * Updates an existing business.
   */
  async update(id, data) {
    return prisma.business.update({
      where: {
        id,
      },
      data,
    });
  }
}

export default new BusinessRepository();