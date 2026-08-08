import { Redirect } from 'expo-router';

// The real Add Trade screen lives at app/add-trade.tsx.
// This stub exists only so the (modals) group doesn't have an orphaned route.
export default function AddTradeRedirect() {
  return <Redirect href="/add-trade" />;
}
