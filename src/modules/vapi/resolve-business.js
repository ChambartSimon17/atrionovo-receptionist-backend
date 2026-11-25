import prisma from "../../db/prisma.js";
import env from "../../config/env.js";
import { TtlCache } from "./ttl-cache.js";

// ======================================================
// Resolve Business From Call
// ======================================================
//
// Responsibility
// Decide which business a Vapi call belongs to, from the
// Vapi payload only. The assistant (LLM) never passes a
// business id.
//
// Order
// 1. message.call.phoneNumberId (the Vapi number that was
//    called, or that called out) -> Business.vapiPhoneNumberId
// 2. A business id the call was started with, for web
//    demos without a phone number:
//      call.assistantOverrides.variableValues.business_id
//      call.metadata.businessId
//
// The result is a small "call profile" with only what
// assistant-request and the tools need. It stays in memory
// for VAPI_BUSINESS_CACHE_SECONDS (default 2 minutes), so
// one phone call costs at most one database lookup.
// ======================================================

const PROFILE_SELECT = {
  id: true,
  name: true,
  businessType: true,
  timezone: true,
  language: true,
  voiceAgentEnabled: true,
  fallbackPhoneNumber: true,
  transcriberKeyterms: true,
  openingHours: {
    select: {
      dayOfWeek: true,
      opensAtMinutes: true,
      closesAtMinutes: true,
    },
  },
  massageServices: {
    where: { isActive: true },
    select: { name: true },
    orderBy: { name: "asc" },
  },
};

const cache = new TtlCache({
  ttlMs: env.vapiBusinessCacheSeconds * 1000,
});

/**
 * Where a call says it belongs, without a database lookup.
 */
export function callReferences(message) {
  const call = message?.call ?? {};

  const phoneNumberId =
    call.phoneNumberId ??
    message?.phoneNumber?.id ??
    call.phoneNumber?.id ??
    null;

  const variableValues = {
    ...(message?.assistant?.variableValues ?? {}),
    ...(call.assistantOverrides?.variableValues ?? {}),
  };

  const businessId =
    variableValues.business_id ??
    call.metadata?.businessId ??
    call.assistantOverrides?.metadata?.businessId ??
    null;

  return {
    phoneNumberId: phoneNumberId ? String(phoneNumberId) : null,
    businessId: businessId ? String(businessId) : null,
  };
}

/**
 * The caller's phone number: from the phone call, or for a
 * web call the number the page passed as customer_number.
 * Never from the LLM, so a caller cannot act on someone
 * else's appointments.
 */
export function callerNumberOf(message) {
  const call = message?.call ?? {};

  return (
    call.customer?.number ??
    message?.customer?.number ??
    call.assistantOverrides?.variableValues?.customer_number ??
    null
  );
}

function toProfile(row) {
  if (!row) {
    return null;
  }

  const { massageServices, ...rest } = row;

  return {
    ...rest,
    massageServiceNames: massageServices.map((s) => s.name),
  };
}

export async function findBusinessByPhoneNumberId(
  phoneNumberId,
  { db = prisma, useCache = true } = {}
) {
  const key = `phone:${phoneNumberId}`;

  if (useCache) {
    const hit = cache.get(key);

    if (hit !== undefined) {
      return hit;
    }
  }

  const profile = toProfile(
    await db.business.findUnique({
      where: { vapiPhoneNumberId: phoneNumberId },
      select: PROFILE_SELECT,
    })
  );

  // Unknown numbers are cached too (as null), so a
  // misconfigured number does not hit the database on
  // every call.
  cache.set(key, profile);

  return profile;
}

export async function findBusinessById(
  businessId,
  { db = prisma, useCache = true } = {}
) {
  const key = `id:${businessId}`;

  if (useCache) {
    const hit = cache.get(key);

    if (hit !== undefined) {
      return hit;
    }
  }

  const profile = toProfile(
    await db.business.findUnique({
      where: { id: businessId },
      select: PROFILE_SELECT,
    })
  );

  cache.set(key, profile);

  return profile;
}

/**
 * The business of a Vapi call, or null.
 *
 * @returns {Promise<{ business: object|null, via: string|null }>}
 */
export async function resolveBusinessFromCall(message, options = {}) {
  const { phoneNumberId, businessId } = callReferences(message);

  if (phoneNumberId) {
    const business = await findBusinessByPhoneNumberId(
      phoneNumberId,
      options
    );

    if (business) {
      return { business, via: "phoneNumberId" };
    }
  }

  if (businessId) {
    const business = await findBusinessById(businessId, options);

    if (business) {
      return { business, via: "businessId" };
    }
  }

  return { business: null, via: null };
}

/**
 * Last known business of a number, also when expired. For
 * the fallback when the database does not answer.
 */
export function lastKnownBusinessForPhoneNumberId(phoneNumberId) {
  return cache.getStale(`phone:${phoneNumberId}`) ?? null;
}

export function clearBusinessCache() {
  cache.clear();
}
