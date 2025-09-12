'use client';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function DMMessageSection({ channelId, token, socket, user }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState('');
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [replyToMessageId, setReplyToMessageId] = useState(null);
  const messageEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const joinAttemptsRef = useRef(0);

  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!token || !channelId || !socket || !user) {
      console.error('DMMessageSection: Missing token, channelId, socket, or user:', { token, channelId, socket, user });
      setError('Missing required parameters');
      return;
    }

    console.log('DMMessageSection: Connecting to DM channel', channelId);
    const joinDMChannel = () => {
      if (joinAttemptsRef.current < 5) {
        console.log(`DMMessageSection: Attempting to join DM channel ${channelId} (Attempt ${joinAttemptsRef.current + 1})`);
        socket.emit('joinDM', { channelId });
        joinAttemptsRef.current += 1;
      }
    };

    socket.on('connect', () => {
      console.log('DMMessageSection: Socket.IO connected', socket.id);
      joinAttemptsRef.current = 0;
      joinDMChannel();
      setError('');
    });

    socket.on('connect_error', (err) => {
      console.error('DMMessageSection: Socket.IO connect error', err.message, err);
      setError(`Socket connection failed: ${err.message}`);
    });

    socket.on('disconnect', (reason) => {
      console.log('DMMessageSection: Socket.IO disconnected', reason);
      setError('Socket disconnected. Reconnecting...');
    });

    socket.on('dmChannelJoined', (data) => {
      console.log('DMMessageSection: Joined DM channel', data);
      joinAttemptsRef.current = 5; // Stop retries on success
      setError('');
    });

    socket.on('error', (data) => {
      console.error('DMMessageSection: DM channel join error', data);
      setError(data.message || 'Failed to join DM channel');
    });

    socket.on('dmMessage', (data) => {
      if (data.channelId === channelId) {
        console.log('DMMessageSection: New message received', data.message);
        setMessages((prev) => {
          if (prev.some((msg) => msg._id === data.message._id || msg.nonce === data.message.nonce)) {
            console.log('DMMessageSection: Skipped duplicate message:', data.message._id);
            return prev;
          }
          return [...prev, data.message];
        });
      }
    });

    // Retry joinDM every 2 seconds if not joined
    const retryInterval = setInterval(() => {
      if (joinAttemptsRef.current < 5 && socket.connected) {
        joinDMChannel();
      }
    }, 2000);

    joinDMChannel(); // Initial join attempt
    fetchMessages();

    return () => {
      socket.off('dmMessage');
      socket.off('connect');
      socket.off('connect_error');
      socket.off('disconnect');
      socket.off('dmChannelJoined');
      socket.off('error');
      socket.emit('leaveDM', { channelId });
      clearInterval(retryInterval);
      console.log('DMMessageSection: Disconnected from DM channel', channelId);
    };
  }, [channelId, token, socket, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (container.scrollTop === 0 && hasMoreMessages && !loadingMessages) {
        fetchMessages(true);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMoreMessages, loadingMessages]);

  const fetchMessages = async (loadMore = false) => {
    if (!token || loadingMessages) return;

    setLoadingMessages(true);
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
      console.log('DMMessageSection: Fetched messages:', response.data.data);
      const newMessages = response.data.data;
      setMessages((prev) => (loadMore ? [...newMessages, ...prev] : newMessages));
      setHasMoreMessages(newMessages.length === 50);
      setError('');
    } catch (err) {
      console.error('DMMessageSection: Error fetching messages:', err);
      setError(err.response?.data?.error || 'Failed to fetch messages');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const trimmedMessage = newMessage.trim();
    if (!token || !channelId || !trimmedMessage) {
      setError('Message required');
      return;
    }

    setSendingMessage(true);
    setError('');

    const nonce = uuidv4();
    try {
      const response = await axios.post(
        `${BASE_URL}/dms/${channelId}/messages`,
        { content: trimmedMessage, referencedMessageId: replyToMessageId || undefined, nonce },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('DMMessageSection: Sent message:', response.data.data);
      setMessages((prev) => {
        if (prev.some((msg) => msg.nonce === nonce)) return prev;
        return [...prev, response.data.data];
      });
      setNewMessage('');
      setReplyToMessageId(null);
    } catch (err) {
      console.error('DMMessageSection: Error sending message:', err);
      setError(err.response?.data?.error || 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleReply = (messageId) => {
    setReplyToMessageId(messageId);
    document.querySelector('input[type="text"]').focus();
  };

  const replyMessage = replyToMessageId ? messages.find((msg) => msg._id === replyToMessageId) : null;

  return (
    <div style={{ backgroundColor: '#2f3136', flex: 1 }} className="p-6 rounded-lg shadow-md mb-4">
      <h2 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">Messages</h2>
      <div
        ref={messagesContainerRef}
        style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
        className="mb-4"
      >
        {loadingMessages && (
          <p style={{ color: '#72767d' }} className="text-center">Loading messages...</p>
        )}
        {messages.length === 0 && !loadingMessages ? (
          <p style={{ color: '#72767d' }} className="text-center">No messages yet.</p>
        ) : (
          messages.map((message) => (
            <div key={message._id}>
              {message.readStatus?.find((rs) => rs.user === user.id)?.lastReadMessageId === message._id && (
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
                <div className="flex items-baseline space-x-2">
                  <p style={{ color: '#dcddde' }} className="font-medium">
                    {message.author.displayName || message.author.username}
                  </p>
                  <p style={{ color: '#72767d' }} className="text-xs">
                    {new Date(message.createdAt).toLocaleTimeString()}
                  </p>
                  <button
                    onClick={() => handleReply(message._id)}
                    style={{ color: '#5865f2' }}
                    className="text-xs hover:underline"
                  >
                    Reply
                  </button>
                </div>
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
        <div ref={messageEndRef} />
      </div>
      <form onSubmit={handleSendMessage} className="flex space-x-2">
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
          </div>
        )}
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          style={{ backgroundColor: '#202225', color: '#dcddde', border: 'none' }}
          className="flex-1 rounded-md focus:ring-2 focus:ring-[#5865f2] p-2"
          placeholder="Type a message..."
          disabled={sendingMessage}
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={sendingMessage || !newMessage.trim()}
          style={{ backgroundColor: '#5865f2', color: '#ffffff' }}
          className="py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
        >
          {sendingMessage ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}