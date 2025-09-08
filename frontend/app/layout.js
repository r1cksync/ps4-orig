import { Providers } from './providers'; // Import the client wrapper
import './globals.css';

export const metadata = {
  title: 'Your App Name',
  description: 'Your app description',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers> {/* Use the client wrapper */}
      </body>
    </html>
  );
}