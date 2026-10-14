import { Alert } from 'react-native';
import type { ConfirmDeletion } from '../storage/deletion';

export const confirmNativeDeletion: ConfirmDeletion = prompt => new Promise(resolve => {
  Alert.alert(prompt.title, `${prompt.label || 'Untitled'}\n\n${prompt.message}`, [
    { text:'Cancel',style:'cancel',onPress: () => resolve(false) },
    { text:'Delete',style:'destructive',onPress: () => resolve(true) },
  ], { cancelable: true,onDismiss: () => resolve(false) });
});
