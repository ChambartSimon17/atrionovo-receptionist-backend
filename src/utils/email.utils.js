import ValidationError from "../errors/ValidationError.js";

/**
 * Normalizes an email address.
 *
 * Example:
 *  Simon@Example.COM
 *      -> simon@example.com
 */
export function normalizeEmail(email) {
  if (!email) {
    return undefined;
  }

  const normalizedEmail = email
    .trim()
    .toLowerCase();

  if (normalizedEmail.length === 0) {
    throw new ValidationError(
      "Invalid email address."
    );
  }

  return normalizedEmail;
}