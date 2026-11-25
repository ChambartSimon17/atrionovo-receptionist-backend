// Live customers (vapi/customers.json): the demo and Vapi scripts
// never change their number, assistant or business, unless the
// customer is named on purpose with --customer=<businessId>.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT as ROOT } from "../../src/modules/vapi/vapi-config.js";

export const CUSTOMERS = JSON.parse(
  readFileSync(join(ROOT, "vapi/customers.json"), "utf8")
).customers;

const digits = (value) => String(value ?? "").replace(/[^\d+]/g, "");

/**
 * The customer a business id, Vapi number id, phone number or
 * assistant id belongs to, or null.
 */
export function customerFor(value) {
  if (!value) return null;
  return (
    CUSTOMERS.find(
      (c) =>
        value === c.businessId ||
        value === c.vapiPhoneNumberId ||
        value === c.assistantId ||
        (digits(value).length > 6 && digits(value) === digits(c.phoneNumber))
    ) ?? null
  );
}

/**
 * Throws when value belongs to a live customer, unless that
 * customer is named in allowed (--customer=<businessId>).
 */
export function refuseCustomer(value, what, allowed = null) {
  const customer = customerFor(value);
  if (customer && allowed !== customer.businessId) {
    throw new Error(
      `${what} hoort bij klant ${customer.name} (vapi/customers.json). Dit script raakt klanten niet aan. Bewust toch: --customer=${customer.businessId}`
    );
  }
  return customer;
}
