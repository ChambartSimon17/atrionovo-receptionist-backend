import customerService from "./customer.service.js";
import {
  createCustomerSchema,
  findCustomerSchema,
  callerProfileSchema,
  updateCustomerSchema,
  searchCustomersSchema,
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
// - Extract authenticated restaurant context
// - Delegate business logic to the service
// - Return HTTP responses
//
// This controller contains no business logic.
//
// Authentication
// Dashboard customer-management endpoints derive
// restaurantId from request.user rather than from the
// request body.
//
// Receptionist/VAPI endpoints keep their existing
// restaurantId-based request format.
// ======================================================

class CustomerController {
  /**
   * Creates a new customer.
   *
   * Used by internal/customer flows that explicitly
   * provide the restaurant context.
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
   *
   * Used by receptionist/VAPI flows.
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
   * Retrieves the caller profile together with
   * upcoming reservations.
   *
   * Used by receptionist/VAPI flows.
   */
  async getCallerProfile(request, reply) {
    const query =
      callerProfileSchema.parse(
        request.query
      );

    const profile =
      await customerService.getCallerProfile(
        query
      );

    return reply.send({
      success: true,
      data: profile,
    });
  }

  /**
   * Retrieves all customers belonging to the
   * authenticated restaurant.
   */
  async getCustomers(request, reply) {
    const customers =
      await customerService.getCustomers(
        request.user.restaurantId
      );

    return reply.send({
      success: true,
      data: customers,
    });
  }

  /**
   * Searches customers by name.
   *
   * Restaurant context comes from the
   * authenticated dashboard user.
   */
  async searchCustomers(request, reply) {
    const query =
      searchCustomersSchema.parse(
        request.query
      );

    const customers =
      await customerService.searchCustomers(
        request.user.restaurantId,
        query.query
      );

    return reply.send({
      success: true,
      data: customers,
    });
  }

  /**
   * Retrieves a customer together with their
   * reservation history.
   */
  async getCustomer(request, reply) {
    const { id } = request.params;

    const result =
      await customerService.getCustomer(
        id,
        request.user.restaurantId
      );

    return reply.send({
      success: true,
      data: result,
    });
  }

  /**
   * Updates an existing customer.
   *
   * Restaurant context is taken from the
   * authenticated user.
   */
  async updateCustomer(request, reply) {
    const { id } = request.params;

    const customer =
      updateCustomerSchema.parse(
        request.body
      );

    const updatedCustomer =
      await customerService.updateCustomer(
        id,
        request.user.restaurantId,
        customer
      );

    return reply.send({
      success: true,
      data: updatedCustomer,
    });
  }

  /**
   * Deletes an existing customer.
   *
   * Restaurant context is taken from the
   * authenticated user.
   */
  async deleteCustomer(request, reply) {
    const { id } = request.params;

    await customerService.deleteCustomer(
      id,
      request.user.restaurantId
    );

    return reply.status(204).send();
  }
}

export default new CustomerController();