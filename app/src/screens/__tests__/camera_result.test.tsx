import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { AnalyzingOverlay, PhotoTipsSheet } from '@/components/camera';
import i18n from '@/i18n';
import { type InferencePrediction } from '@/ml/types';
import { CameraScreen, ResultScreen } from '@/screens';
import { ThemeProvider } from '@/theme';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('Camera, Photo Tips, Analyzing & Result Screens', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage('es');
  });

  describe('PhotoTipsSheet', () => {
    it('renders tips for coffee crop and closes when confirm button is pressed', () => {
      const onCloseMock = jest.fn();
      renderWithTheme(<PhotoTipsSheet visible={true} crop="coffee" onClose={onCloseMock} />);

      expect(screen.getByTestId('photo-tips-sheet-title')).toHaveTextContent('Consejos para Café');
      expect(screen.getByTestId('photo-tips-sheet-tip-1')).toHaveTextContent(
        /enfoca el envés de la hoja/i,
      );

      const confirmBtn = screen.getByTestId('photo-tips-sheet-confirm-btn');
      fireEvent.press(confirmBtn);
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('renders tips for cacao crop', () => {
      renderWithTheme(<PhotoTipsSheet visible={true} crop="cacao" onClose={jest.fn()} />);
      expect(screen.getByTestId('photo-tips-sheet-tip-1')).toHaveTextContent(
        /fotografía la mazorca completa/i,
      );
    });

    it('renders tips for banana crop', () => {
      renderWithTheme(<PhotoTipsSheet visible={true} crop="banana" onClose={jest.fn()} />);
      expect(screen.getByTestId('photo-tips-sheet-tip-1')).toHaveTextContent(
        /captura las estrías y manchas/i,
      );
    });
  });

  describe('AnalyzingOverlay', () => {
    it('renders analyzing overlay with scan line and offline indicator', () => {
      renderWithTheme(<AnalyzingOverlay imageUri="file:///test/leaf.jpg" />);

      expect(screen.getByTestId('analyzing-overlay')).toBeTruthy();
      expect(screen.getByTestId('analyzing-overlay-title')).toHaveTextContent(
        'Analizando cultivo...',
      );
      expect(screen.getByTestId('analyzing-overlay-scan-line')).toBeTruthy();
    });
  });

  describe('CameraScreen', () => {
    it('renders camera viewfinder, crop badge, framing guide, and controls', () => {
      const onPhotoCaptured = jest.fn();
      const onClose = jest.fn();

      renderWithTheme(
        <CameraScreen crop="coffee" onPhotoCaptured={onPhotoCaptured} onClose={onClose} />,
      );

      expect(screen.getByTestId('camera-crop-badge')).toHaveTextContent('Café');
      expect(screen.getByTestId('camera-framing-guide')).toBeTruthy();

      // Trigger Tips
      const tipsBtn = screen.getByTestId('camera-tips-btn');
      fireEvent.press(tipsBtn);
      expect(screen.getByTestId('camera-photo-tips-sheet-title')).toHaveTextContent(
        'Consejos para Café',
      );

      // Dismiss Tips Sheet
      const tipsConfirmBtn = screen.getByTestId('camera-photo-tips-sheet-confirm-btn');
      fireEvent.press(tipsConfirmBtn);

      // Close button
      const closeBtn = screen.getByTestId('camera-close-btn');
      fireEvent.press(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('captures photo when shutter button is pressed', async () => {
      const onPhotoCaptured = jest.fn();
      renderWithTheme(
        <CameraScreen crop="coffee" onPhotoCaptured={onPhotoCaptured} onClose={jest.fn()} />,
      );

      const shutterBtn = screen.getByTestId('camera-shutter-btn');
      await act(async () => {
        fireEvent.press(shutterBtn);
      });

      expect(onPhotoCaptured).toHaveBeenCalledWith('file:///mock/captured_photo.jpg');
    });

    it('picks photo from gallery when gallery button is pressed', async () => {
      const onPhotoCaptured = jest.fn();
      renderWithTheme(
        <CameraScreen crop="coffee" onPhotoCaptured={onPhotoCaptured} onClose={jest.fn()} />,
      );

      const galleryBtn = screen.getByTestId('camera-gallery-btn');
      await act(async () => {
        fireEvent.press(galleryBtn);
      });

      expect(onPhotoCaptured).toHaveBeenCalledWith('file:///mock/gallery_photo.jpg');
    });
  });

  describe('ResultScreen', () => {
    const mockConfidentPrediction: InferencePrediction = {
      crop: 'coffee',
      predictedClass: 'leaf_rust',
      confidence: 0.94,
      threshold: 0.79,
      isLowConfidence: false,
      severity: 'actNow',
      probabilities: {
        healthy: 0.01,
        leaf_rust: 0.94,
        leaf_miner: 0.02,
        cercospora: 0.01,
        brown_leaf_spot: 0.01,
        red_spider_mite: 0.01,
      },
      rawProbabilities: [0.01, 0.94, 0.02, 0.01, 0.01, 0.01],
      inferenceTimeMs: 45,
    };

    const mockLowConfidencePrediction: InferencePrediction = {
      crop: 'coffee',
      predictedClass: 'leaf_rust',
      confidence: 0.62,
      threshold: 0.79,
      isLowConfidence: true,
      severity: 'watch',
      probabilities: {
        healthy: 0.15,
        leaf_rust: 0.62,
        leaf_miner: 0.1,
        cercospora: 0.05,
        brown_leaf_spot: 0.05,
        red_spider_mite: 0.03,
      },
      rawProbabilities: [0.15, 0.62, 0.1, 0.05, 0.05, 0.03],
      inferenceTimeMs: 48,
    };

    it('renders confident prediction with disease name, progress meter, advice, and probabilities', () => {
      const onRetake = jest.fn();
      const onDone = jest.fn();

      renderWithTheme(
        <ResultScreen
          imageUri="file:///mock/captured_photo.jpg"
          prediction={mockConfidentPrediction}
          onRetake={onRetake}
          onDone={onDone}
        />,
      );

      expect(screen.getByTestId('result-disease-name')).toHaveTextContent(
        'Roya del café (Hemileia vastatrix)',
      );
      expect(screen.getByTestId('result-status-badge')).toHaveTextContent(
        'Acción fitosanitaria requerida',
      );
      expect(screen.getByTestId('result-confidence-meter')).toBeTruthy();
      expect(screen.getByTestId('result-advice-text')).toHaveTextContent(
        /consulte inmediatamente las recomendaciones oficiales/i,
      );
      expect(screen.getByTestId('result-disclaimer-box')).toHaveTextContent(
        /no reemplaza el criterio de un agrónomo/i,
      );

      // Tap Retake
      const retakeBtn = screen.getByTestId('result-retake-btn');
      fireEvent.press(retakeBtn);
      expect(onRetake).toHaveBeenCalledTimes(1);

      // Tap Done
      const doneBtn = screen.getByTestId('result-done-btn');
      fireEvent.press(doneBtn);
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('renders low-confidence warning card with retake action when confidence is below threshold', () => {
      const onRetake = jest.fn();
      const onDone = jest.fn();

      renderWithTheme(
        <ResultScreen
          imageUri="file:///mock/captured_photo.jpg"
          prediction={mockLowConfidencePrediction}
          onRetake={onRetake}
          onDone={onDone}
        />,
      );

      expect(screen.getByTestId('result-low-confidence-title')).toHaveTextContent(
        'Confianza baja — repita la captura',
      );
      expect(screen.getByTestId('result-low-conf-badge')).toHaveTextContent('Observación');

      const retakeBtn = screen.getByTestId('result-low-confidence-retake-btn');
      fireEvent.press(retakeBtn);
      expect(onRetake).toHaveBeenCalledTimes(1);
    });

    it('renders English text properly when locale is changed to en', async () => {
      await i18n.changeLanguage('en');

      renderWithTheme(
        <ResultScreen
          imageUri="file:///mock/captured_photo.jpg"
          prediction={mockConfidentPrediction}
          onRetake={jest.fn()}
          onDone={jest.fn()}
        />,
      );

      expect(screen.getByTestId('result-disease-name')).toHaveTextContent(
        'Coffee leaf rust (Hemileia vastatrix)',
      );
      expect(screen.getByTestId('result-status-badge')).toHaveTextContent(
        'Phytosanitary action required',
      );
    });
  });
});
