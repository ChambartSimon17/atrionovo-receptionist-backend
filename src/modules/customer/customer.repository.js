import prisma from "../../db/prisma.js";

// ======================================================
// Customer Repository
// ======================================================
//
// Responsibility
// Handle database operations related to customers.
//
// Tenant Isolation
// Dashboard customer operations are restaurant-scoped.
// ID-based operations therefore require restaurantId.
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
   * Retrieves a customer by id within a restaurant.
   *
   * Restaurant scoping prevents a customer belonging
   * to another restaurant from being accessed.
   */
  async findById(
    id,
    restaurantId,
    db = prisma
  ) {
    return db.customer.findFirst({
      where: {
        id,
        restaurantId,
      },
    });
  }

  /**
   * Retrieves all customers belonging to a restaurant.
   *
   * Customers are ordered alphabetically by last name,
   * then by first name.
   *
   * Restaurant scoping ensures that customers from
   * other restaurants are never returned.
   */
  async findAllForRestaurant(
    restaurantId,
    db = prisma
  ) {
    return db.customer.findMany({
      where: {
        restaurantId,
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
   * within a restaurant.
   */
  async searchByName(
    restaurantId,
    query,
    db = prisma
  ) {
    return db.customer.findMany({
      where: {
        restaurantId,
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
   * The customer is scoped to the restaurant so
   * customers from another restaurant cannot be accessed.
   *
   * Reservations are ordered from newest to oldest.
   */
  async findByIdWithReservations(
    id,
    restaurantId,
    db = prisma
  ) {
    return db.customer.findFirst({
      where: {
        id,
        restaurantId,
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
    restaurantId,
    phoneNumber,
    db = prisma
  ) {
    return db.customer.findUnique({
      where: {
        restaurantId_phoneNumber: {
          restaurantId,
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
    restaurantId,
    phoneNumber,
    db = prisma
  ) {
    return db.customer.findUnique({
      where: {
        restaurantId_phoneNumber: {
          restaurantId,
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
    restaurantId,
    email,
    db = prisma
  ) {
    return db.customer.findFirst({
      where: {
        restaurantId,
        email,
      },
    });
  }

  /**
   * Updates a customer within a restaurant.
   *
   * Restaurant scoping prevents updates to customers
   * belonging to another restaurant.
   */
  async update(
    id,
    restaurantId,
    data,
    db = prisma
  ) {
    return db.customer.updateMany({
      where: {
        id,
        restaurantId,
      },
      data,
    }).then(async (result) => {
      if (result.count === 0) {
        return null;
      }

      return db.customer.findFirst({
        where: {
          id,
          restaurantId,
        },
      });
    });
  }

  /**
   * Deletes a customer within a restaurant.
   *
   * Restaurant scoping prevents deletion of customers
   * belonging to another restaurant.
   */
  async delete(
    id,
    restaurantId,
    db = prisma
  ) {
    return db.customer.deleteMany({
      where: {
        id,
        restaurantId,
      },
    });
  }
}

export default new CustomerRepository();