'use client';

import { AuthProvider } from './authImplementation';
import GoogleAuthProvider from './GoogleAuthProvider';

export function Providers({ children }) {
  return (
    <GoogleAuthProvider>
      <AuthProvider>{children}</AuthProvider>
    </GoogleAuthProvider>
  );
}