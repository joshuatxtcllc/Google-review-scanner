export interface TrackedBusiness {
  id: string;
  label: string;
  place_id: string | null;
  search_query: string;
  created_at: string;
}

export interface GoogleReview {
  author_name: string;
  rating: number;
  relative_time_description: string;
  text: string;
  time: number; // unix seconds
}

export interface ReviewScan {
  id: string;
  business_id: string;
  scanned_at: string;
  rating: number | null;
  user_ratings_total: number | null;
  reviews: GoogleReview[];
  created_at: string;
}

export interface PlaceDetailsResult {
  place_id: string;
  name: string;
  rating?: number;
  user_ratings_total?: number;
  reviews?: GoogleReview[];
  formatted_address?: string;
  formatted_phone_number?: string;
  url?: string; // Google Maps URL
}
