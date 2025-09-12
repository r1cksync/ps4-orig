'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '../../authImplementation';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import io from 'socket.io-client';
import ProfileSection from '../../components/ProfileSection';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ServerDetail() {
  const { user, token, loading, isAuthenticated } = useAuth();
  const router = useRouter();
  const { serverId } = useParams();
  const [server, setServer] = useState(null);
  const [members, setMembers] = useState([]);
  const [bannedMembers, setBannedMembers] = useState([]);
  const [channels, setChannels] = useState([]);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '',
  });
  const [newChannel, setNewChannel] = useState({
    name: '',
    type: 'TEXT',
    topic: '',
    nsfw: false,
  });
  const [editingChannel, setEditingChannel] = useState(null);
const [editChannelForm, setEditChannelForm] = useState({
  name: '',
  topic: '',
  nsfw: false,
  position: 0,
  bitrate: 64,
  userLimit: 0,
});
const [updatingChannel, setUpdatingChannel] = useState(false);
const [deletingChannel, setDeletingChannel] = useState({});
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [kicking, setKicking] = useState({});
  const [banning, setBanning] = useState({});

  useEffect(() => {
    if (!loading && isAuthenticated()) {
      fetchServer();
      fetchMembers();
      fetchChannels();
      const socket = io(SOCKET_URL, {
        auth: { token: `Bearer ${token}` },
      });

      socket.on('connect', () => {
        console.log('Socket.IO connected');
        socket.emit('join', `server:${serverId}`);
        socket.emit('join', `user:${user.id}`);
      });

      socket.on('channelCreated', (data) => {
        if (data.serverId === serverId) {
          console.log('Channel created (Socket.IO):', data);
          setChannels((prev) => {
            // Avoid duplicate channels
            const exists = prev.some((ch) => ch._id === data.channel._id);
            if (!exists) {
              return [...prev, data.channel];
            }
            return prev;
          });
        }
      });

      socket.on('channelUpdated', (data) => {
  if (data.serverId === serverId) {
    console.log('Channel updated (Socket.IO):', data);
    setChannels((prev) =>
      prev.map((ch) => (ch._id === data.channel._id ? data.channel : ch))
    );
  }
});

socket.on('channelDeleted', (data) => {
  if (data.serverId === serverId) {
    console.log('Channel deleted (Socket.IO):', data);
    setChannels((prev) => prev.filter((ch) => ch._id !== data.channelId));
  }
});

      socket.on('memberLeft', (data) => {
        if (data.serverId === serverId) {
          setMembers((prev) => prev.filter((member) => member.user._id !== data.userId));
          console.log('Member left:', data);
        }
      });

      socket.on('kickedFromServer', (data) => {
        if (data.serverId === serverId) {
          alert(`You were kicked from ${data.serverName}${data.reason ? `: ${data.reason}` : ''}`);
          router.push('/servers');
        }
      });

      socket.on('memberJoined', (data) => {
        if (data.serverId === serverId) {
          console.log('Member joined:', data);
          fetchMembers();
        }
      });

      socket.on('roleAssigned', (data) => {
        if (data.serverId === serverId) {
          console.log('Role assigned:', data);
          fetchMembers();
          fetchServer();
        }
      });

      socket.on('roleRemoved', (data) => {
        if (data.serverId === serverId) {
          console.log('Role removed:', data);
          fetchMembers();
          fetchServer();
        }
      });

      socket.on('memberBanned', (data) => {
        if (data.serverId === serverId) {
          console.log('Member banned:', data);
          fetchMembers();
          fetchBannedMembers();
        }
      });

      socket.on('memberUnbanned', (data) => {
        if (data.serverId === serverId) {
          console.log('Member unbanned:', data);
          fetchBannedMembers();
        }
      });

      socket.on('bannedFromServer', (data) => {
        if (data.serverId === serverId) {
          alert(`You were banned from ${data.serverName}${data.reason ? `: ${data.reason}` : ''}`);
          router.push('/servers');
        }
      });

      socket.on('connect_error', (err) => {
        console.error('Socket.IO connection error:', err);
      });

      return () => {
        socket.disconnect();
      };
    } else if (!loading && !isAuthenticated()) {
      router.push('/login');
    }
  }, [loading, isAuthenticated, router, serverId, token, user]);

  useEffect(() => {
    if (!loading && isAuthenticated() && server) {
      const isOwner = server.owner?._id === user.id;
      const canBanMembers = isOwner || server.members?.some((m) => 
        m.user._id === user.id && 
        Array.isArray(m.roles) && 
        m.roles.some((r) => r && Array.isArray(r.permissions) && r.permissions.includes('BAN_MEMBERS'))
      );
      if (canBanMembers) {
        fetchBannedMembers();
      }
    }
  }, [loading, isAuthenticated, server, user, token]);

  const fetchServer = async () => {
    if (!token || !serverId) return;
    
    try {
      const response = await axios.get(`${BASE_URL}/servers/${serverId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Fetched server:', response.data);
      setServer({ ...response.data, invites: response.data.invites || [], roles: response.data.roles || [] });
      setFormData({
        name: response.data.name || '',
        description: response.data.description || '',
        icon: response.data.icon || '',
      });
      setError('');
    } catch (err) {
      console.error('Error fetching server:', err);
      setError(err.response?.data?.message || 'Failed to fetch server details');
    }
  };

  const fetchMembers = async () => {
    if (!token || !serverId) return;
    
    try {
      const response = await axios.get(`${BASE_URL}/servers/${serverId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Fetched members:', response.data);
      const uniqueMembers = Array.from(
        new Map(response.data.map((member) => [member.user._id, {
          ...member,
          roles: member.roles || [],
        }])).values()
      );
      setMembers(uniqueMembers);
      setError('');
    } catch (err) {
      console.error('Error fetching members:', err);
      setError(err.response?.data?.message || 'Failed to fetch server members');
    }
  };

  const fetchBannedMembers = async () => {
    if (!token || !serverId) return;
    
    try {
      const response = await axios.get(`${BASE_URL}/servers/${serverId}/bans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Fetched banned members:', response.data);
      setBannedMembers(response.data);
      setError('');
    } catch (err) {
      console.error('Error fetching banned members:', err);
      setError(err.response?.data?.message || 'Failed to fetch banned members');
    }
  };

  const fetchChannels = async () => {
    if (!token || !serverId) return;
    
    try {
      const response = await axios.get(`${BASE_URL}/servers/${serverId}/channels`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Fetched channels:', response.data);
      setChannels(response.data);
      setError('');
    } catch (err) {
      console.error('Error fetching channels:', err);
      setError(err.response?.data?.message || 'Failed to fetch channels');
    }
  };

  const handleEditChannelInputChange = (e) => {
  const { name, value, type, checked } = e.target;
  setEditChannelForm((prev) => ({
    ...prev,
    [name]: type === 'checkbox' ? checked : name === 'position' || name === 'bitrate' || name === 'userLimit' ? Number(value) : value,
  }));
};

const startEditingChannel = (channel) => {
  setEditingChannel(channel);
  setEditChannelForm({
    name: channel.name,
    topic: channel.settings?.topic || '',
    nsfw: channel.settings?.isNsfw || false,
    position: channel.position || 0,
    bitrate: channel.settings?.bitrate || 64,
    userLimit: channel.settings?.userLimit || 0,
  });
};


  const updateChannel = async (e) => {
  e.preventDefault();
  if (!token || !serverId || !editingChannel) return;

  setUpdatingChannel(true);
  setError('');

  try {
    const payload = {
      name: editChannelForm.name.trim(),
      topic: editChannelForm.topic?.trim(),
      nsfw: editChannelForm.nsfw,
      position: editChannelForm.position,
      ...(editingChannel.type === 'VOICE' && {
        bitrate: editChannelForm.bitrate,
        userLimit: editChannelForm.userLimit,
      }),
    };
    const response = await axios.put(
      `${BASE_URL}/channels/${editingChannel._id}`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setChannels((prev) =>
      prev.map((ch) => (ch._id === editingChannel._id ? response.data : ch))
    );
    setEditingChannel(null);
    setEditChannelForm({ name: '', topic: '', nsfw: false, position: 0, bitrate: 64, userLimit: 0 });
    console.log('Channel updated:', response.data);
  } catch (err) {
    console.error('Error updating channel:', err);
    setError(err.response?.data?.message || 'Failed to update channel');
  } finally {
    setUpdatingChannel(false);
  }
};

const deleteChannel = async (channelId, channelName) => {
  if (!token || !serverId) return;
  if (!confirm(`Are you sure you want to delete the channel "${channelName}"?`)) return;

  setDeletingChannel((prev) => ({ ...prev, [channelId]: true }));
  setError('');

  try {
    await axios.delete(`${BASE_URL}/channels/${channelId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setChannels((prev) => prev.filter((ch) => ch._id !== channelId));
    console.log(`Channel ${channelName} deleted`);
  } catch (err) {
    console.error('Error deleting channel:', err);
    setError(err.response?.data?.message || 'Failed to delete channel');
  } finally {
    setDeletingChannel((prev) => ({ ...prev, [channelId]: false }));
  }
};

  const handleBanMember = async (userId, username) => {
    const reason = prompt(`Enter reason for banning ${username} (optional):`);
    if (reason === null) return; // Cancelled

    setBanning((prev) => ({ ...prev, [userId]: true }));
    setError('');

    try {
      await axios.post(
        `${BASE_URL}/servers/${serverId}/bans`,
        { userId, reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`Banned member ${username}`);
      fetchMembers();
      fetchBannedMembers();
    } catch (err) {
      console.error('Error banning member:', err);
      setError(err.response?.data?.message || 'Failed to ban member');
    } finally {
      setBanning((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleUnbanMember = async (userId, username) => {
    if (!confirm(`Are you sure you want to unban ${username}?`)) return;

    setBanning((prev) => ({ ...prev, [userId]: true }));
    setError('');

    try {
      await axios.delete(`${BASE_URL}/servers/${serverId}/bans/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log(`Unbanned member ${username}`);
      fetchBannedMembers();
    } catch (err) {
      console.error('Error unbanning member:', err);
      setError(err.response?.data?.message || 'Failed to unban member');
    } finally {
      setBanning((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const kickMember = async (userId, username) => {
    if (!confirm(`Are you sure you want to kick ${username} from the server?`)) return;

    setKicking((prev) => ({ ...prev, [userId]: true }));
    setError('');

    try {
      await axios.delete(`${BASE_URL}/servers/${serverId}/members/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMembers((prev) => prev.filter((member) => member.user._id !== userId));
      console.log(`Kicked member ${username}`);
    } catch (err) {
      console.error('Error kicking member:', err);
      setError(err.response?.data?.message || 'Failed to kick member');
    } finally {
      setKicking((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const generateInviteCode = async () => {
    if (!token || !serverId) return;
    
    setGeneratingInvite(true);
    setError('');
    
    try {
      const response = await axios.post(
        `${BASE_URL}/servers/${serverId}/invites`,
        { maxUses: 0, maxAge: 0 },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setServer((prev) => ({
        ...prev,
        invites: [...(prev.invites || []), { 
          code: response.data.code, 
          maxUses: 0, 
          uses: 0, 
          maxAge: 0, 
          createdBy: user.id,
          expiresAt: null 
        }],
      }));
      console.log('Invite code generated:', response.data.code);
    } catch (err) {
      console.error('Error generating invite code:', err);
      setError(err.response?.data?.message || 'Failed to generate invite code');
    } finally {
      setGeneratingInvite(false);
    }
  };

  const joinServer = async (e) => {
    e.preventDefault();
    if (!token || !serverId) return;
    
    setJoining(true);
    setError('');
    
    try {
      const response = await axios.post(
        `${BASE_URL}/servers/${serverId}/join`,
        { inviteCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setServer(response.data.server);
      setInviteCode('');
      console.log('Joined server:', response.data);
      fetchMembers();
    } catch (err) {
      console.error('Error joining server:', err);
      setError(err.response?.data?.message || 'Failed to join server');
    } finally {
      setJoining(false);
    }
  };

  const leaveServer = async () => {
    if (!token || !serverId) return;
    if (!confirm('Are you sure you want to leave this server?')) return;
    
    setLeaving(true);
    setError('');
    
    try {
      await axios.post(
        `${BASE_URL}/servers/${serverId}/leave`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Left server');
      router.push('/servers');
    } catch (err) {
      console.error('Error leaving server:', err);
      setError(err.response?.data?.message || 'Failed to leave server');
    } finally {
      setLeaving(false);
    }
  };

  const updateServer = async (e) => {
    e.preventDefault();
    if (!token || !serverId) return;
    
    setUpdating(true);
    setError('');
    
    try {
      const response = await axios.put(`${BASE_URL}/servers/${serverId}`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setServer(response.data);
      console.log('Server updated:', response.data);
    } catch (err) {
      console.error('Error updating server:', err);
      setError(err.response?.data?.message || 'Failed to update server');
    } finally {
      setUpdating(false);
    }
  };

  const deleteServer = async () => {
    if (!token || !serverId) return;
    if (!confirm('Are you sure you want to delete this server? This action cannot be undone.')) return;
    
    setDeleting(true);
    setError('');
    
    try {
      await axios.delete(`${BASE_URL}/servers/${serverId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Server deleted');
      router.push('/servers');
    } catch (err) {
      console.error('Error deleting server:', err);
      setError(err.response?.data?.message || 'Failed to delete server');
    } finally {
      setDeleting(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleChannelInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewChannel((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : name === 'type' ? value.toUpperCase() : value,
    }));
  };

  const createChannel = async (e) => {
    e.preventDefault();
    if (!token || !serverId) return;
    if (!newChannel.name.trim()) {
      setError('Channel name is required');
      return;
    }
    if (newChannel.name.trim().length > 100) {
      setError('Channel name must be 100 characters or less');
      return;
    }
    const validTypes = ['TEXT', 'VOICE', 'CATEGORY', 'NEWS', 'STORE'];
    if (!validTypes.includes(newChannel.type)) {
      setError('Invalid channel type');
      return;
    }
    if (newChannel.topic && newChannel.topic.length > 1024) {
      setError('Topic must be 1024 characters or less');
      return;
    }

    setCreatingChannel(true);
    setError('');

    try {
      const payload = {
        name: newChannel.name.trim(),
        type: newChannel.type,
        serverId,
        settings: {
          topic: newChannel.topic?.trim() || '',
          isNsfw: newChannel.nsfw || false,
          slowMode: 0
        }
      };
      console.log('Creating channel with payload:', payload);
      const response = await axios.post(
        `${BASE_URL}/channels`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Channel creation response:', response.data);
      setChannels((prev) => [...prev, response.data]);
      setNewChannel({
        name: '',
        type: 'TEXT',
        topic: '',
        nsfw: false
      });
      console.log('Channel created:', response.data);
    } catch (err) {
      console.error('Error creating channel:', err);
      console.error('Error details:', err.response?.data);
      setError(err.response?.data?.message || 'Failed to create channel');
    } finally {
      setCreatingChannel(false);
    }
  };

  if (loading) {
    return (
      <div style={{ backgroundColor: '#36393f', minHeight: '100vh' }} className="flex items-center justify-center">
        <div style={{ color: '#dcddde' }} className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user || !server) {
    return (
      <div style={{ backgroundColor: '#36393f', minHeight: '100vh' }} className="flex items-center justify-center">
        <div style={{ color: '#dcddde' }} className="text-lg">Server not found or loading...</div>
      </div>
    );
  }

  console.log('Owner Check:', {
    userId: user.id,
    serverOwnerId: server.owner?._id,
    isOwner: server.owner?._id === user.id,
    types: {
      userId: typeof user.id,
      serverOwnerId: typeof server.owner?._id,
    },
  });

  console.log('Server roles:', server.roles?.map((r) => ({ id: r._id, name: r.name, color: r.color, isDefault: r.isDefault })) || 'No roles');
  console.log('Members data:', members);
  members.forEach((member, index) => {
    console.log(`Member ${index}:`, {
      userId: member.user._id,
      username: member.user.username,
      roles: member.roles?.map((r) => ({ id: r._id, name: r.name, color: r.color })) || [],
      isOwner: server.owner?._id === member.user._id,
    });
  });

  const isMember = server.members?.some((member) => member.user._id === user.id);
  const isOwner = server.owner?._id === user.id;
  const canManageChannels = isOwner || server.members?.some((m) => 
    m.user._id === user.id && 
    Array.isArray(m.roles) && 
    m.roles.some((r) => r && Array.isArray(r.permissions) && r.permissions.includes('MANAGE_CHANNELS'))
  );
  const canManageRoles = isOwner || server.members?.some((m) => 
    m.user._id === user.id && 
    Array.isArray(m.roles) && 
    m.roles.some((r) => r && Array.isArray(r.permissions) && r.permissions.includes('MANAGE_ROLES'))
  );
  const canKickMembers = isOwner || server.members?.some((m) => 
    m.user._id === user.id && 
    Array.isArray(m.roles) && 
    m.roles.some((r) => r && Array.isArray(r.permissions) && r.permissions.includes('KICK_MEMBERS'))
  );
  const canBanMembers = isOwner || server.members?.some((m) => 
    m.user._id === user.id && 
    Array.isArray(m.roles) && 
    m.roles.some((r) => r && Array.isArray(r.permissions) && r.permissions.includes('BAN_MEMBERS'))
  );

  // Dynamically generate roles from members array if server.roles is empty
  const allRoles = Array.from(
    new Map(
      members.flatMap((member) =>
        member.roles.map((role) => [role._id, {
          _id: role._id,
          name: role.name,
          color: role.color,
          position: role.position || 0,
          isDefault: role.name === '@everyone',
        }])
      )
    ).values()
  );

  // Add @everyone role if missing
  if (!allRoles.some((role) => role.isDefault)) {
    allRoles.push({
      _id: 'everyone',
      name: '@everyone',
      color: 10070741,
      position: -1,
      isDefault: true,
    });
  }

  // Sort roles by position (highest to lowest)
  const sortedRoles = allRoles.sort((a, b) => b.position - a.position);

  // Function to convert role color (integer or hex) to CSS-compatible hex string
  const getRoleColor = (color) => {
    if (!color || color === 10) return '#99AAB5';
    if (typeof color === 'string' && color.startsWith('#')) return color;
    if (typeof color === 'number') {
      return '#' + color.toString(16).padStart(6, '0').toUpperCase();
    }
    return '#99AAB5';
  };

  return (
    <div style={{ backgroundColor: '#36393f', minHeight: '100vh', padding: '1rem' }}>
      <ProfileSection />
      <div style={{ maxWidth: 'calc(100% - 14rem)', margin: '0 auto', paddingTop: '4rem' }}>
        <h1 style={{ color: '#dcddde' }} className="text-2xl font-bold mb-6">{server.name} - Server Details</h1>
        
        {error && (
          <div style={{ backgroundColor: '#f04747', borderColor: '#d83c3c' }} className="mb-4 p-3 border rounded-md">
            <p style={{ color: '#ffffff' }} className="text-sm">{error}</p>
          </div>
        )}

        {/* Manual Refresh Button for Debugging */}
        <button
          onClick={() => { fetchServer(); fetchMembers(); if (canBanMembers) fetchBannedMembers(); fetchChannels(); }}
          style={{ backgroundColor: '#5865f2', color: '#ffffff', marginBottom: '1rem' }}
          className="py-2 px-4 rounded-md hover:bg-blue-600"
        >
          Refresh Data
        </button>

        <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md mb-8">
          <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">
            {isMember ? 'Membership' : 'Join Server'}
          </h2>
          {isMember ? (
            <div>
              <p style={{ color: '#b9bbbe' }} className="mb-4">
                {isOwner ? 'You are the server owner.' : 'You are a member of this server.'}
              </p>
              <div className="mb-4">
                <h3 style={{ color: '#dcddde' }} className="text-lg font-semibold mb-2">Invite Codes</h3>
                {server.invites?.length > 0 ? (
                  <ul className="space-y-2">
                    {server.invites.map((invite) => (
                      <li key={invite.code} style={{ color: '#b9bbbe' }}>
                        <strong>Code:</strong> {invite.code} {invite.maxUses ? `(${invite.uses}/${invite.maxUses} uses)` : '(Unlimited)'} {invite.expiresAt ? `(Expires: ${new Date(invite.expiresAt).toLocaleString()})` : '(No expiry)'}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ color: '#72767d' }} className="mb-2">No invite codes available.</p>
                )}
                <button
                  onClick={generateInviteCode}
                  disabled={generatingInvite}
                  style={{ backgroundColor: '#43b581', color: '#ffffff' }}
                  className="mt-2 py-2 px-4 rounded-md hover:bg-green-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                  {generatingInvite ? 'Generating...' : 'Generate Invite Code'}
                </button>
              </div>
              {!isOwner && (
                <button
                  onClick={leaveServer}
                  disabled={leaving}
                  style={{ backgroundColor: '#f04747', color: '#ffffff' }}
                  className="py-2 px-4 rounded-md hover:bg-red-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                  {leaving ? 'Leaving...' : 'Leave Server'}
                </button>
              )}
              {isOwner && (
                <p style={{ color: '#72767d' }} className="text-sm">
                  As the owner, you cannot leave the server. You can delete it instead.
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={joinServer} className="space-y-4">
              <div>
                <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">
                  Invite Code
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                  className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                  placeholder="Enter invite code"
                  required
                  disabled={joining}
                />
              </div>
              <button
                type="submit"
                disabled={joining || !inviteCode}
                style={{ backgroundColor: '#5865f2', color: '#ffffff' }}
                className="w-full py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
              >
                {joining ? 'Joining...' : 'Join Server'}
              </button>
            </form>
          )}
        </div>

        {isOwner && (
          <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md mb-8">
            <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Update Server</h2>
            <form onSubmit={updateServer} className="space-y-4">
              <div>
                <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                  className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                  minLength={2}
                  maxLength={100}
                  disabled={updating}
                />
              </div>
              <div>
                <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                  className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                  maxLength={500}
                  disabled={updating}
                />
              </div>
              <div>
                <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Icon URL</label>
                <input
                  type="url"
                  name="icon"
                  value={formData.icon}
                  onChange={handleInputChange}
                  style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                  className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                  disabled={updating}
                />
              </div>
              <button
                type="submit"
                disabled={updating}
                style={{ backgroundColor: '#5865f2', color: '#ffffff' }}
                className="w-full py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
              >
                {updating ? 'Updating...' : 'Update Server'}
              </button>
            </form>
          </div>
        )}

        {isOwner && (
          <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md mb-8">
            <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Server Information</h2>
            <div style={{ color: '#b9bbbe' }} className="space-y-2">
              <p><strong>Owner:</strong> {server.owner?.displayName || server.owner?.username || 'You'}</p>
              <p><strong>Created At:</strong> {new Date(server.createdAt).toLocaleString()}</p>
            </div>
            <button
              onClick={deleteServer}
              disabled={deleting}
              style={{ backgroundColor: '#f04747', color: '#ffffff' }}
              className="mt-4 py-2 px-4 rounded-md hover:bg-red-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
            >
              {deleting ? 'Deleting...' : 'Delete Server'}
            </button>
          </div>
        )}

        <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md mb-8">
          <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Members ({members.length})</h2>
          {sortedRoles.length === 0 ? (
            <p style={{ color: '#72767d' }}>No roles assigned</p>
          ) : (
            <div className="space-y-6">
              {sortedRoles.map((role) => {
                const roleMembers = role.isDefault
                  ? members
                  : members.filter((member) =>
                      member.roles?.some((r) => String(r._id) === String(role._id))
                    );
                const roleColor = getRoleColor(role.color);
                console.log(`Role: ${role.name}`, {
                  roleId: role._id,
                  memberCount: roleMembers.length,
                  members: roleMembers.map((m) => ({
                    id: m.user._id,
                    username: m.user.username || m.user.displayName,
                    roles: m.roles?.map((r) => r._id) || [],
                  })),
                  color: roleColor,
                });

                return roleMembers.length > 0 ? (
                  <div key={role._id} className="mb-4">
                    <h3
                      style={{
                        color: '#dcddde',
                        backgroundColor: roleColor,
                        padding: '0.5rem',
                        borderRadius: '0.25rem',
                      }}
                      className="text-lg font-semibold mb-2"
                    >
                      {role.name} ({roleMembers.length})
                    </h3>
                    <div
                      style={{
                        border: `2px solid ${roleColor}`,
                        borderRadius: '0.25rem',
                        backgroundColor: '#202225',
                      }}
                    >
                      <ul className="space-y-2 p-4">
                        {roleMembers.map((member) => (
                          <li
                            key={member.user._id}
                            style={{ color: '#dcddde' }}
                            className="flex justify-between items-center"
                          >
                            <div className="flex items-center">
                              {member.user.avatar ? (
                                <img
                                  src={member.user.avatar}
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
                                  {(member.user.username || member.user.displayName)?.[0]?.toUpperCase() || '?'}
                                </div>
                              )}
                              <span>
                                {member.user.displayName || member.user.username}
                                {server.owner?._id === member.user._id && ' (Owner)'}
                                {' (Joined: '}
                                {new Date(member.joinedAt).toLocaleDateString()})
                              </span>
                            </div>
                            <div className="flex space-x-2">
                              {canKickMembers && member.user._id !== user.id && (
                                <button
                                  onClick={() => kickMember(member.user._id, member.user.username || member.user.displayName)}
                                  disabled={kicking[member.user._id]}
                                  style={{
                                    backgroundColor: '#f04747',
                                    color: '#ffffff',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '0.25rem',
                                  }}
                                  className="hover:bg-red-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
                                >
                                  {kicking[member.user._id] ? 'Kicking...' : 'Kick'}
                                </button>
                              )}
                              {canBanMembers && member.user._id !== user.id && (
                                <button
                                  onClick={() => handleBanMember(member.user._id, member.user.username || member.user.displayName)}
                                  disabled={banning[member.user._id]}
                                  style={{
                                    backgroundColor: '#d83c3c',
                                    color: '#ffffff',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '0.25rem',
                                  }}
                                  className="hover:bg-red-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
                                >
                                  {banning[member.user._id] ? 'Banning...' : 'Ban'}
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>

        {canBanMembers && (
          <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md mb-8">
            <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Banned Users ({bannedMembers.length})</h2>
            {bannedMembers.length === 0 ? (
              <p style={{ color: '#72767d' }}>No banned users</p>
            ) : (
              <ul className="space-y-2">
                {bannedMembers.map((ban) => (
                  <li key={ban.user._id} style={{ backgroundColor: '#202225', color: '#dcddde' }} className="p-2 rounded flex justify-between items-center">
                    <span>
                      {ban.user.displayName || ban.user.username}
                      {' (Banned at: '}
                      {new Date(ban.bannedAt).toLocaleString()})
                      {ban.reason && <span style={{ color: '#72767d' }}> - Reason: {ban.reason}</span>}
                    </span>
                    <button
                      onClick={() => handleUnbanMember(ban.user._id, ban.user.username || ban.user.displayName)}
                      disabled={banning[ban.user._id]}
                      style={{ backgroundColor: '#43b581', color: '#ffffff' }}
                      className="py-1 px-2 rounded-md hover:bg-green-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                      {banning[ban.user._id] ? 'Unbanning...' : 'Unban'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md mb-8">
  <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Channels ({channels.length})</h2>
  {isMember && channels.length === 0 ? (
    <p style={{ color: '#72767d' }}>No channels</p>
  ) : isMember ? (
    <ul className="space-y-2">
      {channels.map((channel) => (
        <li key={channel._id} style={{ backgroundColor: '#202225', color: '#dcddde' }} className="p-2 rounded flex justify-between items-center">
          <Link href={`/servers/${serverId}/${channel._id}`}
        style={{ color: '#dcddde', flex: 1 }}
        className="flex items-center">
          <span>
            {channel.name} ({channel.type})
            {channel.settings?.topic && <span style={{ color: '#72767d' }}> - {channel.settings.topic}</span>}
          </span>
          </Link>
          <div className="flex space-x-2">
            {canManageChannels && (
              <>
                <button
                  onClick={() => startEditingChannel(channel)}
                  style={{ backgroundColor: '#5865f2', color: '#ffffff', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}
                  className="hover:bg-blue-600"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteChannel(channel._id, channel.name)}
                  disabled={deletingChannel[channel._id]}
                  style={{ backgroundColor: '#f04747', color: '#ffffff', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}
                  className="hover:bg-red-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                  {deletingChannel[channel._id] ? 'Deleting...' : 'Delete'}
                </button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p style={{ color: '#72767d' }}>You must be a member to view channels</p>
  )}
  {canManageChannels && (
    <>
      <h3 style={{ color: '#dcddde' }} className="text-lg font-semibold mt-6 mb-2">Create Channel</h3>
      <form onSubmit={createChannel} className="space-y-4">
        <div>
          <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Channel Name</label>
          <input
            type="text"
            name="name"
            value={newChannel.name}
            onChange={handleChannelInputChange}
            style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
            className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
            minLength={1}
            maxLength={100}
            required
            disabled={creatingChannel}
          />
        </div>
        <div>
          <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Type</label>
          <select
            name="type"
            value={newChannel.type}
            onChange={handleChannelInputChange}
            style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
            className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
            disabled={creatingChannel}
          >
            <option value="TEXT">Text</option>
            <option value="VOICE">Voice</option>
            <option value="CATEGORY">Category</option>
            <option value="NEWS">News</option>
            <option value="STORE">Store</option>
          </select>
        </div>
        <div>
          <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Topic</label>
          <input
            type="text"
            name="topic"
            value={newChannel.topic}
            onChange={handleChannelInputChange}
            style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
            className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
            maxLength={1024}
            disabled={creatingChannel}
          />
        </div>
        <div>
          <label className="flex items-center" style={{ color: '#b9bbbe' }}>
            <input
              type="checkbox"
              name="nsfw"
              checked={newChannel.nsfw}
              onChange={handleChannelInputChange}
              className="mr-2 rounded"
              disabled={creatingChannel}
            />
            NSFW
          </label>
        </div>
        {newChannel.type === 'VOICE' && (
          <>
            <div>
              <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Bitrate (kbps)</label>
              <input
                type="number"
                name="bitrate"
                value={newChannel.bitrate || 64}
                onChange={handleChannelInputChange}
                style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                min="8"
                max="384"
                disabled={creatingChannel}
              />
            </div>
            <div>
              <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">User Limit</label>
              <input
                type="number"
                name="userLimit"
                value={newChannel.userLimit || 0}
                onChange={handleChannelInputChange}
                style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                min="0"
                max="99"
                disabled={creatingChannel}
              />
            </div>
          </>
        )}
        <button
          type="submit"
          disabled={creatingChannel || !newChannel.name.trim() || newChannel.name.length > 100 || !['TEXT', 'VOICE', 'CATEGORY', 'NEWS', 'STORE'].includes(newChannel.type)}
          style={{ backgroundColor: '#5865f2', color: '#ffffff' }}
          className="w-full py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
        >
          {creatingChannel ? 'Creating...' : 'Create Channel'}
        </button>
      </form>
    </>
  )}
  {canManageChannels && editingChannel && (
    <>
      <h3 style={{ color: '#dcddde' }} className="text-lg font-semibold mt-6 mb-2">Edit Channel: {editingChannel.name}</h3>
      <form onSubmit={updateChannel} className="space-y-4">
        <div>
          <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Channel Name</label>
          <input
            type="text"
            name="name"
            value={editChannelForm.name}
            onChange={handleEditChannelInputChange}
            style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
            className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
            minLength={1}
            maxLength={100}
            required
            disabled={updatingChannel}
          />
        </div>
        <div>
          <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Topic</label>
          <input
            type="text"
            name="topic"
            value={editChannelForm.topic}
            onChange={handleEditChannelInputChange}
            style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
            className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
            maxLength={1024}
            disabled={updatingChannel}
          />
        </div>
        <div>
          <label className="flex items-center" style={{ color: '#b9bbbe' }}>
            <input
              type="checkbox"
              name="nsfw"
              checked={editChannelForm.nsfw}
              onChange={handleEditChannelInputChange}
              className="mr-2 rounded"
              disabled={updatingChannel}
            />
            NSFW
          </label>
        </div>
        <div>
          <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Position</label>
          <input
            type="number"
            name="position"
            value={editChannelForm.position}
            onChange={handleEditChannelInputChange}
            style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
            className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
            min="0"
            disabled={updatingChannel}
          />
        </div>
        {editingChannel.type === 'VOICE' && (
          <>
            <div>
              <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Bitrate (kbps)</label>
              <input
                type="number"
                name="bitrate"
                value={editChannelForm.bitrate}
                onChange={handleEditChannelInputChange}
                style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                min="8"
                max="384"
                disabled={updatingChannel}
              />
            </div>
            <div>
              <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">User Limit</label>
              <input
                type="number"
                name="userLimit"
                value={editChannelForm.userLimit}
                onChange={handleEditChannelInputChange}
                style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                min="0"
                max="99"
                disabled={updatingChannel}
              />
            </div>
          </>
        )}
        <div className="flex space-x-2">
          <button
            type="submit"
            disabled={updatingChannel || !editChannelForm.name.trim() || editChannelForm.name.length > 100}
            style={{ backgroundColor: '#5865f2', color: '#ffffff' }}
            className="w-full py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            {updatingChannel ? 'Updating...' : 'Update Channel'}
          </button>
          <button
            type="button"
            onClick={() => setEditingChannel(null)}
            style={{ backgroundColor: '#72767d', color: '#ffffff' }}
            className="w-full py-2 px-4 rounded-md hover:bg-gray-600"
            disabled={updatingChannel}
          >
            Cancel
          </button>
        </div>
      </form>
    </>
  )}
</div>

        <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md">
          <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Roles ({sortedRoles.length})</h2>
          {sortedRoles.length === 0 ? (
            <p style={{ color: '#72767d' }}>No roles</p>
          ) : (
            <ul className="space-y-2">
              {sortedRoles.map((role) => {
                const roleColor = getRoleColor(role.color);
                return (
                  <li
                    key={role._id}
                    style={{
                      backgroundColor: '#202225',
                      color: roleColor !== '#000000' ? roleColor : '#dcddde',
                      borderLeft: `4px solid ${roleColor}`,
                    }}
                    className="p-2 rounded flex items-center"
                  >
                    <span>{role.name}</span>
                    <span style={{ color: '#72767d', marginLeft: '0.5rem' }}>
                      (Position: {role.position})
                      {role.isDefault && ' (Default)'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {canManageRoles && (
            <Link
              href={`/servers/${serverId}/roles`}
              style={{ backgroundColor: '#5865f2', color: '#ffffff', display: 'inline-block', marginTop: '1rem' }}
              className="py-2 px-4 rounded-md hover:bg-blue-600"
            >
              Manage Roles
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}