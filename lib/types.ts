export type Pt = [number, number];

export interface Region {
  name: string;
  pts: Pt[];
  occ?: boolean; // keep-on-top cutout (never painted)
}

export interface Project {
  id: string;
  title: string;
  photo_path: string;
  photo_w: number;
  photo_h: number;
  regions: Region[];
  created_at: string;
}

// A color assignment per region, aligned to regions[] by index.
export interface ColorSlot {
  color: string | null;
  strength: number;
}

export interface Scheme {
  id: string;
  project_id: string;
  author_name: string;
  colors: ColorSlot[];
  in_gallery: boolean;
  created_at: string;
}
