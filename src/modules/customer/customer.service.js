import restaurantRepository from "../restaurant/restaurant.repository.js";
import customerRepository from "./customer.repository.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
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
// ======================================================

class CustomerService {
  /**
   * Creates a new customer.
   */
  async createCustomer(customerData) {
    await this.#ensureRestaurantExists(
      customerData.restaurantId
    );

    const normalizedCustomer = {
      ...customerData,
      phoneNumber: normalizePhoneNumber(
        customerData.phoneNumber
      ),
      email: normalizeEmail(customerData.email),
    };

    const existingCustomer =
      await customerRepository.findByPhoneNumber(
        normalizedCustomer.restaurantId,
        normalizedCustomer.phoneNumber
      );

    if (existingCustomer) {
      throw new ValidationError(
        "A customer with this phone number already exists."
      );
    }

    return customerRepository.create(
      normalizedCustomer
    );
  }

  /**
   * Synchronizes customer information.
   *
   * If the customer already exists, the latest
   * information is stored.
   *
   * Otherwise a new customer is created.
   */
  async syncCustomer(customerData) {
    await this.#ensureRestaurantExists(
      customerData.restaurantId
    );

    const normalizedCustomer = {
      ...customerData,
      phoneNumber: normalizePhoneNumber(
        customerData.phoneNumber
      ),
      email: normalizeEmail(customerData.email),
    };

    const existingCustomer =
      await customerRepository.findByPhoneNumber(
        normalizedCustomer.restaurantId,
        normalizedCustomer.phoneNumber
      );

    if (!existingCustomer) {
      return customerRepository.create(
        normalizedCustomer
      );
    }

    const updatedCustomer = {
      firstName: normalizedCustomer.firstName,
      lastName: normalizedCustomer.lastName,
      phoneNumber: normalizedCustomer.phoneNumber,
    };

    if (normalizedCustomer.email !== undefined) {
      updatedCustomer.email =
        normalizedCustomer.email;
    }

    return customerRepository.update(
      existingCustomer.id,
      updatedCustomer
    );
  }

  /**
   * Updates an existing customer.
   */
  async updateCustomer(id, customerData) {
    const existingCustomer =
      await customerRepository.findById(id);

    if (!existingCustomer) {
      throw new NotFoundError(
        "Customer not found.",
        ErrorCodes.CUSTOMER_NOT_FOUND
      );
    }

    const normalizedCustomer = {
      ...customerData,
      phoneNumber: normalizePhoneNumber(
        customerData.phoneNumber
      ),
      email: normalizeEmail(customerData.email),
    };

    const duplicateCustomer =
      await customerRepository.findByPhoneNumber(
        normalizedCustomer.restaurantId,
        normalizedCustomer.phoneNumber
      );

    if (
      duplicateCustomer &&
      duplicateCustomer.id !== id
    ) {
      throw new ValidationError(
        "A customer with this phone number already exists."
      );
    }

    return customerRepository.update(
      id,
      normalizedCustomer
    );
  }

  /**
   * Deletes a customer.
   */
  async deleteCustomer(id) {
    const customer =
      await customerRepository.findById(id);

    if (!customer) {
      throw new NotFoundError(
        "Customer not found.",
        ErrorCodes.CUSTOMER_NOT_FOUND
      );
    }

    await customerRepository.delete(id);
  }

  /**
   * Finds a customer by phone number.
   */
  async findByPhoneNumber({
    restaurantId,
    phoneNumber,
  }) {
    await this.#ensureRestaurantExists(
      restaurantId
    );

    return customerRepository.findByPhoneNumber(
      restaurantId,
      normalizePhoneNumber(phoneNumber)
    );
  }

  /**
   * Retrieves the caller profile together with
   * upcoming reservations.
   */
  async getCallerProfile({
    restaurantId,
    phoneNumber,
  }) {
    await this.#ensureRestaurantExists(
      restaurantId
    );

    const customer =
      await customerRepository.findProfileByPhoneNumber(
        restaurantId,
        normalizePhoneNumber(phoneNumber)
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
    restaurantId
  ) {
    const restaurant =
      await restaurantRepository.findById(
        restaurantId
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