import { type SupportedCrop } from '@/version';

export type SyncStatus = 'pending' | 'synced' | 'failed';
export type DiagnosisSeverity = 'healthy' | 'watch' | 'actNow';

export interface Farm {
  id: string; // client UUID v4
  name: string;
  region: string;
  altitude_m: number | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  deleted_at: string | null;
  sync_status: SyncStatus;
}

export interface CreateFarmInput {
  name: string;
  region: string;
  altitude_m?: number | null;
}

export interface UpdateFarmInput {
  name?: string;
  region?: string;
  altitude_m?: number | null;
}

export interface Plot {
  id: string; // client UUID v4
  farm_id: string; // FK to Farm
  name: string;
  crop: SupportedCrop;
  area_ha: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: SyncStatus;
}

export interface CreatePlotInput {
  farm_id: string;
  name: string;
  crop: SupportedCrop;
  area_ha?: number | null;
}

export interface UpdatePlotInput {
  name?: string;
  crop?: SupportedCrop;
  area_ha?: number | null;
}

export interface Scan {
  id: string; // client UUID v4
  farm_id: string | null;
  plot_id: string | null;
  crop: SupportedCrop;
  predicted_class: string;
  severity: DiagnosisSeverity;
  confidence: number;
  threshold: number;
  is_low_confidence: number; // 0 or 1 in SQLite
  model_version: string;
  local_photo_uri: string;
  cloudinary_public_id: string | null;
  explanation_json: string | null;
  scanned_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: SyncStatus;
}

export interface CreateScanInput {
  farm_id?: string | null;
  plot_id?: string | null;
  crop: SupportedCrop;
  predicted_class: string;
  severity: DiagnosisSeverity;
  confidence: number;
  threshold: number;
  is_low_confidence: boolean;
  model_version: string;
  local_photo_uri: string;
  explanation_json?: string | null;
}

export interface ScanFilters {
  crop?: SupportedCrop;
  severity?: DiagnosisSeverity;
  farm_id?: string;
  plot_id?: string;
  includeDeleted?: boolean;
}
