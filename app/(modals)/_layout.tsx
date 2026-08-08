import { Slot } from 'expo-router';

// Use Slot instead of Stack — this group must NOT create its own navigation context.
// Navigation is owned entirely by the root Stack in app/_layout.tsx.
export default function ModalsLayout() {
  return <Slot />;
}
