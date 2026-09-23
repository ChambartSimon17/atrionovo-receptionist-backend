import { z } from "zod";

// ======================================================
// Create Customer
// ======================================================
//
// Used when a new customer is created.
//
// restaurantId is required here because this schema
// is also used by internal customer flows such as
// reservation synchronization.
// ======================================================

export const createCustomerSchema = z.object({
  restaurantId: z.string().min(1),
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
// restaurantId is intentionally NOT accepted here.
// Dashboard requests derive the restaurant from the
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
// restaurantId remains part of this schema because
// this endpoint is currently used by the receptionist
// flow rather than the authenticated dashboard.
// ======================================================

export const findCustomerSchema = z.object({
  restaurantId: z.string().min(1),
  phoneNumber: z.string().min(1),
});

// ======================================================
// Caller Profile
// ======================================================
//
// Used by VAPI/receptionist flows to retrieve the
// customer profile and upcoming reservations.
// ======================================================

export const callerProfileSchema = z.object({
  restaurantId: z.string().min(1),
  phoneNumber: z.string().min(1),
});