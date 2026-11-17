import {
  type BoundaryPoint,
  boundaryAreaHa,
  boundaryCenter,
  boundaryToGeoJson,
  normalizeBoundary,
  parseBoundaryGeoJson,
  validateBoundary,
} from '../plotBoundary';

const SQUARE: [BoundaryPoint, BoundaryPoint, BoundaryPoint, BoundaryPoint] = [
  { latitude: 9.66, longitude: -84.023 },
  { latitude: 9.66, longitude: -84.022 },
  { latitude: 9.661, longitude: -84.022 },
  { latitude: 9.661, longitude: -84.023 },
];

describe('normalizeBoundary', () => {
  it('drops consecutive duplicate points and a closing vertex equal to the first', () => {
    const input: BoundaryPoint[] = [
      { latitude: 9.66, longitude: -84.023 },
      { latitude: 9.66, longitude: -84.023 },
      { latitude: 9.66, longitude: -84.022 },
      { latitude: 9.661, longitude: -84.022 },
      { latitude: 9.661, longitude: -84.022 },
      { latitude: 9.66, longitude: -84.023 },
    ];

    expect(normalizeBoundary(input)).toEqual([
      { latitude: 9.66, longitude: -84.023 },
      { latitude: 9.66, longitude: -84.022 },
      { latitude: 9.661, longitude: -84.022 },
    ]);
  });

  it('returns copies so mutating input afterwards does not change output', () => {
    const input: BoundaryPoint[] = [
      { latitude: 9.66, longitude: -84.023 },
      { latitude: 9.66, longitude: -84.022 },
      { latitude: 9.661, longitude: -84.022 },
    ];

    const output = normalizeBoundary(input);
    const first = input[0];
    if (first) first.latitude = 10;
    input.push({ latitude: 9.661, longitude: -84.023 });

    expect(output).toEqual([
      { latitude: 9.66, longitude: -84.023 },
      { latitude: 9.66, longitude: -84.022 },
      { latitude: 9.661, longitude: -84.022 },
    ]);
  });
});

describe('validateBoundary', () => {
  it('returns tooFewPoints for 2 points and for 4 points with only 2 distinct', () => {
    expect(validateBoundary(SQUARE.slice(0, 2))).toBe('tooFewPoints');
    expect(
      validateBoundary([
        { latitude: 9.66, longitude: -84.023 },
        { latitude: 9.66, longitude: -84.022 },
        { latitude: 9.66, longitude: -84.023 },
        { latitude: 9.66, longitude: -84.022 },
      ]),
    ).toBe('tooFewPoints');
  });

  it('returns tooManyPoints for 101 distinct points', () => {
    const manyPoints: BoundaryPoint[] = Array.from({ length: 101 }, (_, index) => ({
      latitude: 9.66 + index * 0.0001,
      longitude: -84.023 - (index % 2) * 0.0001,
    }));

    expect(validateBoundary(manyPoints)).toBe('tooManyPoints');
  });

  it.each([
    [{ latitude: 91, longitude: -84.023 }],
    [{ latitude: 9.66, longitude: -181 }],
    [{ latitude: Number.NaN, longitude: -84.023 }],
  ])('returns outOfRange for invalid point %o', (invalidPoint) => {
    expect(validateBoundary([invalidPoint, SQUARE[1], SQUARE[2]])).toBe('outOfRange');
  });

  it('returns null for a valid square', () => {
    expect(validateBoundary(SQUARE)).toBeNull();
  });
});

describe('boundaryToGeoJson and parseBoundaryGeoJson', () => {
  it('round trips a square of 4 points via closed [longitude, latitude] GeoJSON Polygon', () => {
    const json = boundaryToGeoJson(SQUARE);
    const parsedJson = JSON.parse(json) as { type: string; coordinates: number[][][] };

    expect(parsedJson.type).toBe('Polygon');
    expect(parsedJson.coordinates[0]).toHaveLength(5);
    expect(parsedJson.coordinates[0]).toEqual([
      [-84.023, 9.66],
      [-84.022, 9.66],
      [-84.022, 9.661],
      [-84.023, 9.661],
      [-84.023, 9.66],
    ]);
    const ring = parsedJson.coordinates[0] ?? [];
    expect(ring[4]).toEqual(ring[0]);

    expect(parseBoundaryGeoJson(json)).toEqual(SQUARE);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['not json'],
    ['{"type":"Point","coordinates":[1,2]}'],
    [
      JSON.stringify({
        type: 'Polygon',
        coordinates: [
          [
            [-84.023, 9.66],
            [-84.022, 9.66],
            [-84.023, 9.66],
          ],
        ],
      }),
    ],
    [
      JSON.stringify({
        type: 'Polygon',
        coordinates: [
          [
            [-84.023, 9.66],
            ['bad', 9.66],
            [-84.022, 9.661],
            [-84.023, 9.66],
          ],
        ],
      }),
    ],
  ])('returns null for invalid GeoJSON input (%p)', (input) => {
    expect(parseBoundaryGeoJson(input)).toBeNull();
  });
});

describe('boundaryCenter', () => {
  it('computes the vertex average of the square', () => {
    const center = boundaryCenter(SQUARE);

    expect(center.latitude).toBeCloseTo(9.6605, 6);
    expect(center.longitude).toBeCloseTo(-84.0225, 6);
  });
});

describe('boundaryAreaHa', () => {
  it('computes ~1.21 ha for a 0.001-degree square at latitude 9.66 regardless of winding order', () => {
    const area = boundaryAreaHa(SQUARE);
    const reversedArea = boundaryAreaHa([...SQUARE].reverse());

    expect(area).toBeGreaterThan(1.18);
    expect(area).toBeLessThan(1.24);
    expect(reversedArea).toBeCloseTo(area, 10);
  });

  it('returns 0 for fewer than 3 points', () => {
    expect(boundaryAreaHa([])).toBe(0);
    expect(boundaryAreaHa(SQUARE.slice(0, 2))).toBe(0);
  });
});
