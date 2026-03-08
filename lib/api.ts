import { getApiUrl, apiRequest } from "./query-client";

export interface WineListItem {
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
  bottle_count: number;
  avg_value: number;
  total_value: number;
}

export interface Bottle {
  id: number;
  wine_id: number;
  ct_inventory_id: number | null;
  ct_barcode: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  estimated_value: number | null;
  store: string | null;
  location: string | null;
  bin: string | null;
  size: string;
  notes: string | null;
  status: string;
  consumed_date: string | null;
  occasion: string | null;
  rating: number | null;
}

export interface WineDetail extends WineListItem {
  bottles: Bottle[];
}

export interface Stats {
  total_bottles: number;
  total_value: number;
  unique_wines: number;
  consumed_bottles: number;
}

export interface FilterOptions {
  colors: string[];
  regions: string[];
  countries: string[];
  varietals: string[];
}

export interface ConsumptionEntry {
  id: number;
  bottle_id: number;
  wine_id: number;
  consumed_date: string;
  occasion: string | null;
  paired_with: string | null;
  who_with: string | null;
  rating: number | null;
  tasting_notes: string | null;
  producer: string;
  wine_name: string;
  vintage: number | null;
  color: string | null;
  varietal: string | null;
  region: string | null;
}

export interface ImportResult {
  wines_created: number;
  bottles_created: number;
  skipped: number;
  errors: string[];
  total_rows: number;
}

export interface ImportPreview {
  total_rows: number;
  preview: any[];
  unique_wines: number;
}

export function getDrinkWindowStatus(start: number | null, end: number | null): "in_window" | "approaching" | "past_peak" | "not_set" {
  if (!start && !end) return "not_set";
  const currentYear = new Date().getFullYear();
  if (end && end < currentYear) return "past_peak";
  if (start && start > currentYear && start <= currentYear + 1) return "approaching";
  if (start && end && start <= currentYear && end >= currentYear) return "in_window";
  if (start && start > currentYear + 1) return "approaching";
  return "in_window";
}

export function getColorDot(color: string | null): string {
  switch (color?.toLowerCase()) {
    case "red": return "#722F37";
    case "white": return "#D4A017";
    case "rosé":
    case "rose": return "#E8998D";
    case "sparkling": return "#C5B358";
    case "dessert": return "#B8860B";
    case "fortified": return "#8B4513";
    default: return "#9CA3AF";
  }
}

export async function uploadCsvForImport(fileUri: string, fileName: string, preview: boolean = false): Promise<ImportPreview | ImportResult> {
  const baseUrl = getApiUrl();
  const url = new URL(`/api/import${preview ? "?preview=true" : ""}`, baseUrl);

  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    name: fileName,
    type: "text/csv",
  } as any);

  const res = await fetch(url.toString(), {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import failed: ${text}`);
  }

  return res.json();
}
