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
   * Updates an existing customer.
   */
  async updateCustomer(id, customerData) {
    const existingCustomer =
      await customerRepository.findById(id);

    if (!existingCustomer) {
      throw new NotFoundError(
        "Customer not found."
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
        "Customer not found."
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
        "Restaurant not found."
      );
    }
  }
}

export default new CustomerService();