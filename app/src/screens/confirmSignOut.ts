import { Alert } from 'react-native';
import { type TFunction } from 'i18next';

/** Ask before signing out; local data stays on the device either way. */
export function confirmSignOut(t: TFunction, onConfirm: () => void): void {
  Alert.alert(t('auth.signOutConfirmTitle'), t('auth.signOutConfirmBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('auth.signOut'), style: 'destructive', onPress: onConfirm },
  ]);
}
