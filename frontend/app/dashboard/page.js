'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '../authImplementation';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const { user, loading, logout, isAuthenticated } = useAuth();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated()) {
        router.push('/login');
      }
    }
  }, [user, loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <button
            onClick={handleLogout}
            className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600"
          >
            Logout
          </button>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Welcome, {user.name}</h2>
          <div className="space-y-2">
            <p><strong>Email:</strong> {user.email}</p>
            {user.avatar && (
              <div className="mt-2">
                <img 
                  src={user.avatar} 
                  alt="Avatar" 
                  className="w-20 h-20 rounded-full object-cover"
                />
              </div>
            )}
            <p><strong>Account Status:</strong> {user.isActive ? 'Active' : 'Deactivated'}</p>
            {user.settings && (
              <div className="mt-4 p-4 bg-gray-50 rounded">
                <h3 className="font-medium mb-2">Settings:</h3>
                <p>Email Alerts: {user.settings.emailAlerts ? 'On' : 'Off'}</p>
                <p>Push Notifications: {user.settings.pushNotifications ? 'On' : 'Off'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}