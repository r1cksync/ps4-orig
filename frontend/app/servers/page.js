'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '../authImplementation';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { io } from 'socket.io-client';
import Link from 'next/link';
import ProfileSection from '../components/ProfileSection';
import FriendsSection from '../components/FriendsSection';
import DMSection from '../components/DMSection';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function Servers() {
  const { user, token, loading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [servers, setServers] = useState([]);
  const [error, setError] = useState('');
  const [createFormData, setCreateFormData] = useState({
    name: '',
    description: '',
    icon: '',
  });
  const [joinFormData, setJoinFormData] = useState({
    inviteCode: '',
  });
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [activeView, setActiveView] = useState('servers');
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!loading && !isAuthenticated()) {
      router.push('/login');
      return;
    }

    if (token) {
      console.log('page.js: Auth token:', token?.substring(0, 10) + '...');
      // Initialize Socket.IO with explicit namespace and reconnection settings
      const socketInstance = io(BASE_URL.replace('/api', ''), {
        auth: { token },
        path: '/socket.io', // Explicitly set path
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        randomizationFactor: 0.5,
      });

      socketInstance.on('connect', () => {
        console.log('page.js: Socket.IO connected', socketInstance.id);
        socketInstance.emit('joinUser', { userId: user?.id });
      });

      socketInstance.on('connect_error', (err) => {
        console.error('page.js: Socket.IO connect error:', err.message);
        setError(`Socket connection failed: ${err.message}`);
      });

      socketInstance.on('disconnect', (reason) => {
        console.log('page.js: Socket.IO disconnected:', reason);
        setError('Socket disconnected. Reconnecting...');
      });

      setSocket(socketInstance);

      return () => {
        socketInstance.disconnect();
        console.log('page.js: Socket.IO cleanup');
      };
    }
  }, [loading, isAuthenticated, token, user, router]);

  useEffect(() => {
    if (activeView === 'servers' && token && isAuthenticated()) {
      fetchServers();
    }
  }, [activeView, token, isAuthenticated]);

  const fetchServers = async () => {
    if (!token) return;

    try {
      const response = await axios.get(`${BASE_URL}/servers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('page.js: Fetched servers:', response.data);
      setServers(response.data);
      setError('');
    } catch (err) {
      console.error('page.js: Error fetching servers:', err);
      setError(err.response?.data?.message || 'Failed to fetch servers');
    }
  };

  const createServer = async (e) => {
    e.preventDefault();
    if (!token) return;

    setCreating(true);
    setError('');

    try {
      const response = await axios.post(`${BASE_URL}/servers`, createFormData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('page.js: Server created:', response.data);
      setCreateFormData({ name: '', description: '', icon: '' });
      await fetchServers();
    } catch (err) {
      console.error('page.js: Error creating server:', err);
      setError(err.response?.data?.message || 'Failed to create server');
    } finally {
      setCreating(false);
    }
  };

  const joinServer = async (e) => {
    e.preventDefault();
    if (!token) return;

    setJoining(true);
    setError('');

    try {
      const response = await axios.post(
        `${BASE_URL}/servers/join/${joinFormData.inviteCode}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('page.js: Joined server:', response.data);
      setJoinFormData({ inviteCode: '' });
      await fetchServers();
    } catch (err) {
      console.error('page.js: Error joining server:', err);
      setError(err.response?.data?.message || 'Failed to join server');
    } finally {
      setJoining(false);
    }
  };

  const handleCreateInputChange = (e) => {
    const { name, value } = e.target;
    setCreateFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleJoinInputChange = (e) => {
    const { name, value } = e.target;
    setJoinFormData((prev) => ({ ...prev, [name]: value }));
  };

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#36393f' }}>
      {/* Sidebar */}
      <div style={{ width: '72px', backgroundColor: '#202225', padding: '1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <button
          onClick={() => setActiveView('servers')}
          style={{
            backgroundColor: activeView === 'servers' ? '#5865f2' : '#2f3136',
            color: '#ffffff',
            width: '48px',
            height: '48px',
            borderRadius: activeView === 'servers' ? '15px' : '50%',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className="hover:bg-[#5865f2] hover:rounded-[15px] transition-all"
        >
          🖥️
        </button>
        <button
          onClick={() => setActiveView('friends')}
          style={{
            backgroundColor: activeView === 'friends' ? '#5865f2' : '#2f3136',
            color: '#ffffff',
            width: '48px',
            height: '48px',
            borderRadius: activeView === 'friends' ? '15px' : '50%',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className="hover:bg-[#5865f2] hover:rounded-[15px] transition-all"
        >
          👥
        </button>
        <button
          onClick={() => setActiveView('dms')}
          style={{
            backgroundColor: activeView === 'dms' ? '#5865f2' : '#2f3136',
            color: '#ffffff',
            width: '48px',
            height: '48px',
            borderRadius: activeView === 'dms' ? '15px' : '50%',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className="hover:bg-[#5865f2] hover:rounded-[15px] transition-all"
        >
          💬
        </button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: '1rem' }}>
        <ProfileSection />
        {activeView === 'servers' ? (
          <div style={{ maxWidth: 'calc(100% - 14rem)', margin: '0 auto', paddingTop: '4rem' }}>
            <h1 style={{ color: '#dcddde' }} className="text-2xl font-bold mb-6">Your Servers (Chat App)</h1>

            {error && (
              <div style={{ backgroundColor: '#f04747', borderColor: '#d83c3c' }} className="mb-4 p-3 border rounded-md">
                <p style={{ color: '#ffffff' }} className="text-sm">{error}</p>
              </div>
            )}

            {/* Create Server Form */}
            <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md mb-8">
              <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Create New Server</h2>
              <form onSubmit={createServer} className="space-y-4">
                <div>
                  <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Name (required)</label>
                  <input
                    type="text"
                    name="name"
                    value={createFormData.name}
                    onChange={handleCreateInputChange}
                    style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                    className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                    required
                    minLength={2}
                    maxLength={100}
                    disabled={creating}
                  />
                </div>
                <div>
                  <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Description (optional)</label>
                  <textarea
                    name="description"
                    value={createFormData.description}
                    onChange={handleCreateInputChange}
                    style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                    className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                    maxLength={500}
                    disabled={creating}
                  />
                </div>
                <div>
                  <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Icon URL (optional)</label>
                  <input
                    type="url"
                    name="icon"
                    value={createFormData.icon}
                    onChange={handleCreateInputChange}
                    style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                    className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                    disabled={creating}
                  />
                </div>
                <button
                  type="submit"
                  disabled={creating || !createFormData.name}
                  style={{ backgroundColor: '#5865f2', color: '#ffffff' }}
                  className="w-full py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating...' : 'Create Server'}
                </button>
              </form>
            </div>

            {/* Join Server Form */}
            <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md mb-8">
              <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Join a Server</h2>
              <form onSubmit={joinServer} className="space-y-4">
                <div>
                  <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Invite Code</label>
                  <input
                    type="text"
                    name="inviteCode"
                    value={joinFormData.inviteCode}
                    onChange={handleJoinInputChange}
                    style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                    className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                    placeholder="Enter invite code"
                    required
                    disabled={joining}
                  />
                </div>
                <button
                  type="submit"
                  disabled={joining || !joinFormData.inviteCode}
                  style={{ backgroundColor: '#5865f2', color: '#ffffff' }}
                  className="w-full py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                  {joining ? 'Joining...' : 'Join Server'}
                </button>
              </form>
            </div>

            {/* Servers List */}
            <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md">
              <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Your Servers ({servers.length})</h2>
              {servers.length === 0 ? (
                <p style={{ color: '#72767d' }}>No servers yet. Create or join one above!</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead style={{ backgroundColor: '#202225' }}>
                      <tr>
                        <th style={{ color: '#b9bbbe' }} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Name</th>
                        <th style={{ color: '#b9bbbe' }} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Description</th>
                        <th style={{ color: '#b9bbbe' }} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Members</th>
                        <th style={{ color: '#b9bbbe' }} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Created</th>
                        <th style={{ color: '#b9bbbe' }} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {servers.map((server) => (
                        <tr key={server._id} style={{ backgroundColor: '#2f3136' }} className="hover:bg-[#40444b]">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Link href={`/servers/${server._id}`} style={{ color: '#dcddde' }} className="flex items-center hover:text-[#5865f2]">
                              {server.icon && (
                                <img src={server.icon} alt="Icon" className="h-8 w-8 rounded-full mr-2" />
                              )}
                              {server.name}
                            </Link>
                          </td>
                          <td style={{ color: '#b9bbbe' }} className="px-6 py-4 whitespace-nowrap">{server.description || 'No description'}</td>
                          <td style={{ color: '#b9bbbe' }} className="px-6 py-4 whitespace-nowrap">{server.memberCount}</td>
                          <td style={{ color: '#b9bbbe' }} className="px-6 py-3 whitespace-nowrap">{new Date(server.createdAt).toLocaleDateString()}</td>
                          <td style={{ color: '#b9bbbe' }} className="px-6 py-3 whitespace-nowrap">
                            {server.owner?._id === user.id ? 'Owner' : 'Member'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : activeView === 'friends' ? (
          <FriendsSection user={user} token={token} socket={socket} />
        ) : (
          <DMSection user={user} token={token} socket={socket} />
        )}
      </div>
    </div>
  );
}