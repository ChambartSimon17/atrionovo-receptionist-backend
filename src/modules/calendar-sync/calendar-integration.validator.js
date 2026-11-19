import { z } from "zod";

// ======================================================
// Calendar Integration Validation
// ======================================================

const travelMinutes = z.number().int().min(0).max(240);

// null: busy for the whole business.
const therapistId = z.string().min(1).max(100).nullable();

export const connectIcloudSchema = z.object({
  username: z.string().trim().min(3).max(200),

  // Apple shows app-specific passwords as xxxx-xxxx-xxxx-xxxx.
  password: z.string().trim().min(8).max(100),
});

export const saveIcloudCalendarsSchema = z.object({
  calendars: z
    .array(
      z.object({
        remoteUrl: z.url().max(500),
        read: z.boolean(),
        travelMinutes: travelMinutes.optional(),
        therapistId: therapistId.optional(),
      })
    )
    .max(50),

  writeUrl: z.url().max(500).nullable(),
});

export const connectIcsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().trim().min(10).max(2000),
  travelMinutes: travelMinutes.optional(),
  therapistId: therapistId.optional(),
});

export const updateCalendarSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    travelMinutes: travelMinutes.optional(),
    isActive: z.boolean().optional(),
    therapistId: therapistId.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to change.",
  });
