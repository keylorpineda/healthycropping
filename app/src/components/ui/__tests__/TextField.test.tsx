import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/theme';
import { TextField } from '../TextField';

describe('TextField', () => {
  it('renders an accessible labeled input and forwards text changes', () => {
    const onChangeText = jest.fn();
    render(
      <ThemeProvider>
        <TextField label="Email" value="" onChangeText={onChangeText} testID="email" />
      </ThemeProvider>,
    );

    fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.cr');
    expect(onChangeText).toHaveBeenCalledWith('a@b.cr');
    expect(screen.queryByTestId('email-error')).toBeNull();
  });

  it('shows the error message as an alert', () => {
    render(
      <ThemeProvider>
        <TextField label="Email" value="x" error="Invalid email" testID="email" />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('email-error')).toHaveTextContent('Invalid email');
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
