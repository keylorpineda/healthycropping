import { type Farm, type Plot, type Scan } from '@/db';
import contract from '../fixtures/sync_contract.json';
import { SCAN_SIGNATURE_FIELDS, toSignatureRequest } from '../cloudinary';
import {
  SCAN_SYNC_STATUSES,
  toFarmPayload,
  toPatchBody,
  toPlotPayload,
  toScanPayload,
} from '../sync';

jest.mock('../auth', () => ({ getIdToken: jest.fn().mockResolvedValue(null) }));

/**
 * App side of the sync contract (#48). The payloads built from these SQLite rows
 * must equal `fixtures/sync_contract.json`; `api/tests/test_contract.py` checks the
 * same file against the Pydantic models and sends it through the real endpoints.
 */

const FARM: Farm = {
  id: '3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
  name: 'Finca La Esperanza',
  region: 'Tarrazú',
  altitude_m: 1650,
  created_at: '2026-10-30T08:00:00.000Z',
  updated_at: '2026-10-30T08:00:00.000Z',
  deleted_at: null,
  sync_status: 'pending',
};

const PLOT: Plot = {
  id: '7a2b3c4d-1e2f-4a5b-9c6d-7e8f9a0b1c2d',
  farm_id: FARM.id,
  name: 'Lote Norte',
  crop: 'coffee',
  area_ha: 2.5,
  created_at: '2026-10-30T08:05:00.000Z',
  updated_at: '2026-10-30T08:05:00.000Z',
  deleted_at: null,
  sync_status: 'pending',
};

const SCANS: Scan[] = [
  {
    id: 'c0ffee00-1234-4abc-8def-0123456789ab',
    farm_id: FARM.id,
    plot_id: PLOT.id,
    crop: 'coffee',
    predicted_class: 'leaf_rust',
    severity: 'watch',
    confidence: 0.91,
    threshold: 0.6,
    is_low_confidence: 0,
    model_version: 'coffee-v0.1.0',
    local_photo_uri: 'file:///data/user/0/app/files/scans/a.jpg',
    cloudinary_public_id: 'users/user-a/scans/c0ffee00-1234-4abc-8def-0123456789ab',
    explanation_json: null,
    scanned_at: '2026-11-01T14:05:00.000Z',
    updated_at: '2026-11-01T14:06:30.000Z',
    deleted_at: null,
    sync_status: 'pending',
  },
  {
    id: 'ca0ca000-5678-4def-9abc-ba9876543210',
    farm_id: null,
    plot_id: null,
    crop: 'cacao',
    predicted_class: 'monilia',
    severity: 'actNow',
    confidence: 0.42,
    threshold: 0.51,
    is_low_confidence: 1,
    model_version: 'cacao-v0.1.0',
    local_photo_uri: 'file:///data/user/0/app/files/scans/b.jpg',
    cloudinary_public_id: null,
    explanation_json: '{"cached":true}',
    scanned_at: '2026-11-02T09:00:00.000Z',
    updated_at: '2026-11-03T10:00:00.000Z',
    deleted_at: '2026-11-03T10:00:00.000Z',
    sync_status: 'failed',
  },
];

describe('sync contract fixture', () => {
  it('matches the farm and plot payloads the sync engine sends', () => {
    expect(toFarmPayload(FARM)).toEqual(contract.farm_create);
    expect(toPatchBody(toFarmPayload(FARM))).toEqual(contract.farm_update);
    expect(toPlotPayload(PLOT)).toEqual(contract.plot_create);
    expect(toPatchBody(toPlotPayload(PLOT))).toEqual(contract.plot_update);
  });

  it('matches the scan batch, without device-only columns', () => {
    expect({ scans: SCANS.map(toScanPayload) }).toEqual(contract.scan_sync_request);
  });

  it('matches the statuses the app understands', () => {
    expect([...SCAN_SYNC_STATUSES]).toEqual(contract.scan_sync_statuses);
  });

  it('matches the upload signature request and response fields', () => {
    expect(toSignatureRequest('c0ffee00-1234-4abc-8def-0123456789ab')).toEqual(
      contract.scan_signature_request,
    );
    expect([...SCAN_SIGNATURE_FIELDS].sort()).toEqual([...contract.scan_signature_fields].sort());
  });
});
