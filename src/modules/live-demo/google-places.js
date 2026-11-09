import env from "../../config/env.js";

// ======================================================
// Google Places (New)
// ======================================================
//
// Finds a business by name and fetches its public profile:
// address, rating, opening hours, phone, website, photos.
// The API key stays on the server; photos are returned as
// Google's own image addresses, without the key.
// ======================================================

const BASE = "https://places.googleapis.com/v1";

// Search in the countries AtrioNovo serves first.
const REGIONS = ["be", "nl", "lu", "fr"];

const DETAIL_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "rating",
  "userRatingCount",
  "currentOpeningHours.openNow",
  "regularOpeningHours.weekdayDescriptions",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "primaryType",
  "primaryTypeDisplayName",
  "types",
  "editorialSummary",
  "photos",
].join(",");

const MAX_PHOTOS = 4;

export function placesConfigured() {
  return Boolean(env.googleMapsApiKey);
}

async function google(path, { method = "GET", body, fieldMask, query = {} }) {
  const url = new URL(`${BASE}/${path}`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.googleMapsApiKey,
      ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || `Google Places answered ${response.status}.`);
  }

  return data;
}

/**
 * Suggestions while typing a business name.
 */
export async function autocomplete(input, { language, sessionToken }) {
  const data = await google("places:autocomplete", {
    method: "POST",
    body: {
      input,
      languageCode: language,
      includedRegionCodes: REGIONS,
      includeQueryPredictions: false,
      sessionToken,
    },
  });

  return (data.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter(Boolean)
    .slice(0, 5)
    .map((prediction) => ({
      placeId: prediction.placeId,
      name: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "",
      address: prediction.structuredFormat?.secondaryText?.text ?? "",
    }));
}

async function photoUri(name) {
  const data = await google(`${name}/media`, {
    query: { maxWidthPx: "480", skipHttpRedirect: "true" },
  });

  return data.photoUri ?? null;
}

/**
 * The public profile of one business.
 */
export async function placeDetails(placeId, { language, sessionToken }) {
  if (!/^[\w-]{10,300}$/.test(placeId)) {
    throw new Error("Invalid place id.");
  }

  const place = await google(`places/${placeId}`, {
    fieldMask: DETAIL_FIELDS,
    query: { languageCode: language, regionCode: "be", sessionToken },
  });

  const photos = await Promise.all(
    (place.photos ?? [])
      .slice(0, MAX_PHOTOS)
      .map((photo) => photoUri(photo.name).catch(() => null))
  );

  return {
    placeId: place.id,
    name: place.displayName?.text ?? "",
    address: place.formattedAddress ?? "",
    rating: place.rating ?? null,
    ratingCount: place.userRatingCount ?? 0,
    openNow: place.currentOpeningHours?.openNow ?? null,
    openingHours: place.regularOpeningHours?.weekdayDescriptions ?? [],
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    website: place.websiteUri ?? null,
    primaryType: place.primaryType ?? null,
    typeLabel: place.primaryTypeDisplayName?.text ?? null,
    types: place.types ?? [],
    summary: place.editorialSummary?.text ?? null,
    photos: photos.filter(Boolean),
  };
}
