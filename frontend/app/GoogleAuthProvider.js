'use client'; // Add this at the very top

import { GoogleOAuthProvider } from '@react-oauth/google';

export default function GoogleAuthProvider({ children }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}>
      {children}
    </GoogleOAuthProvider>
  );
}