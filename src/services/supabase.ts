import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import type { TrackedBusiness, ReviewScan, GoogleReview } from "../types.js";

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseKey);
  }
  return client;
}

export async function listTrackedBusinesses(): Promise<TrackedBusiness[]> {
  const { data, error } = await db()
    .from("tracked_businesses")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Supabase error listing businesses: ${error.message}`);
  return data as TrackedBusiness[];
}

export async function getTrackedBusinessByLabel(
  label: string
): Promise<TrackedBusiness | null> {
  const { data, error } = await db()
    .from("tracked_businesses")
    .select("*")
    .eq("label", label)
    .maybeSingle();
  if (error) throw new Error(`Supabase error fetching business '${label}': ${error.message}`);
  return data as TrackedBusiness | null;
}

export async function upsertTrackedBusiness(params: {
  label: string;
  search_query: string;
  place_id?: string | null;
}): Promise<TrackedBusiness> {
  const { data, error } = await db()
    .from("tracked_businesses")
    .upsert(
      {
        label: params.label,
        search_query: params.search_query,
        ...(params.place_id ? { place_id: params.place_id } : {}),
      },
      { onConflict: "label" }
    )
    .select("*")
    .single();
  if (error) throw new Error(`Supabase error upserting business '${params.label}': ${error.message}`);
  return data as TrackedBusiness;
}

export async function updateBusinessPlaceId(
  businessId: string,
  placeId: string
): Promise<void> {
  const { error } = await db()
    .from("tracked_businesses")
    .update({ place_id: placeId })
    .eq("id", businessId);
  if (error) throw new Error(`Supabase error updating place_id: ${error.message}`);
}

export async function recordScan(params: {
  business_id: string;
  rating: number | null;
  user_ratings_total: number | null;
  reviews: GoogleReview[];
  raw_response: unknown;
}): Promise<ReviewScan> {
  const { data, error } = await db()
    .from("review_scans")
    .insert({
      business_id: params.business_id,
      rating: params.rating,
      user_ratings_total: params.user_ratings_total,
      reviews: params.reviews,
      raw_response: params.raw_response,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Supabase error recording scan: ${error.message}`);
  return data as ReviewScan;
}

export async function listScans(
  businessId: string,
  limit = 30
): Promise<ReviewScan[]> {
  const { data, error } = await db()
    .from("review_scans")
    .select("*")
    .eq("business_id", businessId)
    .order("scanned_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Supabase error listing scans: ${error.message}`);
  return data as ReviewScan[];
}

export async function getLatestScan(businessId: string): Promise<ReviewScan | null> {
  const { data, error } = await db()
    .from("review_scans")
    .select("*")
    .eq("business_id", businessId)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Supabase error fetching latest scan: ${error.message}`);
  return data as ReviewScan | null;
}
