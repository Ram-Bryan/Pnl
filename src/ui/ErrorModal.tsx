import { Alert } from 'react-native';

export const showError = ({
  title,
  message,
}: {
  title: string;
  message: string;
}) => {
  Alert.alert(title, message, [
    { text: 'OK', style: 'cancel' },
  ]);
};