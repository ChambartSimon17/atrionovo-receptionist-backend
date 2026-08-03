import { parsePhoneNumberFromString } from "libphonenumber-js";

import ValidationError from "../errors/ValidationError.js";

/**
 * Normalizes a phone number into E.164 format.
 *
 * Example:
 * 0470 12 34 56   -> +32470123456
 * +32 470 12 34 56 -> +32470123456
 */
export function normalizePhoneNumber(
  phoneNumber,
  defaultCountry = "BE"
) {
  const parsedPhoneNumber =
    parsePhoneNumberFromString(
      phoneNumber,
      defaultCountry
    );

  if (!parsedPhoneNumber?.isValid()) {
    throw new ValidationError(
      "Invalid phone number."
    );
  }

  return parsedPhoneNumber.number;
}