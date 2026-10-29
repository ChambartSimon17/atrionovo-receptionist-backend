import businessRepository from "../business/business.repository.js";
import ConflictError from "../../errors/ConflictError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import { env } from "../../config/env.js";

const DISABLED_MESSAGE =
  "Bedankt voor uw telefoontje. We kunnen momenteel niet opnemen. Gelieve het later opnieuw te proberen. Bedankt voor uw begrip.";

class BusinessService {
  /**
   * Creates a new business.
   */
  async createBusiness({
    name,
    slug,
    maxCapacity,
    timezone,
    language,
  }) {
    const existingBusiness =
      await businessRepository.findBySlug(slug);

    if (existingBusiness) {
      throw new ConflictError(
        "Business slug already exists"
      );
    }

    return businessRepository.create({
      name,
      slug,
      maxCapacity,
      timezone,
      language,
    });
  }

  /**
   * Retrieves a business by ID.
   */
  async findById(id) {
    const business =
      await businessRepository.findById(id);

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    return business;
  }

  /**
   * Retrieves the business belonging to
   * the authenticated user.
   */
  async findForUser(businessId) {
    return this.findById(businessId);
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

  async updateForUser(businessId, businessData) {
    await this.findById(businessId);

    if (
      Object.hasOwn(businessData, "voiceAgentEnabled")
    ) {
      await this.setVapiVoiceAgentEnabled(
        businessData.voiceAgentEnabled
      );
    }

    return businessRepository.update(
      businessId,
      businessData
    );
  }
}

export default new BusinessService();