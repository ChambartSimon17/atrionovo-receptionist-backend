import { z } from "zod";

// ======================================================
// Create Customer
// ======================================================
//
// Used when a new customer is created.
//
// businessId is required here because this schema
// is also used by internal customer flows such as
// reservation synchronization.
// ======================================================

export const createCustomerSchema = z.object({
  businessId: z.string().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phoneNumber: z.string().min(1),
  email: z.email().optional(),
  notes: z.string().optional(),
  isVip: z.boolean().optional(),
});

// ======================================================
// Update Customer
// ======================================================
//
// Used for partial customer updates.
//
// businessId is intentionally NOT accepted here.
// Dashboard requests derive the business from the
// authenticated user instead.
//
// Every field is optional because this schema is used
// by PATCH.
// ======================================================

export const updateCustomerSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  phoneNumber: z.string().min(1).optional(),
  email: z.email().optional(),
  notes: z.string().optional(),
  isVip: z.boolean().optional(),
});

// ======================================================
// Find Customer
// ======================================================
//
// Used by receptionist/VAPI lookup.
//
// businessId remains part of this schema because
// this endpoint is currently used by the receptionist
// flow rather than the authenticated dashboard.
// ======================================================

export const findCustomerSchema = z.object({
  businessId: z.string().min(1),
  phoneNumber: z.string().min(1),
});

// ======================================================
// Search Customers By Name
// ======================================================
//
// Used by the authenticated dashboard.
//
// Searches customers belonging to the authenticated
// business by first name and/or last name.
// ======================================================

export const searchCustomersSchema = z.object({
  query: z.string().trim().min(1),
});

// ======================================================
// Caller Profile
// ======================================================
//
// Used by VAPI/receptionist flows to retrieve the
// customer profile and upcoming reservations.
// ======================================================

export const callerProfileSchema = z.object({
  businessId: z.string().min(1),
  phoneNumber: z.string().min(1),
});