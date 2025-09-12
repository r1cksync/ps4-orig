'use client';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function MessageSection({ channelId, serverId, token, socket }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [files, setFiles] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState('');
  const messageEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const joinAttemptsRef = useRef(0);

  useEffect(() => {
    if (!token || !channelId || !socket) {
      console.error('Missing token, channelId, or socket:', { token, channelId, socket });
      setError('Missing required parameters');
      return;
    }

    console.log('Socket.IO: Connecting to channel', channelId);
    const joinChannel = () => {
      if (joinAttemptsRef.current < 5) {
        console.log(`Socket.IO: Attempting to join channel ${channelId} (Attempt ${joinAttemptsRef.current + 1})`);
        socket.emit('joinChannel', { channelId });
        joinAttemptsRef.current += 1;
      }
    };

    socket.on('connect', () => {
      console.log('Socket.IO: Connected', socket.id);
      joinAttemptsRef.current = 0;
      joinChannel();
      setError('');
    });
    socket.on('connect_error', (err) => {
      console.error('Socket.IO: Connect error', err.message, err);
      setError(`Socket connection failed: ${err.message}`);
    });
    socket.on('disconnect', (reason) => {
      console.log('Socket.IO: Disconnected', reason);
      setError('Socket disconnected. Reconnecting...');
    });

    socket.on('channelJoined', (data) => {
      console.log('Socket.IO: Joined channel', data);
      joinAttemptsRef.current = 5; // Stop retries on success
      setError('');
    });
    socket.on('error', (data) => {
      console.error('Socket.IO: Channel join error', data);
      setError(data.message || 'Failed to join channel');
    });

    // Retry joinChannel every 2 seconds if not joined
    const retryInterval = setInterval(() => {
      if (joinAttemptsRef.current < 5 && socket.connected) {
        joinChannel();
      }
    }, 2000);

    joinChannel(); // Initial join attempt
    fetchMessages();

    socket.on('message', (message) => {
      if (message.channel === channelId) {
        console.log('Socket.IO: New message received', message);
        setMessages((prev) => {
          if (prev.some((msg) => msg._id === message._id)) {
            return prev;
          }
          return [...prev, message];
        });
      }
    });

    return () => {
      socket.off('message');
      socket.off('connect');
      socket.off('connect_error');
      socket.off('disconnect');
      socket.off('channelJoined');
      socket.off('error');
      socket.emit('leaveChannel', { channelId });
      clearInterval(retryInterval);
      console.log('Socket.IO: Disconnected from channel', channelId);
    };
  }, [channelId, token, socket]);

  const fetchMessages = async (before = null) => {
    setLoadingMessages(true);
    setError('');

    try {
      const response = await axios.get(`${BASE_URL}/channels/${channelId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 50, before },
      });
      setMessages((prev) => (before ? [...response.data, ...prev] : response.data));
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError(err.response?.data?.message || 'Failed to fetch messages');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const maxSize = 25 * 1024 * 1024; // 25MB
    const allowedTypes = [
      'image/png', 'image/jpeg', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'audio/mpeg', 'audio/wav', 'audio/ogg',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/zip', 'application/x-rar-compressed',
      'text/javascript', 'text/html', 'text/css', 'application/json',
    ];

    const validFiles = selectedFiles.filter((file) => {
      if (file.size > maxSize) {
        setError(`File "${file.name}" exceeds 25MB limit`);
        return false;
      }
      if (!allowedTypes.includes(file.type)) {
        setError(`File "${file.name}" has unsupported type: ${file.type}`);
        return false;
      }
      return true;
    });

    setFiles(validFiles);
    setError(validFiles.length === 0 && selectedFiles.length > 0 ? error : '');
  };

  const handleFileUpload = async () => {
    if (files.length === 0) {
      setError('No file selected');
      return;
    }

    setSendingMessage(true);
    setError('');

    const formData = new FormData();
    formData.append('file', files[0]); // Single file for upload endpoint

    try {
      const response = await axios.post(`${BASE_URL}/channels/${channelId}/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      alert(`File uploaded successfully: ${response.data.data.attachment.filename}`);
    } catch (err) {
      console.error('File upload error:', err);
      setError(err.response?.data?.message || 'Failed to upload file');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const trimmedMessage = newMessage.trim();
    if (!token || !channelId || (!trimmedMessage && files.length === 0)) {
      setError('Message or file required');
      return;
    }

    setSendingMessage(true);
    setError('');

    try {
      let response;
      if (files.length > 0) {
        if (files.length > 1) {
          setError('Only one file can be sent with a message');
          setSendingMessage(false);
          return;
        }
        const formData = new FormData();
        if (trimmedMessage) {
          formData.append('content', trimmedMessage);
        }
        formData.append('file', files[0]); // Single file for /with-file endpoint

        response = await axios.post(`${BASE_URL}/channels/${channelId}/messages/with-file`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        });
      } else {
        response = await axios.post(
          `${BASE_URL}/channels/${channelId}/messages`,
          { content: trimmedMessage },
          {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Message will be added via socket, no need to update state here
    setNewMessage('');
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  } catch (err) {
    console.error('Error sending message:', err);
    setError(err.response?.data?.message || 'Failed to send message');
  } finally {
    setSendingMessage(false);
  }
};

const scrollToBottom = () => {
  messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
};

useEffect(() => {
  scrollToBottom();
}, [messages]);

return (
  <div style={{ backgroundColor: '#36393f', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
      {error && (
        <div style={{ backgroundColor: '#f04747', borderColor: '#d83c3c' }} className="mb-4 p-3 border rounded-md">
          <p style={{ color: '#ffffff' }} className="text-sm">{error}</p>
        </div>
      )}
      {loadingMessages ? (
        <p style={{ color: '#72767d', textAlign: 'center' }}>Loading messages...</p>
      ) : messages.length === 0 ? (
        <p style={{ color: '#72767d', textAlign: 'center' }}>No messages in this channel</p>
      ) : (
        messages.map((message) => (
          <div
            key={message._id}
            className="flex items-start space-x-3 py-2 hover:bg-[#2f3136]"
            style={{ borderBottom: '1px solid #202225' }}
          >
            <img
              src={message.author.avatar || '/default-avatar.png'}
              alt={message.author.displayName || message.author.username || 'Unknown'}
              style={{ width: '40px', height: '40px', borderRadius: '50%' }}
            />
            <div style={{ flex: 1 }}>
              <div className="flex items-baseline space-x-2">
                <p style={{ color: '#dcddde' }} className="font-semibold text-sm">
                  {message.author.displayName || message.author.username || 'Unknown'}
                </p>
                <p style={{ color: '#72767d' }} className="text-xs">
                  {new Date(message.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <p style={{ color: '#dcddde' }} className="text-sm mt-1">{message.content || ''}</p>
              {message.attachments?.length > 0 && (
                <div className="mt-2">
                  {message.attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center space-x-2">
                      {attachment.contentType.startsWith('image/') ? (
                        <img
                          src={attachment.url}
                          alt={attachment.filename}
                          style={{ maxWidth: '300px', maxHeight: '300px', borderRadius: '4px' }}
                        />
                      ) : (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#5865f2' }}
                          className="hover:underline text-sm"
                        >
                          {attachment.filename} ({(attachment.size / 1024).toFixed(2)} KB)
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))
      )}
      <div ref={messageEndRef} />
    </div>
    <div style={{ backgroundColor: '#2f3136', padding: '1rem', borderTop: '1px solid #202225' }}>
      <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sendingMessage}
          style={{ color: '#b9bbbe' }}
          className="hover:text-[#dcddde]"
        >
          📎
        </button>
        <input
          type="file"
          multiple
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: 'none' }}
          disabled={sendingMessage}
          accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm,video/quicktime,application/zip,application/x-rar-compressed,text/javascript,text/html,text/css,application/json"
        />
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={`Message #${channelId}`}
          style={{
            backgroundColor: '#40444b',
            color: '#dcddde',
            border: 'none',
            flex: 1,
            padding: '0.5rem',
            borderRadius: '4px',
          }}
          className="focus:ring-2 focus:ring-[#5865f2]"
          maxLength={2000}
          disabled={sendingMessage}
        />
        {files.length > 0 && (
          <button
            type="button"
            onClick={handleFileUpload}
            disabled={sendingMessage}
            style={{
              backgroundColor: '#5865f2',
              color: '#ffffff',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: sendingMessage ? 'not-allowed' : 'pointer',
            }}
            className="hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            Upload File
          </button>
        )}
        <button
          type="submit"
          disabled={sendingMessage || (!newMessage.trim() && files.length === 0)}
          style={{
            backgroundColor: '#5865f2',
            color: '#ffffff',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
          }}
          className="hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
      {files.length > 0 && (
        <p style={{ color: '#72767d' }} className="text-xs mt-1">
          {files.length} file(s) selected
        </p>
      )}
    </div>
  </div>
);
}