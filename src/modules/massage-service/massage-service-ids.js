import massageServiceRepository from "./massage-service.repository.js";
import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";

/**
 * Makes sure every id is a massage service of the business.
 * Used when a therapist or room is linked to massages.
 * Returns the ids without duplicates.
 */
export async function assertMassageServicesBelongToBusiness(
  businessId,
  serviceIds
) {
  const uniqueIds = [...new Set(serviceIds)];

  if (uniqueIds.length === 0) {
    return uniqueIds;
  }

  const found =
    await massageServiceRepository.findManyByIds(
      businessId,
      uniqueIds
    );

  if (found.length !== uniqueIds.length) {
    throw new ValidationError(
      "One or more massage services do not exist for this business.",
      ErrorCodes.INVALID_MASSAGE_SERVICES
    );
  }

  return uniqueIds;
}
