import { getDatabase } from '../database';
import { type DiagnosisSeverity } from '../types';

/** The four values an explanation depends on; nothing about the user or the farm. */
export interface ExplanationKey {
  crop: string;
  disease_class: string;
  severity: DiagnosisSeverity;
  language: 'es' | 'en';
}

export interface StoredExplanation {
  id: string;
  crop: string;
  disease_class: string;
  severity: string;
  language: string;
  response_json: string;
  fetched_at: string;
}

export interface StoredScanExplanation {
  id: string;
  explanation_id: string;
  response_json: string;
  fetched_at: string;
}

export function explanationId(key: ExplanationKey): string {
  return `${key.crop}:${key.disease_class}:${key.severity}:${key.language}`;
}

const SEVERITIES: readonly string[] = ['healthy', 'watch', 'actNow'];

/** Inverse of `explanationId`; null for ids this version did not write. */
export function parseExplanationId(id: string): ExplanationKey | null {
  const [crop, diseaseClass, severity, language, ...rest] = id.split(':');
  if (
    rest.length > 0 ||
    !crop ||
    !diseaseClass ||
    !severity ||
    !SEVERITIES.includes(severity) ||
    (language !== 'es' && language !== 'en')
  ) {
    return null;
  }
  return {
    crop,
    disease_class: diseaseClass,
    severity: severity as DiagnosisSeverity,
    language,
  };
}

/** Offline copy of `POST /explanations` answers, one row per diagnosis key. */
export class ExplanationsRepository {
  get(key: ExplanationKey): StoredExplanation | null {
    return getDatabase().getFirstSync<StoredExplanation>(
      'SELECT * FROM explanations WHERE id = ?',
      explanationId(key),
    );
  }

  save(key: ExplanationKey, responseJson: string, fetchedAt = new Date().toISOString()): void {
    const db = getDatabase();
    const id = explanationId(key);
    db.withTransactionSync(() => {
      db.runSync('DELETE FROM explanations WHERE id = ?', id);
      db.runSync(
        `INSERT INTO explanations (id, crop, disease_class, severity, language, response_json, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        key.crop,
        key.disease_class,
        key.severity,
        key.language,
        responseJson,
        fetchedAt,
      );
    });
  }

  getForScan(scanId: string): StoredScanExplanation | null {
    return getDatabase().getFirstSync<StoredScanExplanation>(
      'SELECT * FROM scan_explanations WHERE id = ?',
      scanId,
    );
  }

  /** Keeps a copy of the explanation shown for a scan (the latest one wins). */
  linkToScan(
    scanId: string,
    key: ExplanationKey,
    responseJson: string,
    fetchedAt = new Date().toISOString(),
  ): void {
    const db = getDatabase();
    db.withTransactionSync(() => {
      db.runSync('DELETE FROM scan_explanations WHERE id = ?', scanId);
      db.runSync(
        `INSERT INTO scan_explanations (id, explanation_id, response_json, fetched_at)
         VALUES (?, ?, ?, ?)`,
        scanId,
        explanationId(key),
        responseJson,
        fetchedAt,
      );
    });
  }
}

export const explanationsRepository = new ExplanationsRepository();
