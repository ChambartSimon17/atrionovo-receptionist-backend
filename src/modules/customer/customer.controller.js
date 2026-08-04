import customerService from "./customer.service.js";
import {
  createCustomerSchema,
  findCustomerSchema,
} from "./customer.validator.js";

// ======================================================
// Customer Controller
// ======================================================
//
// Responsibility
// Handle HTTP requests related to customers.
//
// Responsibilities
// - Validate incoming requests
// - Delegate business logic to the service
// - Return HTTP responses
//
// This controller contains no business logic.
// ======================================================

class CustomerController {
  /**
   * Creates a new customer.
   */
  async createCustomer(request, reply) {
    const customer =
      createCustomerSchema.parse(request.body);

    const createdCustomer =
      await customerService.createCustomer(
        customer
      );

    return reply.status(201).send({
      success: true,
      data: createdCustomer,
    });
  }

  /**
   * Finds a customer by phone number.
   */
  async findCustomer(request, reply) {
    const search =
      findCustomerSchema.parse(request.query);

    const customer =
      await customerService.findByPhoneNumber(
        search
      );

    return reply.send({
      success: true,
      data: customer,
    });
  }

  /**
   * Updates an existing customer.
   */
  async updateCustomer(request, reply) {
    const { id } = request.params;

    const customer =
      createCustomerSchema.parse(request.body);

    const updatedCustomer =
      await customerService.updateCustomer(
        id,
        customer
      );

    return reply.send({
      success: true,
      data: updatedCustomer,
    });
  }

  /**
   * Deletes an existing customer.
   */
  async deleteCustomer(request, reply) {
    const { id } = request.params;

    await customerService.deleteCustomer(id);

    return reply.status(204).send();
  }
}

export default new CustomerController();