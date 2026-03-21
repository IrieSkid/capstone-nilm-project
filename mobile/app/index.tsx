import { Redirect } from 'expo-router';

import { LoadingView } from '@/src/components/LoadingView';
import { useAuth } from '@/src/context/AuthContext';

export default function IndexScreen() {
  const { loading, user } = useAuth();

  if (loading) {
    return <LoadingView />;
  }

  return <Redirect href={user ? '/(app)/dashboard' : '/login'} />;
}
