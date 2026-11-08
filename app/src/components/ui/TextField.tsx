import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

export interface TextFieldProps extends Pick<
  TextInputProps,
  | 'value'
  | 'onChangeText'
  | 'onSubmitEditing'
  | 'placeholder'
  | 'secureTextEntry'
  | 'keyboardType'
  | 'autoCapitalize'
  | 'autoComplete'
  | 'textContentType'
  | 'returnKeyType'
  | 'editable'
> {
  label: string;
  error?: string | null;
  hint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** Labeled text input with an inline, screen-reader-announced error message. */
export function TextField({
  label,
  error,
  hint,
  testID,
  style,
  editable = true,
  ...inputProps
}: TextFieldProps): React.JSX.Element {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.status.actNow.main
    : focused
      ? theme.colors.primary
      : theme.colors.controlBorder;

  return (
    <View style={[styles.root, { marginBottom: theme.spacing.lg }, style]}>
      <Text
        style={[
          theme.typography.subhead,
          { color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
        ]}
      >
        {label}
      </Text>
      <TextInput
        {...inputProps}
        editable={editable}
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ disabled: !editable }}
        placeholderTextColor={theme.colors.textTertiary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        testID={testID}
        style={[
          theme.typography.body,
          styles.input,
          {
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.surface,
            borderColor,
            borderRadius: theme.radii.md,
            paddingHorizontal: theme.spacing.md,
            opacity: editable ? 1 : 0.6,
          },
        ]}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[
            theme.typography.caption,
            { color: theme.colors.status.actNow.text, marginTop: theme.spacing.xs },
          ]}
          testID={testID ? `${testID}-error` : undefined}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
  },
});
