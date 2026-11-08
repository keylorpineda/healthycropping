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

export function explanationId(key: ExplanationKey): string {
  return `${key.crop}:${key.disease_class}:${key.severity}:${key.language}`;
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
}

export const explanationsRepository = new ExplanationsRepository();
