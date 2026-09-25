import {
  getTrackedBusinessByLabel,
  updateBusinessPlaceId,
  recordScan,
  getLatestScan,
  listScans,
} from "./supabase.js";
import { findPlaceId, getPlaceDetails } from "./googlePlaces.js";
import type { ReviewScan, TrackedBusiness } from "../types.js";

export class BusinessNotFoundError extends Error {
  constructor(label: string) {
    super(
      `No tracked business with label '${label}'. Add it to the tracked_businesses table first.`
    );
    this.name = "BusinessNotFoundError";
  }
}

export class PlaceNotResolvedError extends Error {
  constructor(searchQuery: string) {
    super(
      `Could not resolve a Google Place ID for search query '${searchQuery}'. Check the business name/address, and confirm GOOGLE_PLACES_API_KEY has the Places API enabled.`
    );
    this.name = "PlaceNotResolvedError";
  }
}

/**
 * Runs one full scan for a tracked business: resolves its Place ID if not
 * already known, pulls current rating/review data from Google Places, and
 * persists the result as a new row in review_scans.
 */
export async function runScanForLabel(label: string): Promise<{
  business: TrackedBusiness;
  scan: ReviewScan;
}> {
  const business = await getTrackedBusinessByLabel(label);
  if (!business) {
    throw new BusinessNotFoundError(label);
  }

  let placeId = business.place_id;
  if (!placeId) {
    placeId = await findPlaceId(business.search_query);
    if (!placeId) {
      throw new PlaceNotResolvedError(business.search_query);
    }
    await updateBusinessPlaceId(business.id, placeId);
  }

  const details = await getPlaceDetails(placeId);

  const scan = await recordScan({
    business_id: business.id,
    rating: details.rating ?? null,
    user_ratings_total: details.user_ratings_total ?? null,
    reviews: details.reviews ?? [],
    raw_response: details,
  });

  return { business: { ...business, place_id: placeId }, scan };
}

export async function getLatestScanForLabel(
  label: string
): Promise<{ business: TrackedBusiness; scan: ReviewScan | null }> {
  const business = await getTrackedBusinessByLabel(label);
  if (!business) {
    throw new BusinessNotFoundError(label);
  }
  const scan = await getLatestScan(business.id);
  return { business, scan };
}

export async function getScanHistoryForLabel(
  label: string,
  limit = 30
): Promise<{ business: TrackedBusiness; scans: ReviewScan[] }> {
  const business = await getTrackedBusinessByLabel(label);
  if (!business) {
    throw new BusinessNotFoundError(label);
  }
  const scans = await listScans(business.id, limit);
  return { business, scans };
}
