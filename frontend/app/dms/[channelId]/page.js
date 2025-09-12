'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../authImplementation';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { io } from 'socket.io-client';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

// Helper function to validate MongoDB ObjectId
const isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

export default function DMChannelPage() {
  const { channelId } = useParams();
  const { user, token, loading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [channel, setChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isRemovingUser, setIsRemovingUser] = useState({});
  const [groupName, setGroupName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [isUpdatingGroup, setIsUpdatingGroup] = useState(false);
  const [isClosingDM, setIsClosingDM] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [replyToMessageId, setReplyToMessageId] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const socketRef = useRef(null);
  const fileInputRef = useRef(null);

  // Scroll to the bottom of the messages list
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!loading && !isAuthenticated()) {
      router.push('/login');
      return;
    }

    if (token && channelId && user) {
      console.log('DMChannelPage: Connecting to Socket.IO URL:', SOCKET_URL);
      const socketInstance = io(SOCKET_URL, {
        auth: { token },
        transports: ['polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        randomizationFactor: 0.2,
        path: '/socket.io',
      });

      socketInstance.on('connect', () => {
        console.log('DMChannelPage: Socket.IO connected', socketInstance.id);
        setSocketConnected(true);
        socketInstance.emit('joinDM', { channelId });
      });

      socketInstance.on('connect_error', (err) => {
        console.error('DMChannelPage: Socket.IO connect error', err.message, err);
        setSocketConnected(false);
      });

      socketInstance.on('disconnect', (reason) => {
        console.log('DMChannelPage: Socket.IO disconnected', reason);
        setSocketConnected(false);
      });

      socketInstance.on('dmMessage', handleNewMessage);
      socketInstance.on('groupDMRecipientAdded', handleGroupDMRecipientAdded);
      socketInstance.on('groupDMRecipientRemoved', handleGroupDMRecipientRemoved);
      socketInstance.on('removedFromGroupDM', handleRemovedFromGroupDM);
      socketInstance.on('groupDMUpdated', handleGroupDMUpdated);
      socketInstance.on('groupDMDeleted', handleGroupDMDeleted);

      socketRef.current = socketInstance;

      fetchChannel();
      fetchMessages();

      return () => {
        socketInstance.emit('leaveDM', { channelId });
        socketInstance.disconnect();
        console.log('DMChannelPage: Socket.IO cleanup');
      };
    }
  }, [loading, isAuthenticated, token, channelId, user, router]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (container.scrollTop === 0 && hasMoreMessages && !isLoadingMessages) {
        fetchMessages(true);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMoreMessages, isLoadingMessages]);

  const fetchChannel = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/dms/${channelId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('DMChannelPage: Fetched channel:', response.data.data);
      setChannel(response.data.data);
      setGroupName(response.data.data.name || '');
      setIconUrl(response.data.data.icon || '');
      setError('');
    } catch (err) {
      console.error('DMChannelPage: Error fetching channel:', err);
      setError(err.response?.data?.error || 'Failed to fetch channel');
      if (err.response?.status === 404) {
        router.push('/servers');
      }
    }
  };

  const fetchMessages = async (loadMore = false) => {
    if (!token || isLoadingMessages) return;

    setIsLoadingMessages(true);
    setError('');

    try {
      const params = { limit: 50 };
      if (loadMore && messages.length > 0) {
        params.before = messages[0]._id; // Oldest message ID
      }

      const response = await axios.get(`${BASE_URL}/dms/${channelId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      console.log('DMChannelPage: Fetched messages:', response.data.data);
      const newMessages = response.data.data;
      setMessages((prev) => (loadMore ? [...newMessages, ...prev] : newMessages));
      setHasMoreMessages(newMessages.length === 50);
      setError('');
    } catch (err) {
      console.error('DMChannelPage: Error fetching messages:', err);
      setError(err.response?.data?.error || 'Failed to fetch messages');
      if (err.response?.status === 404) {
        router.push('/servers');
      }
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${BASE_URL}/dms/${channelId}/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      console.log('DMChannelPage: File uploaded:', response.data.data);
      setSelectedFile(response.data.data.attachment); // Store only attachment metadata
    } catch (err) {
      console.error('DMChannelPage: Error uploading file:', err);
      setError(err.response?.data?.error || 'Failed to upload file');
      setSelectedFile(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = ''; // Reset file input
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const trimmedMessage = newMessage.trim();
    if (!token || (!trimmedMessage && !selectedFile)) {
      setError('Message content or file required');
      return;
    }

    setIsSending(true);
    setError('');

    const nonce = uuidv4();
    try {
      if (selectedFile) {
        // Send message with existing attachment metadata
        const payload = {
          content: trimmedMessage,
          nonce,
          referencedMessageId: replyToMessageId || undefined,
          attachments: [selectedFile], // Send attachment metadata
        };

        const response = await axios.post(
          `${BASE_URL}/dms/${channelId}/messages/with-file`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        console.log('DMChannelPage: Sent message with file:', response.data.data);
        setMessages((prev) => {
          if (prev.some((msg) => msg.nonce === nonce)) return prev;
          return [...prev, response.data.data];
        });
      } else {
        // Send regular message
        const response = await axios.post(
          `${BASE_URL}/dms/${channelId}/messages`,
          { content: trimmedMessage, referencedMessageId: replyToMessageId || undefined, nonce },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log('DMChannelPage: Sent message:', response.data.data);
        setMessages((prev) => {
          if (prev.some((msg) => msg.nonce === nonce)) return prev;
          return [...prev, response.data.data];
        });
      }
      setNewMessage('');
      setSelectedFile(null);
      setReplyToMessageId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error('DMChannelPage: Error sending message:', err);
      setError(err.response?.data?.error || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const addRecipient = async (e) => {
    e.preventDefault();
    if (!token || !addUserId || !isValidObjectId(addUserId)) {
      setError('Please enter a valid user ID');
      return;
    }

    setIsAddingUser(true);
    setError('');

    try {
      const response = await axios.post(
        `${BASE_URL}/dms/${channelId}/recipients`,
        { userId: addUserId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('DMChannelPage: Added recipient:', response.data.data);
      setChannel(response.data.data);
      setAddUserId('');
    } catch (err) {
      console.error('DMChannelPage: Error adding recipient:', err);
      setError(err.response?.data?.error || 'Failed to add recipient');
    } finally {
      setIsAddingUser(false);
    }
  };

  const removeRecipient = async (userId) => {
    if (!token) return;

    setIsRemovingUser((prev) => ({ ...prev, [userId]: true }));
    setError('');

    try {
      const response = await axios.delete(
        `${BASE_URL}/dms/${channelId}/recipients/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('DMChannelPage: Removed recipient:', response.data.data);
      if (response.data.data.isDeleted) {
        router.push('/servers');
      } else {
        setChannel(response.data.data.channel);
      }
    } catch (err) {
      console.error('DMChannelPage: Error removing recipient:', err);
      setError(err.response?.data?.error || 'Failed to remove recipient');
    } finally {
      setIsRemovingUser((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const updateGroupDM = async (e) => {
    e.preventDefault();
    if (!token || (!groupName.trim() && !iconUrl.trim())) return;

    setIsUpdatingGroup(true);
    setError('');

    try {
      const response = await axios.put(
        `${BASE_URL}/dms/${channelId}`,
        { 
          name: groupName.trim() || undefined, 
          icon: iconUrl.trim() || undefined 
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('DMChannelPage: Updated group DM:', response.data.data);
      setChannel(response.data.data);
      setGroupName(response.data.data.name || '');
      setIconUrl(response.data.data.icon || '');
    } catch (err) {
      console.error('DMChannelPage: Error updating group DM:', err);
      setError(err.response?.data?.error || 'Failed to update group DM');
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const closeDM = async () => {
    if (!token) return;

    setIsClosingDM(true);
    setError('');

    try {
      await axios.delete(`${BASE_URL}/dms/${channelId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('DMChannelPage: Closed DM channel');
      router.push('/servers');
    } catch (err) {
      console.error('DMChannelPage: Error closing DM:', err);
      setError(err.response?.data?.error || 'Failed to close DM');
    } finally {
      setIsClosingDM(false);
    }
  };

  const deleteGroupDM = async () => {
    if (!token) return;

    setIsDeletingGroup(true);
    setError('');

    try {
      await axios.delete(`${BASE_URL}/dms/${channelId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('DMChannelPage: Deleted group DM');
      router.push('/servers');
    } catch (err) {
      console.error('DMChannelPage: Error deleting group DM:', err);
      setError(err.response?.data?.error || 'Failed to delete group DM');
    } finally {
      setIsDeletingGroup(false);
    }
  };

  const handleNewMessage = (data) => {
    console.log('DMChannelPage: Received dmMessage event:', { channelId: data.channelId, message: data.message });
    if (data.channelId === channelId) {
      setMessages((prev) => {
        if (prev.some((msg) => msg._id === data.message._id || msg.nonce === data.message.nonce)) {
          console.log('DMChannelPage: Skipped duplicate message:', data.message._id);
          return prev;
        }
        console.log('DMChannelPage: Adding new message:', data.message);
        return [...prev, data.message];
      });
    } else {
      console.log('DMChannelPage: Ignored dmMessage for different channel:', data.channelId);
    }
  };

  const handleGroupDMRecipientAdded = (data) => {
    console.log('DMChannelPage: Group DM recipient added:', data);
    if (data.channelId === channelId) {
      setChannel(data.channel);
    }
  };

  const handleGroupDMRecipientRemoved = (data) => {
    console.log('DMChannelPage: Group DM recipient removed:', data);
    if (data.channelId === channelId) {
      if (data.isDeleted) {
        router.push('/servers');
      } else {
        setChannel(data.channel);
      }
    }
  };

  const handleRemovedFromGroupDM = (data) => {
    console.log('DMChannelPage: Removed from group DM:', data);
    if (data.channelId === channelId) {
      router.push('/servers');
    }
  };

  const handleGroupDMUpdated = (data) => {
    console.log('DMChannelPage: Group DM updated:', data);
    if (data.channelId === channelId) {
      setChannel(data.channel);
      setGroupName(data.channel.name || '');
      setIconUrl(data.channel.icon || '');
    }
  };

  const handleGroupDMDeleted = (data) => {
    console.log('DMChannelPage: Group DM deleted:', data);
    if (data.channelId === channelId) {
      router.push('/servers');
    }
  };

  const handleReply = (messageId) => {
    setReplyToMessageId(messageId);
    document.querySelector('input[type="text"]').focus();
  };

  const renderAttachment = (attachment) => {
    const { contentType, filename, url, size } = attachment;
    const isImage = contentType.startsWith('image/');
    const isVideo = contentType.startsWith('video/');
    const isAudio = contentType.startsWith('audio/');
    const isPDF = contentType === 'application/pdf';

    return (
      <div style={{ marginTop: '0.5rem', maxWidth: '400px' }}>
        {isImage && (
          <img
            src={url}
            alt={filename}
            style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '4px' }}
            onError={(e) => (e.target.src = '/fallback-image.png')} // Fallback for expired/invalid URLs
          />
        )}
        {isVideo && (
          <video
            controls
            src={url}
            style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '4px' }}
            onError={(e) => console.error('Video load error:', e)}
          />
        )}
        {isAudio && (
          <audio
            controls
            src={url}
            style={{ width: '100%' }}
            onError={(e) => console.error('Audio load error:', e)}
          />
        )}
        {isPDF && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#5865f2', textDecoration: 'underline' }}
          >
            {filename} ({(size / 1024 / 1024).toFixed(2)} MB)
          </a>
        )}
        {!isImage && !isVideo && !isAudio && !isPDF && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#5865f2', textDecoration: 'underline' }}
          >
            {filename} ({(size / 1024 / 1024).toFixed(2)} MB)
          </a>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ backgroundColor: '#36393f', minHeight: '100vh' }} className="flex items-center justify-center">
        <div style={{ color: '#dcddde' }} className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user || !channel) {
    return null;
  }

  const isGroupDM = channel.type === 'GROUP_DM';
  const isOwner = channel.owner?._id === user.id;
  const otherParticipants = channel.participants.filter((p) => p._id !== user.id);
  const displayName = isGroupDM
    ? channel.name || otherParticipants.map((p) => p.displayName || p.username).join(', ')
    : otherParticipants[0]?.displayName || otherParticipants[0]?.username || 'Unknown';
  const replyMessage = replyToMessageId ? messages.find((msg) => msg._id === replyToMessageId) : null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#36393f' }}>
      {/* Main Content (Messages) */}
      <div style={{ flex: 3, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-2">
            {isGroupDM && channel.icon && (
              <img src={channel.icon} alt="Group Icon" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
            )}
            <h1 style={{ color: '#dcddde' }} className="text-2xl font-bold">
              {displayName} {isGroupDM ? '(Group DM)' : '(Direct Message)'}
            </h1>
            {!socketConnected && (
              <span style={{ color: '#f04747', fontSize: '0.9rem' }}>(Disconnected from real-time updates)</span>
            )}
          </div>
          {!isGroupDM && (
            <button
              onClick={closeDM}
              disabled={isClosingDM}
              style={{ backgroundColor: '#f04747', color: '#ffffff' }}
              className="py-2 px-4 rounded-md hover:bg-red-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
            >
              {isClosingDM ? 'Closing...' : 'Close DM'}
            </button>
          )}
        </div>

        {error && (
          <div style={{ backgroundColor: '#f04747', borderColor: '#d83c3c' }} className="mb-4 p-3 border rounded-md">
            <p style={{ color: '#ffffff' }} className="text-sm">{error}</p>
          </div>
        )}

        {/* Messages */}
        <div style={{ backgroundColor: '#2f3136', flex: 1 }} className="p-6 rounded-lg shadow-md mb-4">
          <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Messages</h2>
          <div
            ref={messagesContainerRef}
            style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
            className="mb-4"
          >
            {isLoadingMessages && (
              <p style={{ color: '#72767d' }} className="text-center">Loading messages...</p>
            )}
            {messages.length === 0 && !isLoadingMessages ? (
              <p style={{ color: '#72767d' }} className="text-center">No messages yet.</p>
            ) : (
              messages.map((message, index) => (
                <div key={message._id}>
                  {channel.readStatus?.find(rs => rs.user === user.id)?.lastReadMessageId === message._id && (
                    <div style={{ borderTop: '2px solid #5865f2', margin: '10px 0' }}>
                      <p style={{ color: '#5865f2', textAlign: 'center' }}>New Messages</p>
                    </div>
                  )}
                  <div
                    style={{
                      backgroundColor: message.author._id === user.id ? '#40444b' : '#2f3136',
                      marginBottom: '0.5rem',
                      padding: '0.5rem 1rem',
                      borderRadius: '4px',
                    }}
                  >
                    <p style={{ color: '#dcddde' }} className="font-medium">
                      {message.author.displayName || message.author.username}{' '}
                      <span style={{ color: '#72767d' }} className="text-xs">
                        {new Date(message.createdAt).toLocaleString()}
                      </span>
                      <button
                        onClick={() => handleReply(message._id)}
                        style={{ color: '#5865f2', marginLeft: '8px' }}
                        className="text-xs hover:underline"
                      >
                        Reply
                      </button>
                    </p>
                    <p style={{ color: '#b9bbbe' }}>
                      {message.type === 'RECIPIENT_ADD'
                        ? `${message.author.displayName} added someone to the group`
                        : message.type === 'RECIPIENT_REMOVE'
                        ? `${message.author.displayName} removed someone from the group`
                        : message.type === 'CHANNEL_NAME_CHANGE'
                        ? message.content
                        : message.type === 'CHANNEL_ICON_CHANGE'
                        ? `${message.author.displayName} changed the group icon`
                        : message.type === 'SYSTEM'
                        ? message.content
                        : message.content}
                    </p>
                    {message.attachments?.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        {message.attachments.map((attachment) => (
                          <div key={attachment.id}>{renderAttachment(attachment)}</div>
                        ))}
                      </div>
                    )}
                    {message.referencedMessage && (
                      <div
                        style={{
                          backgroundColor: '#202225',
                          padding: '0.5rem',
                          marginTop: '0.5rem',
                          borderLeft: '4px solid #5865f2',
                          borderRadius: '4px',
                        }}
                      >
                        <p style={{ color: '#72767d', fontSize: '0.8rem' }}>
                          {message.referencedMessage.author.displayName || message.referencedMessage.author.username}{' '}
                          <span>{new Date(message.referencedMessage.createdAt).toLocaleString()}</span>
                        </p>
                        <p style={{ color: '#b9bbbe' }}>{message.referencedMessage.content}</p>
                        {message.referencedMessage.attachments?.length > 0 && (
                          <div style={{ marginTop: '0.5rem' }}>
                            {message.referencedMessage.attachments.map((attachment) => (
                              <div key={attachment.id}>{renderAttachment(attachment)}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {message.reactions && message.reactions.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        {message.reactions.map((reaction) => (
                          <span
                            key={reaction._id}
                            style={{ backgroundColor: '#202225', padding: '2px 6px', borderRadius: '4px', marginRight: '4px' }}
                          >
                            {reaction.emoji} {reaction.users.length}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={sendMessage} className="space-y-2">
            {replyToMessageId && replyMessage && (
              <div
                style={{
                  backgroundColor: '#202225',
                  padding: '0.5rem',
                  marginBottom: '0.5rem',
                  borderLeft: '4px solid #5865f2',
                  borderRadius: '4px',
                  width: '100%',
                }}
              >
                <p style={{ color: '#72767d', fontSize: '0.8rem' }}>
                  Replying to {replyMessage.author.displayName || replyMessage.author.username}
                  <button
                    onClick={() => setReplyToMessageId(null)}
                    style={{ color: '#f04747', marginLeft: '8px' }}
                    className="text-xs hover:underline"
                  >
                    Cancel
                  </button>
                </p>
                <p style={{ color: '#b9bbbe' }}>{replyMessage.content}</p>
                {replyMessage.attachments?.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    {replyMessage.attachments.map((attachment) => (
                      <div key={attachment.id}>{renderAttachment(attachment)}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {selectedFile && (
              <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#202225', padding: '0.5rem', borderRadius: '4px' }}>
                <span style={{ color: '#b9bbbe', marginRight: '1rem' }}>
                  {selectedFile.filename} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </span>
                <button
                  onClick={removeFile}
                  style={{ color: '#f04747' }}
                  className="text-xs hover:underline"
                  disabled={uploading}
                >
                  Remove
                </button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', spaceX: '2' }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                accept="image/*,video/*,audio/*,application/pdf,text/plain"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || isSending}
                style={{ backgroundColor: '#5865f2', color: '#ffffff', padding: '0.5rem', marginRight: '0.5rem' }}
                className="rounded-md hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : '📎'}
              </button>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none', flex: 1 }}
                className="rounded-md focus:ring-2 focus:ring-[#5865f2] p-2"
                placeholder="Type a message..."
                disabled={isSending}
                maxLength={2000}
              />
              <button
                type="submit"
                disabled={isSending || (!newMessage.trim() && !selectedFile)}
                style={{ backgroundColor: '#5865f2', color: '#ffffff', marginLeft: '0.5rem' }}
                className="py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
              >
                {isSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Sidebar (Manage Group DM) */}
      {isGroupDM && (
        <div style={{ width: '300px', backgroundColor: '#2f3136', padding: '1rem', borderLeft: '1px solid #202225' }}>
          <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Manage Group DM</h2>
          {isOwner && (
            <>
              <form onSubmit={updateGroupDM} className="space-y-4 mb-4">
                <div>
                  <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">
                    Group Name
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                    className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                    placeholder="Enter group name"
                    maxLength={100}
                    disabled={isUpdatingGroup}
                  />
                </div>
                <div>
                  <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">
                    Group Icon URL
                  </label>
                  <input
                    type="text"
                    value={iconUrl}
                    onChange={(e) => setIconUrl(e.target.value)}
                    style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                    className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                    placeholder="Enter image URL"
                    disabled={isUpdatingGroup}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isUpdatingGroup || (!groupName.trim() && !iconUrl.trim())}
                  style={{ backgroundColor: '#5865f2', color: '#ffffff' }}
                  className="w-full py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                  {isUpdatingGroup ? 'Updating...' : 'Update Group'}
                </button>
              </form>
              <button
                onClick={deleteGroupDM}
                disabled={isDeletingGroup}
                style={{ backgroundColor: '#f04747', color: '#ffffff' }}
                className="w-full py-2 px-4 rounded-md hover:bg-red-600 disabled:bg-gray-500 disabled:cursor-not-allowed mb-4"
              >
                {isDeletingGroup ? 'Deleting...' : 'Delete Group'}
              </button>
            </>
          )}
          <div className="mb-4">
            <h3 style={{ color: '#b9bbbe' }} className="text-sm font-medium">Participants ({channel.participants.length})</h3>
            <ul className="mt-2 space-y-2">
              {channel.participants.map((participant) => (
                <li key={participant._id} className="flex items-center justify-between">
                  <span style={{ color: '#dcddde' }}>
                    {participant.displayName || participant.username} {participant._id === user.id && '(You)'}
                  </span>
                  {participant._id === user.id ? (
                    <button
                      onClick={() => removeRecipient(participant._id)}
                      disabled={isRemovingUser[participant._id]}
                      style={{ backgroundColor: '#f04747', color: '#ffffff' }}
                      className="py-1 px-3 rounded-md hover:bg-red-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                      {isRemovingUser[participant._id] ? 'Leaving...' : 'Leave Group'}
                    </button>
                  ) : isOwner ? (
                    <button
                      onClick={() => removeRecipient(participant._id)}
                      disabled={isRemovingUser[participant._id]}
                      style={{ backgroundColor: '#f04747', color: '#ffffff' }}
                      className="py-1 px-3 rounded-md hover:bg-red-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                      {isRemovingUser[participant._id] ? 'Removing...' : 'Remove'}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          <form onSubmit={addRecipient} className="space-y-4">
            <div>
              <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium">
                Add User (by User ID)
              </label>
              <input
                type="text"
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
                style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
                className="mt-1 block w-full rounded-md focus:ring-2 focus:ring-[#5865f2]"
                placeholder="Enter user ID"
                disabled={isAddingUser}
              />
            </div>
            <button
              type="submit"
              disabled={isAddingUser || !addUserId || !isValidObjectId(addUserId)}
              style={{ backgroundColor: '#5865f2', color: '#ffffff' }}
              className="w-full py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
            >
              {isAddingUser ? 'Adding...' : 'Add User'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}