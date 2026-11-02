import prisma from "../../db/prisma.js";

// ======================================================
// Customer Repository
// ======================================================
//
// Responsibility
// Handle database operations related to customers.
//
// Tenant Isolation
// Dashboard customer operations are business-scoped.
// ID-based operations therefore require businessId.
//
// Transaction Support
// All methods accept an optional Prisma client so they
// can participate in larger transactions such as
// reservation creation/update flows.
// ======================================================

class CustomerRepository {
  /**
   * Creates a customer.
   */
  async create(
    data,
    db = prisma
  ) {
    return db.customer.create({
      data,
    });
  }

  /**
   * Retrieves a customer by id within a business.
   *
   * Business scoping prevents a customer belonging
   * to another business from being accessed.
   */
  async findById(
    id,
    businessId,
    db = prisma
  ) {
    return db.customer.findFirst({
      where: {
        id,
        businessId,
      },
    });
  }

  /**
   * Retrieves all customers belonging to a business.
   *
   * Customers are ordered alphabetically by last name,
   * then by first name.
   *
   * Business scoping ensures that customers from
   * other businesses are never returned.
   */
  async findAllForBusiness(
    businessId,
    db = prisma
  ) {
    return db.customer.findMany({
      where: {
        businessId,
      },
      orderBy: [
        {
          lastName: "asc",
        },
        {
          firstName: "asc",
        },
      ],
    });
  }

  /**
   * Searches customers by first name or last name
   * within a business.
   */
  async searchByName(
    businessId,
    query,
    db = prisma
  ) {
    return db.customer.findMany({
      where: {
        businessId,
        OR: [
          {
            firstName: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            lastName: {
              contains: query,
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: [
        {
          lastName: "asc",
        },
        {
          firstName: "asc",
        },
      ],
      take: 20,
    });
  }

  /**
   * Retrieves a customer by id together with
   * their reservation history.
   *
   * The customer is scoped to the business so
   * customers from another business cannot be accessed.
   *
   * Reservations are ordered from newest to oldest.
   */
  async findByIdWithReservations(
    id,
    businessId,
    db = prisma
  ) {
    return db.customer.findFirst({
      where: {
        id,
        businessId,
      },
      include: {
        reservations: {
          orderBy: {
            startTime: "desc",
          },
        },
      },
    });
  }

  /**
   * Retrieves a customer by phone number.
   */
  async findByPhoneNumber(
    businessId,
    phoneNumber,
    db = prisma
  ) {
    return db.customer.findUnique({
      where: {
        businessId_phoneNumber: {
          businessId,
          phoneNumber,
        },
      },
    });
  }

  /**
   * Retrieves a customer together with
   * upcoming confirmed reservations.
   */
  async findProfileByPhoneNumber(
    businessId,
    phoneNumber,
    db = prisma
  ) {
    return db.customer.findUnique({
      where: {
        businessId_phoneNumber: {
          businessId,
          phoneNumber,
        },
      },
      include: {
        reservations: {
          where: {
            status: "CONFIRMED",
            startTime: {
              gte: new Date(),
            },
          },
          orderBy: {
            startTime: "asc",
          },
        },
      },
    });
  }

  /**
   * Retrieves a customer by email.
   */
  async findByEmail(
    businessId,
    email,
    db = prisma
  ) {
    return db.customer.findFirst({
      where: {
        businessId,
        email,
      },
    });
  }

  /**
   * Updates a customer within a business.
   *
   * Business scoping prevents updates to customers
   * belonging to another business.
   */
  async update(
    id,
    businessId,
    data,
    db = prisma
  ) {
    return db.customer.updateMany({
      where: {
        id,
        businessId,
      },
      data,
    }).then(async (result) => {
      if (result.count === 0) {
        return null;
      }

      return db.customer.findFirst({
        where: {
          id,
          businessId,
        },
      });
    });
  }

  /**
   * Deletes a customer within a business.
   *
   * Business scoping prevents deletion of customers
   * belonging to another business.
   */
  async delete(
    id,
    businessId,
    db = prisma
  ) {
    return db.customer.deleteMany({
      where: {
        id,
        businessId,
      },
    });
  }
}

export default new CustomerRepository();