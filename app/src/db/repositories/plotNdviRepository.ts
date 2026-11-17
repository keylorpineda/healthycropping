import { getDatabase } from '../database';

/** One cached `GET /plots/{id}/ndvi` answer; `id` is the plot id. */
export interface StoredPlotNdvi {
  id: string;
  geometry_key: string;
  response_json: string;
  fetched_at: string;
}

/** Offline copy of the latest NDVI series per plot. */
export class PlotNdviRepository {
  get(plotId: string): StoredPlotNdvi | null {
    return getDatabase().getFirstSync<StoredPlotNdvi>(
      'SELECT * FROM plot_ndvi WHERE id = ?',
      plotId,
    );
  }

  save(
    plotId: string,
    geometryKey: string,
    responseJson: string,
    fetchedAt = new Date().toISOString(),
  ): void {
    const db = getDatabase();
    db.withTransactionSync(() => {
      db.runSync('DELETE FROM plot_ndvi WHERE id = ?', plotId);
      db.runSync(
        `INSERT INTO plot_ndvi (id, geometry_key, response_json, fetched_at)
         VALUES (?, ?, ?, ?)`,
        plotId,
        geometryKey,
        responseJson,
        fetchedAt,
      );
    });
  }
}

export const plotNdviRepository = new PlotNdviRepository();
