// ======================================================
// Legacy Restaurant Compatibility
// ======================================================
//
// Responsibility
// Keep clients that still speak the pre-rename API working.
//
// The API used to call a business a "restaurant". Some clients
// cannot be updated at the same moment as the backend:
//
// - The Vapi assistant sends the x-restaurant-id header.
//   Its tool configuration lives outside this repository.
//
// - Mobile app builds installed before the rename send
//   restaurantId / restaurantName in request bodies, call
//   /restaurants/... and read "restaurant" from the auth
//   responses.
//
// What this file does
//
// - Request header      x-restaurant-id -> x-business-id
// - Request body/query  restaurantId    -> businessId
// - Request body        restaurantName  -> businessName
// - Auth responses  also contain "restaurant" (same object
//   as "business")
//
// The legacy /restaurants URL prefix is registered in app.js
// using LEGACY_RESTAURANT_ROUTE_PREFIX.
//
// This file is temporary. Delete it (and the legacy block in
// app.js) once the Vapi tools and every installed app build
// use the business names.
// ======================================================

export const LEGACY_RESTAURANT_ROUTE_PREFIX = "/restaurants";

const LEGACY_FIELDS = {
  restaurantId: "businessId",
  restaurantName: "businessName",
};

/**
 * Moves legacy field names of a body or query object to
 * their new names.
 */
function aliasLegacyFields(fields) {
  if (
    !fields ||
    typeof fields !== "object" ||
    Array.isArray(fields)
  ) {
    return;
  }

  for (const [legacyName, currentName] of Object.entries(
    LEGACY_FIELDS
  )) {
    if (fields[legacyName] === undefined) {
      continue;
    }

    if (fields[currentName] === undefined) {
      fields[currentName] = fields[legacyName];
    }

    delete fields[legacyName];
  }
}

/**
 * Copies legacy header, body and query names to their new
 * names so controllers and validators only ever see the new
 * ones.
 */
async function aliasLegacyRequestFields(request) {
  const legacyHeader =
    request.headers["x-restaurant-id"];

  if (
    legacyHeader !== undefined &&
    request.headers["x-business-id"] === undefined
  ) {
    request.headers["x-business-id"] =
      legacyHeader;
  }

  aliasLegacyFields(request.body);
  aliasLegacyFields(request.query);
}

/**
 * Adds the old "restaurant" key next to "business" in auth
 * responses, because older app builds read it after login.
 */
async function aliasLegacyAuthResponse(
  request,
  reply,
  payload
) {
  if (!request.url.startsWith("/auth")) {
    return payload;
  }

  const data = payload?.data;

  if (
    !data ||
    data.business === undefined ||
    data.restaurant !== undefined
  ) {
    return payload;
  }

  return {
    ...payload,
    data: {
      ...data,
      restaurant: data.business,
    },
  };
}

/**
 * Registers the compatibility hooks on the root instance so
 * they apply to every route.
 */
export function registerLegacyRestaurantCompat(app) {
  app.addHook(
    "preValidation",
    aliasLegacyRequestFields
  );

  app.addHook(
    "preSerialization",
    aliasLegacyAuthResponse
  );
}
