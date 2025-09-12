'use client';
import { useState, useEffect } from 'react';
import { use } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import MessageSection from '../../../components/MessageSection';
import ProfileSection from '../../../components/ProfileSection';
import VoiceChannelSection from '../../../components/VoiceChannelSection';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function ChannelPage({ params: paramsPromise }) {
  const params = use(paramsPromise);
  const { serverId, channelId } = params;
  const [token, setToken] = useState(null);
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(null);
  const [channel, setChannel] = useState(null);
  const [channelLoading, setChannelLoading] = useState(true);
  const [userLoading, setUserLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const authToken = localStorage.getItem('token');
    console.log('page.js: Auth token:', authToken?.substring(0, 10) + '...');
    if (!authToken) {
      console.error('page.js: No auth token found');
      window.location.href = '/login';
      return;
    }
    setToken(authToken);

    // Fetch user profile
    const fetchUser = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        console.log('page.js: Fetched user:', response.data);
        setUser(response.data);
      } catch (err) {
        console.error('page.js: Error fetching user:', err.message, {
          status: err.response?.status,
          data: err.response?.data,
        });
        setError('Failed to fetch user');
      } finally {
        setUserLoading(false);
      }
    };

    // Fetch channel details
    const fetchChannel = async () => {
      try {
        console.log('page.js: Fetching channel with ID:', channelId);
        const response = await axios.get(`${BASE_URL}/channels/${channelId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        console.log('page.js: Fetched channel response:', response.data);
        console.log('page.js: Channel data:', response.data);
        console.log('page.js: Channel type:', response.data.type);
        setChannel(response.data);
      } catch (err) {
        console.error('page.js: Error fetching channel:', err.message, {
          status: err.response?.status,
          data: err.response?.data,
        });
        setError(err.response?.data?.message || 'Failed to fetch channel');
      } finally {
        setChannelLoading(false);
      }
    };

    fetchUser();
    fetchChannel();

    // Initialize Socket.IO
    console.log('page.js: Connecting to Socket.IO URL: http://localhost:3001');
    const socketInstance = io('http://localhost:3001', {
      auth: { token: authToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      randomizationFactor: 0.2,
    });

    socketInstance.on('connect', () => {
      console.log('page.js: Socket.IO connected', socketInstance.id);
      socketInstance.emit('joinChannel', { channelId });
    });
    socketInstance.on('connect_error', (err) => {
      console.error('page.js: Socket.IO connect error:', err.message, err);
      setError('Failed to connect to real-time updates');
    });
    socketInstance.on('disconnect', (reason) => {
      console.log('page.js: Socket.IO disconnected:', reason);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
      console.log('page.js: Socket.IO cleanup');
    };
  }, [channelId]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  if (channelLoading || userLoading) {
    return <div style={{ color: '#dcddde', padding: '1rem' }}>Loading...</div>;
  }

  if (!user) {
    return <div style={{ color: '#dcddde', padding: '1rem' }}>Failed to load user profile</div>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#2f3136' }}>
      <ProfileSection user={user} token={token} socket={socket} logout={handleLogout} setUser={setUser} />
      <div style={{ flex: 1 }}>
        {error && (
          <div style={{ backgroundColor: '#f04747', padding: '0.5rem', borderRadius: '4px', margin: '1rem' }}>
            <p style={{ color: '#ffffff' }}>{error}</p>
          </div>
        )}
        {channel ? (
          channel.type === 'VOICE' ? (
            <VoiceChannelSection
              channelId={channelId}
              serverId={serverId}
              token={token}
              socket={socket}
              user={user}
            />
          ) : (
            <MessageSection
              channelId={channelId}
              serverId={serverId}
              token={token}
              socket={socket}
              channel={channel}
            />
          )
        ) : (
          <div style={{ color: '#dcddde', padding: '1rem' }}>Channel not found</div>
        )}
      </div>
    </div>
  );
}