import axios, { AxiosError } from "axios";
import { config } from "../config.js";
import type { PlaceDetailsResult } from "../types.js";

const PLACES_BASE_URL = "https://maps.googleapis.com/maps/api/place";

export function handlePlacesApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      return `Error: Google Places API request failed with status ${error.response.status}: ${JSON.stringify(
        error.response.data
      )}`;
    } else if (error.code === "ECONNABORTED") {
      return "Error: Request to Google Places API timed out. Please try again.";
    }
  }
  return `Error: Unexpected error calling Google Places API: ${
    error instanceof Error ? error.message : String(error)
  }`;
}

/**
 * Resolves a free-text business query (name + address) to a Google Place ID
 * using the Find Place From Text endpoint.
 */
export async function findPlaceId(searchQuery: string): Promise<string | null> {
  const response = await axios.get(`${PLACES_BASE_URL}/findplacefromtext/json`, {
    params: {
      input: searchQuery,
      inputtype: "textquery",
      fields: "place_id,name,formatted_address",
      key: config.googlePlacesApiKey,
    },
    timeout: 15000,
  });

  const data = response.data;
  if (data.status !== "OK" || !data.candidates?.length) {
    return null;
  }
  return data.candidates[0].place_id as string;
}

/**
 * Fetches current rating, review count, and up to 5 most relevant reviews
 * (this is the maximum the Places API returns per call) for a given Place ID.
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetailsResult> {
  const response = await axios.get(`${PLACES_BASE_URL}/details/json`, {
    params: {
      place_id: placeId,
      fields:
        "place_id,name,rating,user_ratings_total,reviews,formatted_address,formatted_phone_number,url",
      key: config.googlePlacesApiKey,
    },
    timeout: 15000,
  });

  const data = response.data;
  if (data.status !== "OK") {
    throw new Error(
      `Google Places Details API returned status '${data.status}': ${
        data.error_message || "no further detail"
      }`
    );
  }
  return data.result as PlaceDetailsResult;
}
