'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '../authImplementation';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
      <div style={{ backgroundColor: '#36393f', minHeight: '100vh' }} className="flex items-center justify-center">
        <div style={{ color: '#dcddde' }} className="text-lg">Loading...</div>
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
    <div style={{ backgroundColor: '#36393f', minHeight: '100vh' }} className="p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 style={{ color: '#dcddde' }} className="text-2xl font-bold">Dashboard</h1>
          <button
            onClick={handleLogout}
            style={{ backgroundColor: '#f04747', color: '#ffffff' }}
            className="px-4 py-2 rounded-md hover:bg-red-600"
          >
            Logout
          </button>
        </div>
        
        <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md">
          <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Welcome, {user.name}</h2>
          <div style={{ color: '#b9bbbe' }} className="space-y-2">
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
              <div style={{ backgroundColor: '#202225' }} className="mt-4 p-4 rounded">
                <h3 style={{ color: '#dcddde' }} className="font-medium mb-2">Settings:</h3>
                <p style={{ color: '#72767d' }}>Email Alerts: {user.settings.emailAlerts ? 'On' : 'Off'}</p>
                <p style={{ color: '#72767d' }}>Push Notifications: {user.settings.pushNotifications ? 'On' : 'Off'}</p>
              </div>
            )}
          </div>
          <div className="mt-6">
            <Link href="/servers">
              <button 
                style={{ backgroundColor: '#5865f2', color: '#ffffff' }} 
                className="px-4 py-2 rounded-md hover:bg-blue-600"
              >
                Go to Chat App (Servers)
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}