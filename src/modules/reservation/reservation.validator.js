import { z } from "zod";

export const createReservationSchema = z.object({
  restaurantId: z.string().min(1),

  firstName: z.string().min(1),

  lastName: z.string().min(1),

  phoneNumber: z.string().min(1),

  email: z.email().optional(),

  guestCount: z.number().int().positive(),

  startTime: z.iso.datetime(),

  notes: z.string().optional(),
});

export const rescheduleReservationSchema = z.object({
  startTime: z.iso.datetime(),
});

export const checkAvailabilitySchema = z.object({

  guestCount: z.number().int().positive(),

  startTime: z.iso.datetime(),

  endTime: z.iso.datetime(),
});

export const findUpcomingReservationsSchema = z
  .object({
    restaurantId: z.string().min(1),

    phoneNumber: z.string().optional(),

    email: z.email().optional(),

    lastName: z.string().optional(),
  })
  .refine(
    (data) =>
      data.phoneNumber ||
      data.email ||
      data.lastName,
    {
      message:
        "Provide at least one search parameter.",
    }
  );

  export const updateReservationSchema = z.object({
  restaurantId: z.string().min(1),

  firstName: z.string().min(1),

  lastName: z.string().min(1),

  phoneNumber: z.string().min(1),

  email: z.email().optional(),

  guestCount: z.number().int().positive(),

  startTime: z.iso.datetime(),

  notes: z.string().optional(),
});