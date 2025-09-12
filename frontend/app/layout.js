import { Providers } from './providers'; // Import the client wrapper
import './globals.css';

export const metadata = {
  title: 'Your App Name',
  description: 'Your app description',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="dark" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}