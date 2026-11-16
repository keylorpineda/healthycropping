import { getDatabase } from '../database';

/** One cached `GET /plots/{id}/weather-risk` answer; `id` is the plot id. */
export interface StoredWeatherRisk {
  id: string;
  latitude: number;
  longitude: number;
  response_json: string;
  fetched_at: string;
}

/** Offline copy of the latest weather risk per plot. */
export class WeatherRisksRepository {
  get(plotId: string): StoredWeatherRisk | null {
    return getDatabase().getFirstSync<StoredWeatherRisk>(
      'SELECT * FROM weather_risks WHERE id = ?',
      plotId,
    );
  }

  save(
    plotId: string,
    latitude: number,
    longitude: number,
    responseJson: string,
    fetchedAt = new Date().toISOString(),
  ): void {
    const db = getDatabase();
    db.withTransactionSync(() => {
      db.runSync('DELETE FROM weather_risks WHERE id = ?', plotId);
      db.runSync(
        `INSERT INTO weather_risks (id, latitude, longitude, response_json, fetched_at)
         VALUES (?, ?, ?, ?, ?)`,
        plotId,
        latitude,
        longitude,
        responseJson,
        fetchedAt,
      );
    });
  }
}

export const weatherRisksRepository = new WeatherRisksRepository();
