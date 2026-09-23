import restaurantRepository from "../restaurant/restaurant.repository.js";
import customerRepository from "./customer.repository.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import { normalizePhoneNumber } from "../../utils/phone.utils.js";
import { normalizeEmail } from "../../utils/email.utils.js";

// ======================================================
// Customer Service
// ======================================================
//
// Responsibility
// Manage restaurant customers.
//
// Business Rules
// - Restaurant must exist
// - Phone numbers are unique per restaurant
// - Phone numbers are normalized
// - Emails are normalized
//
// Dashboard Security
// - Dashboard customer operations are scoped to the
//   authenticated restaurant.
//
// Receptionist / VAPI
// - syncCustomer(), findByPhoneNumber() and
//   getCallerProfile() continue to support the
//   restaurant context supplied by the receptionist flow.
//
// Transaction Support
// - Database operations can receive a Prisma client.
// - This allows customer operations to participate
//   in larger transactions.
// ======================================================

class CustomerService {
  /**
   * Creates a new customer.
   */
  async createCustomer(customerData, db) {
    await this.#ensureRestaurantExists(
      customerData.restaurantId,
      db
    );

    const normalizedCustomer = {
      ...customerData,
      phoneNumber: normalizePhoneNumber(
        customerData.phoneNumber
      ),
      email: normalizeEmail(
        customerData.email
      ),
    };

    const existingCustomer =
      await customerRepository.findByPhoneNumber(
        normalizedCustomer.restaurantId,
        normalizedCustomer.phoneNumber,
        db
      );

    if (existingCustomer) {
      throw new ValidationError(
        "A customer with this phone number already exists."
      );
    }

    return customerRepository.create(
      normalizedCustomer,
      db
    );
  }

  /**
   * Synchronizes customer information.
   *
   * Used by reservation/receptionist flows.
   *
   * If the customer already exists, the latest
   * information is stored.
   *
   * Otherwise a new customer is created.
   *
   * The optional Prisma client allows this operation
   * to participate in a larger transaction.
   */
  async syncCustomer(customerData, db) {
    await this.#ensureRestaurantExists(
      customerData.restaurantId,
      db
    );

    const normalizedCustomer = {
      ...customerData,
      phoneNumber: normalizePhoneNumber(
        customerData.phoneNumber
      ),
      email: normalizeEmail(
        customerData.email
      ),
    };

    const existingCustomer =
      await customerRepository.findByPhoneNumber(
        normalizedCustomer.restaurantId,
        normalizedCustomer.phoneNumber,
        db
      );

    if (!existingCustomer) {
      return customerRepository.create(
        normalizedCustomer,
        db
      );
    }

    const updatedCustomer = {
      firstName: normalizedCustomer.firstName,
      lastName: normalizedCustomer.lastName,
      phoneNumber: normalizedCustomer.phoneNumber,
    };

    if (
      normalizedCustomer.email !== undefined
    ) {
      updatedCustomer.email =
        normalizedCustomer.email;
    }

    return customerRepository.update(
      existingCustomer.id,
      normalizedCustomer.restaurantId,
      updatedCustomer,
      db
    );
  }

  /**
   * Updates an existing customer.
   *
   * Restaurant context comes from the authenticated
   * dashboard user.
   *
   * Only supplied fields are updated.
   */
  async updateCustomer(
    id,
    restaurantId,
    customerData,
    db
  ) {
    const existingCustomer =
      await customerRepository.findById(
        id,
        restaurantId,
        db
      );

    if (!existingCustomer) {
      throw new NotFoundError(
        "Customer not found.",
        ErrorCodes.CUSTOMER_NOT_FOUND
      );
    }

    const normalizedCustomer = {
      ...customerData,
    };

    if (
      customerData.phoneNumber !== undefined
    ) {
      normalizedCustomer.phoneNumber =
        normalizePhoneNumber(
          customerData.phoneNumber
        );
    }

    if (
      customerData.email !== undefined
    ) {
      normalizedCustomer.email =
        normalizeEmail(
          customerData.email
        );
    }

    if (
      normalizedCustomer.phoneNumber !==
      undefined
    ) {
      const duplicateCustomer =
        await customerRepository.findByPhoneNumber(
          restaurantId,
          normalizedCustomer.phoneNumber,
          db
        );

      if (
        duplicateCustomer &&
        duplicateCustomer.id !== id
      ) {
        throw new ValidationError(
          "A customer with this phone number already exists."
        );
      }
    }

    const updatedCustomer =
      await customerRepository.update(
        id,
        restaurantId,
        normalizedCustomer,
        db
      );

    if (!updatedCustomer) {
      throw new NotFoundError(
        "Customer not found.",
        ErrorCodes.CUSTOMER_NOT_FOUND
      );
    }

    return updatedCustomer;
  }

  /**
   * Deletes a customer.
   *
   * Restaurant context comes from the authenticated
   * dashboard user.
   */
  async deleteCustomer(
    id,
    restaurantId,
    db
  ) {
    const customer =
      await customerRepository.findById(
        id,
        restaurantId,
        db
      );

    if (!customer) {
      throw new NotFoundError(
        "Customer not found.",
        ErrorCodes.CUSTOMER_NOT_FOUND
      );
    }

    await customerRepository.delete(
      id,
      restaurantId,
      db
    );
  }

  /**
   * Retrieves all customers belonging to a restaurant.
   *
   * The restaurant is determined by the authenticated
   * dashboard user.
   */
  async getCustomers(
    restaurantId,
    db
  ) {
    await this.#ensureRestaurantExists(
      restaurantId,
      db
    );

    return customerRepository.findAllForRestaurant(
      restaurantId,
      db
    );
  }

  /**
   * Retrieves a customer together with their
   * reservation history.
   *
   * The restaurant context comes from the
   * authenticated dashboard user.
   */
  async getCustomer(
    id,
    restaurantId,
    db
  ) {
    const customer =
      await customerRepository.findByIdWithReservations(
        id,
        restaurantId,
        db
      );

    if (!customer) {
      throw new NotFoundError(
        "Customer not found.",
        ErrorCodes.CUSTOMER_NOT_FOUND
      );
    }

    const {
      reservations,
      ...customerData
    } = customer;

    return {
      customer: customerData,
      reservations,
    };
  }

  /**
   * Finds a customer by phone number.
   *
   * Used by receptionist/VAPI flows.
   */
  async findByPhoneNumber({
    restaurantId,
    phoneNumber,
  }, db) {
    await this.#ensureRestaurantExists(
      restaurantId,
      db
    );

    return customerRepository.findByPhoneNumber(
      restaurantId,
      normalizePhoneNumber(phoneNumber),
      db
    );
  }

  /**
   * Retrieves the caller profile together with
   * upcoming reservations.
   *
   * Used by receptionist/VAPI flows.
   */
  async getCallerProfile({
    restaurantId,
    phoneNumber,
  }, db) {
    await this.#ensureRestaurantExists(
      restaurantId,
      db
    );

    const customer =
      await customerRepository.findProfileByPhoneNumber(
        restaurantId,
        normalizePhoneNumber(phoneNumber),
        db
      );

    if (!customer) {
      return {
        customer: null,
        upcomingReservations: [],
      };
    }

    const {
      reservations,
      ...customerData
    } = customer;

    return {
      customer: customerData,
      upcomingReservations: reservations,
    };
  }

  /**
   * Ensures the restaurant exists.
   */
  async #ensureRestaurantExists(
    restaurantId,
    db
  ) {
    const restaurant =
      await restaurantRepository.findById(
        restaurantId,
        db
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }
  }
}

export default new CustomerService();