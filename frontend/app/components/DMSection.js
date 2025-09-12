'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Helper function to validate MongoDB ObjectId
const isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

export default function DMSection({ user, token, socket }) {
  const [dmChannels, setDMChannels] = useState([]);
  const [error, setError] = useState('');
  const [createDMForm, setCreateDMForm] = useState({
    recipientId: '',
    groupName: '',
    participants: [],
  });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (token) {
      fetchDMChannels();
      if (socket) {
        socket.on('dmChannelCreated', handleDMChannelCreated);
        socket.on('groupDMCreated', handleDMChannelCreated);
        socket.on('groupDMRecipientAdded', handleGroupDMRecipientAdded);
        socket.on('addedToGroupDM', handleAddedToGroupDM);
        socket.on('groupDMRecipientRemoved', handleGroupDMRecipientRemoved);
        socket.on('removedFromGroupDM', handleRemovedFromGroupDM);
        return () => {
          socket.off('dmChannelCreated', handleDMChannelCreated);
          socket.off('groupDMCreated', handleDMChannelCreated);
          socket.off('groupDMRecipientAdded', handleGroupDMRecipientAdded);
          socket.off('addedToGroupDM', handleAddedToGroupDM);
          socket.off('groupDMRecipientRemoved', handleGroupDMRecipientRemoved);
          socket.off('removedFromGroupDM', handleRemovedFromGroupDM);
        };
      }
    }
  }, [token, socket]);

  const fetchDMChannels = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/dms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('DMSection: Fetched DM channels:', response.data.data);
      setDMChannels(response.data.data);
      setError('');
    } catch (err) {
      console.error('DMSection: Error fetching DM channels:', err);
      setError(err.response?.data?.error || 'Failed to fetch DM channels');
    }
  };

  const handleDMChannelCreated = (data) => {
    console.log('DMSection: New DM channel created:', data);
    setDMChannels((prev) => [data.channel, ...prev]);
  };

  const handleGroupDMRecipientAdded = (data) => {
    console.log('DMSection: Group DM recipient added:', data);
    setDMChannels((prev) =>
      prev.map((channel) =>
        channel._id === data.channelId
          ? { ...channel, participants: data.channel.participants }
          : channel
      )
    );
  };

  const handleAddedToGroupDM = (data) => {
    console.log('DMSection: Added to group DM:', data);
    setDMChannels((prev) => [data.channel, ...prev]);
  };

  const handleGroupDMRecipientRemoved = (data) => {
    console.log('DMSection: Group DM recipient removed:', data);
    if (data.isDeleted) {
      setDMChannels((prev) => prev.filter((channel) => channel._id !== data.channelId));
    } else {
      setDMChannels((prev) =>
        prev.map((channel) =>
          channel._id === data.channelId
            ? { ...channel, participants: data.channel.participants }
            : channel
        )
      );
    }
  };

  const handleRemovedFromGroupDM = (data) => {
    console.log('DMSection: Removed from group DM:', data);
    setDMChannels((prev) => prev.filter((channel) => channel._id !== data.channelId));
  };

  const createDMChannel = async (e) => {
    e.preventDefault();
    if (!token) return;

    setIsCreating(true);
    setError('');

    try {
      const payload = createDMForm.recipientId && !createDMForm.participants.length
        ? { recipientId: createDMForm.recipientId }
        : { participants: createDMForm.participants, groupName: createDMForm.groupName };

      // Validate payload
      if (payload.recipientId && !isValidObjectId(payload.recipientId)) {
        throw new Error('Invalid recipient ID format');
      }
      if (payload.participants) {
        if (payload.participants.length < 1 || payload.participants.length > 9) {
          throw new Error('Group DM must have 1-9 additional participants');
        }
        if (payload.participants.some(id => !isValidObjectId(id))) {
          throw new Error('One or more participant IDs are invalid');
        }
        if (payload.participants.includes(user.id)) {
          throw new Error('Cannot include yourself in group DM participants');
        }
      }

      const response = await axios.post(`${BASE_URL}/dms`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('DMSection: Created DM channel:', response.data.data);
      setCreateDMForm({ recipientId: '', groupName: '', participants: [] });
      await fetchDMChannels();
    } catch (err) {
      console.error('DMSection: Error creating DM channel:', err);
      setError(err.response?.data?.error || err.message || 'Failed to create DM channel');
    } finally {
      setIsCreating(false);
    }
  };

  const handleInputChange = (e) => {
    const { value } = e.target;
    // Split input by commas and trim, but only set participants if multiple IDs
    const participants = value.includes(',')
      ? value.split(',').map(id => id.trim()).filter(id => id && isValidObjectId(id))
      : [];
    setCreateDMForm({
      recipientId: value,
      groupName: createDMForm.groupName,
      participants,
    });
  };

  return (
    <div style={{ maxWidth: 'calc(100% - 14rem)', margin: '0 auto', paddingTop: '4rem' }}>
      <h1 style={{ color: '#dcddde' }} className="text-2xl font-bold mb-6">Direct Messages</h1>

      {error && (
        <div style={{ backgroundColor: '#f04747', borderColor: '#d83c3c' }} className="mb-4 p-3 border rounded-md">
          <p style={{ color: '#ffffff' }} className="text-sm">{error}</p>
        </div>
      )}

      {/* Create DM/Group DM Form */}
      <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md mb-8">
        <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Start a Direct Message</h2>
        <form onSubmit={createDMChannel} className="space-y-4">
          <div>
            <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">
              Recipient ID (for 1:1 DM) or Participant IDs (comma-separated for Group DM)
            </label>
            <input
              type="text"
              name="recipientId"
              value={createDMForm.recipientId}
              onChange={handleInputChange}
              style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
              className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
              placeholder="Enter recipient ID or participant IDs"
              disabled={isCreating}
            />
          </div>
          {createDMForm.participants.length > 0 && (
            <div>
              <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">Group Name (optional)</label>
              <input
                type="text"
                name="groupName"
                value={createDMForm.groupName}
                onChange={(e) => setCreateDMForm((prev) => ({ ...prev, groupName: e.target.value }))}
                style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                maxLength={100}
                disabled={isCreating}
              />
            </div>
          )}
          <button
            type="submit"
            disabled={isCreating || (!createDMForm.recipientId && createDMForm.participants.length === 0)}
            style={{ backgroundColor: '#5865f2', color: '#ffffff' }}
            className="w-full py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating...' : createDMForm.participants.length > 0 ? 'Create Group DM' : 'Start DM'}
          </button>
        </form>
      </div>

      {/* DM Channels List */}
      <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md">
        <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Your DMs ({dmChannels.length})</h2>
        {dmChannels.length === 0 ? (
          <p style={{ color: '#72767d' }}>No DMs yet. Start one above!</p>
        ) : (
          <div className="space-y-2">
            {dmChannels.map((channel) => {
              const isGroupDM = channel.type === 'GROUP_DM';
              const otherParticipants = channel.participants.filter((p) => p._id !== user.id);
              const displayName = isGroupDM
                ? channel.name || otherParticipants.map((p) => p.displayName || p.username).join(', ')
                : otherParticipants[0]?.displayName || otherParticipants[0]?.username || 'Unknown';
              return (
                <Link
                  key={channel._id}
                  href={`/dms/${channel._id}`}
                  style={{ backgroundColor: '#40444b' }}
                  className="flex items-center p-3 rounded-md hover:bg-[#5865f2]"
                >
                  <div className="flex items-center space-x-3">
                    {isGroupDM && channel.icon ? (
                      <img src={channel.icon} alt="Group Icon" className="h-8 w-8 rounded-full" />
                    ) : (
                      <div style={{ backgroundColor: '#5865f2' }} className="h-8 w-8 rounded-full flex items-center justify-center">
                        {isGroupDM ? '👥' : '👤'}
                      </div>
                    )}
                    <div>
                      <p style={{ color: '#dcddde' }} className="font-medium">
                        {displayName}
                        {channel.unreadCount > 0 && (
                          <span style={{ backgroundColor: '#f04747' }} className="ml-2 px-2 py-1 rounded-full text-xs text-white">
                            {channel.unreadCount}
                          </span>
                        )}
                      </p>
                      {channel.lastMessage && (
                        <p style={{ color: '#b9bbbe' }} className="text-sm truncate max-w-md">
                          {channel.lastMessage.author?.displayName || 'Unknown'}: {channel.lastMessage.content}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}