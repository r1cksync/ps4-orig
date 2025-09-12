'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '../authImplementation';
import axios from 'axios';
import io from 'socket.io-client';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ProfileSection() {
  const { user, token, logout, setUser } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '', avatar: '' });
  const [status, setStatus] = useState(user?.status || 'OFFLINE');
  const [error, setError] = useState('');

  useEffect(() => {
    if (user && user.id) {
      console.log('ProfileSection userId:', user.id);
    }

    if (token && user) {
      const socket = io(SOCKET_URL, {
        auth: { token: `Bearer ${token}` },
      });

      socket.on('connect', () => {
        socket.emit('join', `user:${user.id}`);
      });

      socket.on('friendStatusUpdate', (data) => {
        if (data.userId === user.id) {
          setUser((prev) => ({ ...prev, status: data.status, customStatus: data.customStatus }));
          setStatus(data.status);
        }
      });

      socket.on('connect_error', (err) => {
        console.error('Socket.IO connection error:', err);
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [token, user, setUser]);

  const toggleDropdown = () => {
    setIsDropdownOpen((prev) => !prev);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const response = await axios.put(
        `${BASE_URL}/auth/profile`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUser(response.data.data);
      setIsEditing(false);
      setFormData({ name: '', avatar: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
    }
  };

  const handleChangeStatus = async (newStatus) => {
    setError('');
    try {
      await axios.put(
        `${BASE_URL}/auth/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUser((prev) => ({ ...prev, status: newStatus }));
      setStatus(newStatus);
      setIsDropdownOpen(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update status');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(
        `${BASE_URL}/auth/logout`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      logout();
    } catch (err) {
      console.error('Error logging out:', err);
    }
  };

  const handleEditClick = () => {
    setIsEditing(true);
    setFormData({ name: user.name || '', avatar: user.avatar || '' });
    setIsDropdownOpen(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  if (!user) {
    return null;
  }

  return (
    <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 1000 }}>
      <div style={{ position: 'relative' }}>
        <button
          onClick={toggleDropdown}
          style={{
            backgroundColor: '#2f3136',
            color: '#dcddde',
            display: 'flex',
            alignItems: 'center',
            padding: '0.5rem',
            borderRadius: '0.375rem',
            border: 'none',
          }}
          className="hover:bg-[#40444b]"
        >
          {user.avatar ? (
            <img
              src={user.avatar}
              alt="Avatar"
              style={{ width: '2rem', height: '2rem', borderRadius: '50%', marginRight: '0.5rem' }}
            />
          ) : (
            <div
              style={{
                width: '2rem',
                height: '2rem',
                borderRadius: '50%',
                backgroundColor: '#72767d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '0.5rem',
              }}
            >
              {user.username?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <span>{user.username}#{user.discriminator}</span>
          <span
            style={{
              width: '0.5rem',
              height: '0.5rem',
              borderRadius: '50%',
              backgroundColor:
                user.status === 'ONLINE' ? '#43b581' :
                user.status === 'IDLE' ? '#faa61a' :
                user.status === 'DND' ? '#f04747' :
                '#72767d',
              marginLeft: '0.5rem',
            }}
          />
        </button>

        {isDropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              backgroundColor: '#2f3136',
              borderRadius: '0.375rem',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              width: '12rem',
              marginTop: '0.5rem',
            }}
          >
            <div style={{ padding: '0.5rem', color: '#dcddde' }}>
              <p>{user.displayName || user.username}</p>
              <p style={{ color: '#72767d', fontSize: '0.875rem' }}>{user.email}</p>
              <p style={{ color: '#72767d', fontSize: '0.875rem' }}>
                Status: {user.status || 'OFFLINE'}
              </p>
            </div>
            <hr style={{ borderColor: '#202225' }} />
            <div style={{ padding: '0.5rem' }}>
              <button
                onClick={handleEditClick}
                style={{ color: '#dcddde', background: 'none', border: 'none', width: '100%', textAlign: 'left', padding: '0.5rem' }}
                className="hover:bg-[#40444b]"
              >
                Edit Profile
              </button>
              <button
                onClick={() => handleChangeStatus('ONLINE')}
                style={{ color: '#dcddde', background: 'none', border: 'none', width: '100%', textAlign: 'left', padding: '0.5rem' }}
                className="hover:bg-[#40444b]"
              >
                Set Status: Online
              </button>
              <button
                onClick={() => handleChangeStatus('IDLE')}
                style={{ color: '#dcddde', background: 'none', border: 'none', width: '100%', textAlign: 'left', padding: '0.5rem' }}
                className="hover:bg-[#40444b]"
              >
                Set Status: Idle
              </button>
              <button
                onClick={() => handleChangeStatus('DND')}
                style={{ color: '#dcddde', background: 'none', border: 'none', width: '100%', textAlign: 'left', padding: '0.5rem' }}
                className="hover:bg-[#40444b]"
              >
                Set Status: Do Not Disturb
              </button>
              <button
                onClick={() => handleChangeStatus('INVISIBLE')}
                style={{ color: '#dcddde', background: 'none', border: 'none', width: '100%', textAlign: 'left', padding: '0.5rem' }}
                className="hover:bg-[#40444b]"
              >
                Set Status: Invisible
              </button>
              <button
                onClick={handleLogout}
                style={{ color: '#f04747', background: 'none', border: 'none', width: '100%', textAlign: 'left', padding: '0.5rem' }}
                className="hover:bg-[#40444b]"
              >
                Logout
              </button>
            </div>
          </div>
        )}

        {isEditing && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              backgroundColor: '#2f3136',
              borderRadius: '0.375rem',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              width: '16rem',
              padding: '1rem',
              marginTop: '0.5rem',
            }}
          >
            <h3 style={{ color: '#dcddde', marginBottom: '1rem' }}>Edit Profile</h3>
            {error && (
              <p style={{ color: '#f04747', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{error}</p>
            )}
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label style={{ color: '#b9bbbe', fontSize: '0.875rem' }}>Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none', borderRadius: '0.25rem', padding: '0.5rem', width: '100%' }}
                  className="focus:ring-2 focus:ring-[#5865f2]"
                />
              </div>
              <div>
                <label style={{ color: '#b9bbbe', fontSize: '0.875rem' }}>Avatar URL</label>
                <input
                  type="url"
                  name="avatar"
                  value={formData.avatar}
                  onChange={handleInputChange}
                  style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none', borderRadius: '0.25rem', padding: '0.5rem', width: '100%' }}
                  className="focus:ring-2 focus:ring-[#5865f2]"
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="submit"
                  style={{ backgroundColor: '#5865f2', color: '#ffffff', padding: '0.5rem', borderRadius: '0.25rem', flex: 1 }}
                  className="hover:bg-blue-600"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  style={{ backgroundColor: '#72767d', color: '#ffffff', padding: '0.5rem', borderRadius: '0.25rem', flex: 1 }}
                  className="hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}