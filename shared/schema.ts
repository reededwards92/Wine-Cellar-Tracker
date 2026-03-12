export interface User {
  id: number;
  email: string;
  password_hash: string;
  display_name: string | null;
  google_id: string | null;
  created_at: string;
}

export interface Wine {
  id: number;
  ct_wine_id: number | null;
  producer: string;
  wine_name: string;
  vintage: number | null;
  country: string | null;
  region: string | null;
  sub_region: string | null;
  appellation: string | null;
  varietal: string | null;
  color: string | null;
  wine_type: string | null;
  category: string | null;
  designation: string | null;
  vineyard: string | null;
  drink_window_start: number | null;
  drink_window_end: number | null;
  ct_community_score: number | null;
  critic_scores: string | null;
  user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Bottle {
  id: number;
  wine_id: number;
  ct_inventory_id: number | null;
  ct_barcode: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  estimated_value: number | null;
  location: string | null;
  size: string;
  notes: string | null;
  status: string;
  consumed_date: string | null;
  occasion: string | null;
  rating: number | null;
  user_id: number | null;
  created_at: string;
}

export interface ConsumptionLog {
  id: number;
  bottle_id: number;
  wine_id: number;
  consumed_date: string;
  occasion: string | null;
  paired_with: string | null;
  who_with: string | null;
  rating: number | null;
  tasting_notes: string | null;
  user_id: number | null;
  created_at: string;
}
