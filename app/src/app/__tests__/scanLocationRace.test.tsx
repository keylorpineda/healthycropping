import React from 'react';
import { act, render } from '@testing-library/react-native';

import '@/i18n';

import { type BoundaryPoint, type Scan, scansRepository } from '@/db';
import { runInference } from '@/ml';
import { CameraScreen, ResultScreen } from '@/screens';
import { captureScanLocation } from '@/services/scanLocation';

import ScanScreen from '../scan';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ crop: 'coffee' }),
}));
jest.mock('@/screens', () => ({
  CameraScreen: jest.fn(() => null),
  ResultScreen: jest.fn(() => null),
}));
jest.mock('@/components/camera', () => ({ AnalyzingOverlay: () => null }));
jest.mock('@/components/ui', () => ({ Toast: () => null }));
jest.mock('@/db', () => ({
  persistScanPhoto: jest.fn((uri: string) => Promise.resolve(uri)),
  plotsRepository: { getAll: jest.fn(() => []) },
  scansRepository: { create: jest.fn() },
}));
jest.mock('@/ml', () => ({ runInference: jest.fn(), getModelVersion: () => '0.1.0' }));
jest.mock('@/services/scanLocation', () => ({
  captureScanLocation: jest.fn(),
  plotContaining: jest.fn(() => null),
}));

it('keeps the new result id when an earlier GPS capture finishes after a retake', async () => {
  let finishFirst: (point: BoundaryPoint | null) => void = () => {
    throw new Error('first location has not started');
  };
  const firstLocation = new Promise<BoundaryPoint | null>((resolve) => {
    finishFirst = resolve;
  });
  jest.mocked(captureScanLocation).mockResolvedValueOnce(firstLocation).mockResolvedValueOnce(null);
  jest.mocked(runInference).mockResolvedValue({
    crop: 'coffee',
    predictedClass: 'healthy',
    confidence: 0.9,
    threshold: 0.79,
    isLowConfidence: false,
    severity: 'healthy',
    probabilities: { healthy: 0.9 },
    rawProbabilities: [0.9],
    inferenceTimeMs: 50,
  });
  jest
    .mocked(scansRepository.create)
    .mockReturnValueOnce({ id: 'new-scan' } as Scan)
    .mockReturnValueOnce({ id: 'earlier-scan' } as Scan);
  render(<ScanScreen />);

  await act(async () => {
    jest.mocked(CameraScreen).mock.calls.at(-1)?.[0].onPhotoCaptured('first.jpg');
  });
  act(() => {
    jest.mocked(ResultScreen).mock.calls.at(-1)?.[0].onRetake?.();
  });
  await act(async () => {
    jest.mocked(CameraScreen).mock.calls.at(-1)?.[0].onPhotoCaptured('second.jpg');
  });
  expect(jest.mocked(ResultScreen).mock.calls.at(-1)?.[0].scanId).toBe('new-scan');

  await act(async () => {
    finishFirst(null);
  });

  expect(scansRepository.create).toHaveBeenCalledTimes(2);
  expect(jest.mocked(ResultScreen).mock.calls.at(-1)?.[0].scanId).toBe('new-scan');
});
