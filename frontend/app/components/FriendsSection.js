'use client';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import debounce from 'lodash/debounce';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function FriendsSection({ user, token, socket }) {
  const [activeTab, setActiveTab] = useState('all');
  const [friends, setFriends] = useState([]);
  const [error, setError] = useState('');
  const [requestFormData, setRequestFormData] = useState({ username: '', discriminator: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const fetchFriends = useCallback(async () => {
    if (!token || isFetching) return;
    setIsFetching(true);
    try {
      let params = { type: activeTab };
      if (activeTab === 'pending') {
        params = { type: 'pending' };
      }
      const response = await axios.get(`${BASE_URL}/friends`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      console.log('FriendsSection: Fetched friends:', response.data);
      setFriends(response.data);
      setError('');
    } catch (err) {
      console.error('FriendsSection: Error fetching friends:', err);
      setError(err.response?.data?.message || 'Failed to fetch friends');
    } finally {
      setIsFetching(false);
    }
  }, [token, activeTab]);

  const debouncedSearch = useCallback(
    debounce(async (query) => {
      if (!token || query.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      try {
        const response = await axios.get(`${BASE_URL}/friends/search`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { query, limit: 20 },
        });
        console.log('FriendsSection: Search results:', response.data);
        setSearchResults(response.data);
        setError('');
      } catch (err) {
        console.error('FriendsSection: Error searching users:', err);
        setError(err.response?.data?.message || 'Failed to search users');
      }
    }, 500),
    [token]
  );

  const handleSearch = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    debouncedSearch(query);
  };

  useEffect(() => {
    if (!token || !socket || !user) {
      setError('Authentication required');
      return;
    }

    fetchFriends();

    socket.on('connect', () => {
      console.log('FriendsSection: Socket.IO connected', socket.id);
      socket.emit('joinUser', { userId: user?.id });
    });

    socket.on('connect_error', (err) => {
      console.error('FriendsSection: Socket.IO connect error:', err.message);
      setError(`Socket connection failed: ${err.message}`);
    });

    socket.on('friendRequest', (data) => {
      console.log('FriendsSection: Friend request received:', data);
      if (data.type === 'incoming' && activeTab === 'pending') {
        setFriends((prev) => [
          {
            _id: data.friendship._id,
            status: data.friendship.status,
            user: data.friendship.requester,
            isIncoming: true,
            isOutgoing: false,
            createdAt: data.friendship.createdAt,
            updatedAt: data.friendship.updatedAt,
          },
          ...prev,
        ]);
      }
      if (activeTab === 'add') {
        setSearchResults((prev) =>
          prev.map((result) =>
            result._id === data.friendship.requester._id.toString()
              ? { ...result, relationshipStatus: 'incoming' }
              : result
          )
        );
      }
    });

    socket.on('friendRequestAccepted', (data) => {
      console.log('FriendsSection: Friend request accepted:', data);
      if (!data.friendship || !data.friendship.requester || !data.friendship.recipient) {
        console.error('FriendsSection: Invalid friendRequestAccepted data:', data);
        return;
      }
      if (activeTab === 'pending' || activeTab === 'all' || activeTab === 'online') {
        setFriends((prev) => {
          let updated = prev.filter((f) => f._id !== data.friendship._id);
          if (activeTab === 'all' || (activeTab === 'online' && data.friendship.user?.status === 'ONLINE')) {
            updated = [
              {
                _id: data.friendship._id,
                status: 'ACCEPTED',
                user: data.friendship.requester._id === user?.id ? data.friendship.recipient : data.friendship.requester,
                isIncoming: false,
                isOutgoing: false,
                createdAt: data.friendship.createdAt,
                updatedAt: data.friendship.updatedAt,
              },
              ...updated,
            ];
          }
          return updated;
        });
      }
      if (activeTab === 'add') {
        setSearchResults((prev) =>
          prev.map((result) =>
            result._id === (data.friendship.requester._id === user?.id ? data.friendship.recipient._id : data.friendship.requester._id).toString()
              ? { ...result, relationshipStatus: 'friends' }
              : result
          )
        );
      }
    });

    socket.on('friendRequestDeclined', (data) => {
      console.log('FriendsSection: Friend request declined:', data);
      if (activeTab === 'pending') {
        setFriends((prev) => prev.filter((f) => f._id !== data.friendshipId));
      }
      if (activeTab === 'add') {
        setSearchResults((prev) =>
          prev.map((result) =>
            result._id === data.userId?.toString() ? { ...result, relationshipStatus: 'none' } : result
          )
        );
      }
    });

    socket.on('friendRemoved', (data) => {
      console.log('FriendsSection: Friend removed:', data);
      if (activeTab === 'all' || activeTab === 'online') {
        setFriends((prev) => prev.filter((f) => f._id !== data.friendshipId));
      }
      if (activeTab === 'add') {
        setSearchResults((prev) =>
          prev.map((result) =>
            result._id === data.userId?.toString() ? { ...result, relationshipStatus: 'none' } : result
          )
        );
      }
    });

    socket.on('friendRequestCancelled', (data) => {
      console.log('FriendsSection: Friend request cancelled:', data);
      if (activeTab === 'pending') {
        setFriends((prev) => prev.filter((f) => f._id !== data.friendshipId));
      }
      if (activeTab === 'add') {
        setSearchResults((prev) =>
          prev.map((result) =>
            result._id === data.userId?.toString() ? { ...result, relationshipStatus: 'none' } : result
          )
        );
      }
    });

    socket.on('userBlocked', (data) => {
      console.log('FriendsSection: User blocked:', data);
      if (activeTab === 'all' || activeTab === 'online' || activeTab === 'blocked') {
        setFriends((prev) => {
          let updated = prev.filter((f) => f.user._id !== data.blockedBy.toString());
          if (activeTab === 'blocked' && data.blockedBy.toString() !== user?.id) {
            updated = [
              {
                _id: data.friendship._id,
                status: 'BLOCKED',
                user: data.friendship.recipient._id === user?.id ? data.friendship.requester : data.friendship.recipient,
                isIncoming: false,
                isOutgoing: false,
                createdAt: data.friendship.createdAt,
                updatedAt: data.friendship.updatedAt,
              },
              ...updated,
            ];
          }
          return updated;
        });
      }
      if (activeTab === 'add') {
        setSearchResults((prev) => prev.filter((result) => result._id !== data.friendship.recipient._id.toString()));
      }
    });

    socket.on('userUnblocked', (data) => {
      console.log('FriendsSection: User unblocked:', data);
      if (activeTab === 'blocked') {
        setFriends((prev) => prev.filter((f) => f.user._id !== data.unblockedBy.toString()));
      }
      if (activeTab === 'add') {
        debouncedSearch(searchQuery);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('friendRequest');
      socket.off('friendRequestAccepted');
      socket.off('friendRequestDeclined');
      socket.off('friendRemoved');
      socket.off('friendRequestCancelled');
      socket.off('userBlocked');
      socket.off('userUnblocked');
      debouncedSearch.cancel();
    };
  }, [token, socket, activeTab, user?.id, fetchFriends]);

  const handleSendRequest = async (arg1, arg2) => {
    let username, discriminator;
    let isEvent = arg1 && typeof arg1.preventDefault === 'function';

    if (isEvent) {
      arg1.preventDefault();
      username = requestFormData.username;
      discriminator = requestFormData.discriminator;
    } else {
      username = arg1;
      discriminator = arg2;
    }

    if (!token || !username || !discriminator) return;

    setSendingRequest(true);
    setError('');

    try {
      const response = await axios.post(
        `${BASE_URL}/friends/request`,
        { username, discriminator },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('FriendsSection: Friend request sent:', response.data);
      if (isEvent) {
        setRequestFormData({ username: '', discriminator: '' });
      }
      setSearchResults((prev) =>
        prev.map((result) =>
          result.username === username && result.discriminator === discriminator
            ? { ...result, relationshipStatus: 'outgoing' }
            : result
        )
      );
      if (activeTab === 'pending') {
        setFriends((prev) => [
          {
            _id: response.data.friendship._id,
            status: response.data.friendship.status,
            user: response.data.friendship.recipient,
            isIncoming: false,
            isOutgoing: true,
            createdAt: response.data.friendship.createdAt,
            updatedAt: response.data.friendship.updatedAt,
          },
          ...prev,
        ]);
      }
      setError('');
    } catch (err) {
      console.error('FriendsSection: Error sending friend request:', err);
      setError(err.response?.data?.message || 'Failed to send friend request');
    } finally {
      setSendingRequest(false);
    }
  };

  const handleAcceptRequest = async (friendshipId) => {
    try {
      const response = await axios.put(
        `${BASE_URL}/friends/${friendshipId}/accept`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('FriendsSection: Friend request accepted:', response.data);
      setFriends((prev) =>
        prev.map((f) =>
          f._id === friendshipId
            ? { ...f, status: 'ACCEPTED', isIncoming: false, isOutgoing: false }
            : f
        )
      );
      setError('');
    } catch (err) {
      console.error('FriendsSection: Error accepting friend request:', err);
      setError(err.response?.data?.message || 'Failed to accept friend request');
    }
  };

  const handleDeclineRequest = async (friendshipId) => {
    try {
      const response = await axios.put(
        `${BASE_URL}/friends/${friendshipId}/decline`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('FriendsSection: Friend request declined:', response.data);
      setFriends((prev) => prev.filter((f) => f._id !== friendshipId));
      setError('');
    } catch (err) {
      console.error('FriendsSection: Error declining friend request:', err);
      setError(err.response?.data?.message || 'Failed to decline friend request');
    }
  };

  const handleRemoveFriendOrCancelRequest = async (friendshipId) => {
    try {
      const response = await axios.delete(`${BASE_URL}/friends/${friendshipId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('FriendsSection: Friend or request removed:', response.data);
      setFriends((prev) => prev.filter((f) => f._id !== friendshipId));
      setError('');
    } catch (err) {
      console.error('FriendsSection: Error removing friend or canceling request:', err);
      setError(err.response?.data?.message || 'Failed to remove friend or cancel request');
    }
  };

  const handleBlockUser = async (userId, friendshipId) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/friends/${userId}/block`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('FriendsSection: User blocked:', response.data);
      setFriends((prev) => {
        let updated = prev.filter((f) => f._id !== friendshipId);
        if (activeTab === 'blocked') {
          updated = [
            {
              _id: response.data.friendship._id,
              status: 'BLOCKED',
              user: response.data.friendship.recipient,
              isIncoming: false,
              isOutgoing: false,
              createdAt: response.data.friendship.createdAt,
              updatedAt: response.data.friendship.updatedAt,
            },
            ...updated,
          ];
        }
        return updated;
      });
      setSearchResults((prev) => prev.filter((result) => result._id !== userId));
      setError('');
    } catch (err) {
      console.error('FriendsSection: Error blocking user:', err);
      setError(err.response?.data?.message || 'Failed to block user');
    }
  };

  const handleUnblockUser = async (userId, friendshipId) => {
    try {
      const response = await axios.delete(`${BASE_URL}/friends/${userId}/unblock`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('FriendsSection: User unblocked:', response.data);
      setFriends((prev) => prev.filter((f) => f._id !== friendshipId));
      setError('');
      debouncedSearch(searchQuery);
    } catch (err) {
      console.error('FriendsSection: Error unblocking user:', err);
      setError(err.response?.data?.message || 'Failed to unblock user');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setRequestFormData((prev) => ({ ...prev, [name]: value }));
  };

  const filteredFriends =
    activeTab === 'all'
      ? friends.filter((f) => f.status === 'ACCEPTED')
      : activeTab === 'online'
      ? friends.filter((f) => f.status === 'ACCEPTED' && f.user.status === 'ONLINE')
      : activeTab === 'pending'
      ? friends.filter((f) => f.status === 'PENDING')
      : friends.filter((f) => f.status === 'BLOCKED');

  const incomingRequests = filteredFriends.filter((f) => f.status === 'PENDING' && f.isIncoming);
  const outgoingRequests = filteredFriends.filter((f) => f.status === 'PENDING' && f.isOutgoing);

  return (
    <div style={{ maxWidth: 'calc(100% - 14rem)', margin: '0 auto', paddingTop: '4rem' }}>
      <h1 style={{ color: '#dcddde' }} className="text-2xl font-bold mb-6">Friends</h1>

      {error && (
        <div style={{ backgroundColor: '#f04747', borderColor: '#d83c3c' }} className="mb-4 p-3 border rounded-md">
          <p style={{ color: '#ffffff' }} className="text-sm">{error}</p>
        </div>
      )}

      <div style={{ backgroundColor: '#2f3136' }} className="p-4 rounded-lg shadow-md mb-6">
        <div className="flex space-x-4 border-b border-[#202225]">
          {['all', 'online', 'pending', 'blocked', 'add'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{ color: activeTab === tab ? '#dcddde' : '#72767d', borderBottom: activeTab === tab ? '2px solid #5865f2' : 'none' }}
              className="pb-2 px-4 text-sm font-medium hover:text-[#dcddde]"
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'add' ? (
        <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md">
          <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Add Friend</h2>
          <form onSubmit={handleSendRequest} className="space-y-4">
            <div>
              <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">
                Username#Discriminator (e.g., praveen#3087)
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  name="username"
                  value={requestFormData.username}
                  onChange={handleInputChange}
                  placeholder="Username"
                  style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                  className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                  required
                  disabled={sendingRequest}
                />
                <input
                  type="text"
                  name="discriminator"
                  value={requestFormData.discriminator}
                  onChange={handleInputChange}
                  placeholder="0000"
                  style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none', width: '100px' }}
                  className="mt-1 block rounded-md focus:ring-2 focus:ring-[#5865f2]"
                  pattern="\d{4}"
                  required
                  disabled={sendingRequest}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={sendingRequest || !requestFormData.username || !requestFormData.discriminator}
              style={{ backgroundColor: '#5865f2', color: '#ffffff' }}
              className="w-full py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
            >
              {sendingRequest ? 'Sending...' : 'Send Friend Request'}
            </button>
          </form>
          <div className="mt-6">
            <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">
              Search Users (username, display name, or email)
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search for users..."
              style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
              className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2] p-2"
            />
            {searchQuery.length >= 2 && searchResults.length === 0 && (
              <p style={{ color: '#72767d' }} className="text-sm mt-2">No users found.</p>
            )}
            {searchResults.length > 0 && (
              <div className="space-y-2 mt-4">
                <h3 style={{ color: '#dcddde' }} className="text-lg font-semibold">Search Results</h3>
                {searchResults.map((result) => (
                  <div
                    key={result._id}
                    style={{ backgroundColor: '#40444b', border: '1px solid #202225' }}
                    className="p-3 rounded-md flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <img
                        src={result.avatar || '/default-avatar.png'}
                        alt={result.displayName || result.username}
                        style={{ width: '40px', height: '40px', borderRadius: '50%' }}
                      />
                      <div>
                        <p style={{ color: '#dcddde' }} className="text-sm font-semibold">
                          {result.displayName || result.username}#{result.discriminator}
                        </p>
                        <p style={{ color: '#72767d' }} className="text-xs">Status: {result.status}</p>
                      </div>
                    </div>
                    <div>
                      {result.relationshipStatus === 'none' && (
                        <button
                          onClick={() => handleSendRequest(result.username, result.discriminator)}
                          disabled={sendingRequest}
                          style={{ backgroundColor: '#5865f2', color: '#ffffff' }}
                          className="py-1 px-3 rounded-md hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
                        >
                          {sendingRequest ? 'Sending...' : 'Add Friend'}
                        </button>
                      )}
                      {result.relationshipStatus === 'friends' && (
                        <button
                          disabled
                          style={{ backgroundColor: '#4f545c', color: '#ffffff' }}
                          className="py-1 px-3 rounded-md"
                        >
                          Already Friends
                        </button>
                      )}
                      {result.relationshipStatus === 'incoming' && (
                        <button
                          disabled
                          style={{ backgroundColor: '#4f545c', color: '#ffffff' }}
                          className="py-1 px-3 rounded-md"
                        >
                          Request Received
                        </button>
                      )}
                      {result.relationshipStatus === 'outgoing' && (
                        <button
                          disabled
                          style={{ backgroundColor: '#4f545c', color: '#ffffff' }}
                          className="py-1 px-3 rounded-md"
                        >
                          Request Sent
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md">
          <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">
            {activeTab === 'all' ? 'All Friends' : activeTab === 'online' ? 'Online' : activeTab === 'pending' ? 'Pending Requests' : 'Blocked Users'} ({filteredFriends.length})
          </h2>
          {filteredFriends.length === 0 ? (
            <p style={{ color: '#72767d' }}>
              {activeTab === 'all' || activeTab === 'online'
                ? 'No friends yet. Add some friends!'
                : activeTab === 'pending'
                ? 'No pending requests.'
                : 'No blocked users.'}
            </p>
          ) : activeTab === 'pending' ? (
            <div className="space-y-6">
              <div>
                <h3 style={{ color: '#dcddde' }} className="text-lg font-semibold mb-2">Received ({incomingRequests.length})</h3>
                {incomingRequests.length === 0 ? (
                  <p style={{ color: '#72767d' }} className="text-sm">No incoming requests.</p>
                ) : (
                  <div className="space-y-2">
                    {incomingRequests.map((friendship) => (
                      <div
                        key={friendship._id}
                        style={{ backgroundColor: '#40444b', border: '1px solid #202225' }}
                        className="p-3 rounded-md flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-3">
                          <img
                            src={friendship.user.avatar || '/default-avatar.png'}
                            alt={friendship.user.displayName || friendship.user.username}
                            style={{ width: '40px', height: '40px', borderRadius: '50%' }}
                          />
                          <div>
                            <p style={{ color: '#dcddde' }} className="text-sm font-semibold">
                              {friendship.user.displayName || friendship.user.username}#{friendship.user.discriminator}
                            </p>
                            <p style={{ color: '#72767d' }} className="text-xs">Incoming Request</p>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleAcceptRequest(friendship._id)}
                            style={{ backgroundColor: '#5865f2', color: '#ffffff' }}
                            className="py-1 px-3 rounded-md hover:bg-blue-600"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleDeclineRequest(friendship._id)}
                            style={{ backgroundColor: '#f04747', color: '#ffffff' }}
                            className="py-1 px-3 rounded-md hover:bg-red-600"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3 style={{ color: '#dcddde' }} className="text-lg font-semibold mb-2">Sent ({outgoingRequests.length})</h3>
                {outgoingRequests.length === 0 ? (
                  <p style={{ color: '#72767d' }} className="text-sm">No outgoing requests.</p>
                ) : (
                  <div className="space-y-2">
                    {outgoingRequests.map((friendship) => (
                      <div
                        key={friendship._id}
                        style={{ backgroundColor: '#40444b', border: '1px solid #202225' }}
                        className="p-3 rounded-md flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-3">
                          <img
                            src={friendship.user.avatar || '/default-avatar.png'}
                            alt={friendship.user.displayName || friendship.user.username}
                            style={{ width: '40px', height: '40px', borderRadius: '50%' }}
                          />
                          <div>
                            <p style={{ color: '#dcddde' }} className="text-sm font-semibold">
                              {friendship.user.displayName || friendship.user.username}#{friendship.user.discriminator}
                            </p>
                            <p style={{ color: '#72767d' }} className="text-xs">Outgoing Request</p>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleRemoveFriendOrCancelRequest(friendship._id)}
                            style={{ backgroundColor: '#f04747', color: '#ffffff' }}
                            className="py-1 px-3 rounded-md hover:bg-red-600"
                          >
                            Cancel Request
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFriends.map((friendship) => (
                <div
                  key={friendship._id}
                  style={{ backgroundColor: '#40444b', border: '1px solid #202225' }}
                  className="p-3 rounded-md flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <img
                      src={friendship.user.avatar || '/default-avatar.png'}
                      alt={friendship.user.displayName || friendship.user.username}
                      style={{ width: '40px', height: '40px', borderRadius: '50%' }}
                    />
                    <div>
                      <p style={{ color: '#dcddde' }} className="text-sm font-semibold">
                        {friendship.user.displayName || friendship.user.username}#{friendship.user.discriminator}
                      </p>
                      <p style={{ color: '#72767d' }} className="text-xs">
                        {friendship.status === 'ACCEPTED'
                          ? `Status: ${friendship.user.status}`
                          : 'Blocked'}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {friendship.status === 'ACCEPTED' && (
                      <>
                        <button
                          onClick={() => handleRemoveFriendOrCancelRequest(friendship._id)}
                          style={{ backgroundColor: '#f04747', color: '#ffffff' }}
                          className="py-1 px-3 rounded-md hover:bg-red-600"
                        >
                          Remove Friend
                        </button>
                        <button
                          onClick={() => handleBlockUser(friendship.user._id, friendship._id)}
                          style={{ backgroundColor: '#747f8d', color: '#ffffff' }}
                          className="py-1 px-3 rounded-md hover:bg-gray-600"
                        >
                          Block
                        </button>
                      </>
                    )}
                    {friendship.status === 'BLOCKED' && (
                      <button
                        onClick={() => handleUnblockUser(friendship.user._id, friendship._id)}
                        style={{ backgroundColor: '#5865f2', color: '#ffffff' }}
                        className="py-1 px-3 rounded-md hover:bg-blue-600"
                      >
                        Unblock
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}