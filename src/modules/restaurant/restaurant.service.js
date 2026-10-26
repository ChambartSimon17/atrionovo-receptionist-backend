import restaurantRepository from "../restaurant/restaurant.repository.js";
import ConflictError from "../../errors/ConflictError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import { env } from "../../config/env.js";

const DISABLED_MESSAGE =
  "Bedankt voor uw telefoontje. We kunnen momenteel niet opnemen. Gelieve het later opnieuw te proberen. Bedankt voor uw begrip.";

class RestaurantService {
  /**
   * Creates a new restaurant.
   */
  async createRestaurant({
    name,
    slug,
    maxCapacity,
    timezone,
    language,
  }) {
    const existingRestaurant =
      await restaurantRepository.findBySlug(slug);

    if (existingRestaurant) {
      throw new ConflictError(
        "Restaurant slug already exists"
      );
    }

    return restaurantRepository.create({
      name,
      slug,
      maxCapacity,
      timezone,
      language,
    });
  }

  /**
   * Retrieves a restaurant by ID.
   */
  async findById(id) {
    const restaurant =
      await restaurantRepository.findById(id);

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    return restaurant;
  }

  /**
   * Retrieves the restaurant belonging to
   * the authenticated user.
   */
  async findForUser(restaurantId) {
    return this.findById(restaurantId);
  }

  async setVapiVoiceAgentEnabled(enabled) {
    if (!env.vapiApiKey || !env.vapiPhoneNumberId) {
      throw new Error(
        "Vapi API key or phone number ID is not configured."
      );
    }

    const hooks = enabled
      ? []
      : [
          {
            on: "call.ringing",
            do: [
              {
                type: "say",
                exact: DISABLED_MESSAGE,
              },
            ],
          },
        ];

    const response = await fetch(
      `https://api.vapi.ai/phone-number/${env.vapiPhoneNumberId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${env.vapiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ hooks }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        "Vapi phone number update failed:",
        response.status,
        errorText
      );

      throw new Error(
        "Could not update the Vapi phone number configuration."
      );
    }
  }

  async updateForUser(restaurantId, restaurantData) {
    await this.findById(restaurantId);

    if (
      Object.hasOwn(restaurantData, "voiceAgentEnabled")
    ) {
      await this.setVapiVoiceAgentEnabled(
        restaurantData.voiceAgentEnabled
      );
    }

    return restaurantRepository.update(
      restaurantId,
      restaurantData
    );
  }
}

export default new RestaurantService();