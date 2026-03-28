import { Redirect } from 'expo-router';

import { LoadingView } from '@/src/components/LoadingView';
import { useAuth } from '@/src/context/AuthContext';
import { getDefaultAppPath } from '@/src/utils/navigation';

export default function IndexScreen() {
  const { loading, user } = useAuth();

  if (loading) {
    return <LoadingView />;
  }

  return <Redirect href={user ? getDefaultAppPath(user) : '/login'} />;
}
