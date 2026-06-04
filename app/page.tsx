'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { LoginForm } from '@/components/auth/LoginForm';

export default function Home() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Dashboard user={user} />
    </div>
  );
}
