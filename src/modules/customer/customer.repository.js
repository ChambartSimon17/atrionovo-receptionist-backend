import prisma from "../../db/prisma.js";

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
   * Retrieves a customer by id.
   */
  async findById(
    id,
    db = prisma
  ) {
    return db.customer.findUnique({
      where: {
        id,
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
   * Updates a customer.
   */
  async update(
    id,
    data,
    db = prisma
  ) {
    return db.customer.update({
      where: {
        id,
      },
      data,
    });
  }

  /**
   * Deletes a customer.
   */
  async delete(
    id,
    db = prisma
  ) {
    return db.customer.delete({
      where: {
        id,
      },
    });
  }
}

export default new CustomerRepository();