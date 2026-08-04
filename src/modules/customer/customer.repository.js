import prisma from "../../db/prisma.js";

class CustomerRepository {
  /**
   * Creates a customer.
   */
  async create(data) {
    return prisma.customer.create({
      data,
    });
  }

  /**
   * Retrieves a customer by id.
   */
  async findById(id) {
    return prisma.customer.findUnique({
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
    phoneNumber
  ) {
    return prisma.customer.findUnique({
      where: {
        restaurantId_phoneNumber: {
          restaurantId,
          phoneNumber,
        },
      },
    });
  }

  /**
   * Retrieves a customer by email.
   */
  async findByEmail(
    restaurantId,
    email
  ) {
    return prisma.customer.findFirst({
      where: {
        restaurantId,
        email,
      },
    });
  }

  /**
   * Updates a customer.
   */
  async update(id, data) {
    return prisma.customer.update({
      where: {
        id,
      },
      data,
    });
  }

  /**
   * Deletes a customer.
   */
  async delete(id) {
    return prisma.customer.delete({
      where: {
        id,
      },
    });
  }
}

export default new CustomerRepository();