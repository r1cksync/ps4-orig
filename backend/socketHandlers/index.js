import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Server from '../models/Server.js';
import Channel from '../models/Channel.js';
import DirectMessageChannel from '../models/DirectMessageChannel.js';
import { setupDMHandlers } from '../socket/dmHandlers.js';

// Store connected users and their socket IDs
const connectedUsers = new Map();
const userSockets = new Map();

// Authentication middleware for Socket.IO
export const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || 
                 socket.handshake.headers.authorization?.replace('Bearer ', '') ||
                 socket.handshake.query.token;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user || !user.isActive) {
      return next(new Error('Invalid or inactive user'));
    }

    socket.user = user;
    next();
  } catch (error) {
    console.error('Socket authentication error:', error.message);
    next(new Error('Authentication failed'));
  }
};

// Handle user connection
export const handleConnection = (io) => {
  return async (socket) => {
    const user = socket.user;
    console.log(`User ${user.username}#${user.discriminator} connected with socket ${socket.id}`);

    // Store user connection
    connectedUsers.set(user._id.toString(), {
      userId: user._id,
      socketId: socket.id,
      username: user.username,
      discriminator: user.discriminator,
      status: user.status,
      lastSeen: new Date()
    });

    // Store socket reference
    userSockets.set(socket.id, user._id.toString());

    // Update user status to online
    await user.updateStatus('ONLINE');

    // Join user to their personal room
    socket.join(`user:${user._id}`);

    // Join user to their server rooms
    try {
      const userServers = await user.getServers();
      for (const server of userServers) {
        socket.join(`server:${server._id}`);
        
        // Join user to channels they have access to
        const channels = await Channel.find({ server: server._id });
        for (const channel of channels) {
          const serverDoc = await Server.findById(server._id);
          const canView = await serverDoc.hasPermission(user._id, 'viewChannels', channel._id);
          if (canView) {
            socket.join(`channel:${channel._id}`);
          }
        }
      }

      // Join user to their DM channels
      const dmChannels = await user.getDMChannels();
      for (const dmChannel of dmChannels) {
        socket.join(`dm:${dmChannel._id}`);
      }

      // Emit user online status to friends and servers
      await broadcastStatusChange(io, user._id, 'ONLINE');

      // Send initial data to client
      socket.emit('connected', {
        user: {
          _id: user._id,
          username: user.username,
          discriminator: user.discriminator,
          displayName: user.displayName,
          avatar: user.avatar,
          status: 'ONLINE'
        },
        servers: userServers,
        dmChannels
      });

    } catch (error) {
      console.error('Error setting up user rooms:', error);
    }

    // Handle server join/leave events
    socket.on('joinServer', async (data) => {
      await handleJoinServer(socket, data);
    });

    socket.on('leaveServer', async (data) => {
      await handleLeaveServer(socket, data);
    });

    // Handle channel events
    socket.on('joinChannel', async (data) => {
      await handleJoinChannel(socket, data);
    });

    socket.on('leaveChannel', async (data) => {
      await handleLeaveChannel(socket, data);
    });

    // Handle voice channel events
    socket.on('joinVoiceChannel', async (data) => {
      await handleJoinVoiceChannel(io, socket, data);
    });

    socket.on('leaveVoiceChannel', async (data) => {
      await handleLeaveVoiceChannel(io, socket, data);
    });

    socket.on('voiceStateUpdate', async (data) => {
      await handleVoiceStateUpdate(io, socket, data);
    });

    // Handle typing events
    socket.on('typing', (data) => {
      handleTyping(socket, data);
    });

    socket.on('stopTyping', (data) => {
      handleStopTyping(socket, data);
    });

    // Handle status updates
    socket.on('statusUpdate', async (data) => {
      await handleStatusUpdate(io, socket, data);
    });

    // Handle custom status updates
    socket.on('customStatusUpdate', async (data) => {
      await handleCustomStatusUpdate(io, socket, data);
    });

    // Handle DM events
    socket.on('joinDM', async (data) => {
      await handleJoinDM(socket, data);
    });

    socket.on('leaveDM', async (data) => {
      await handleLeaveDM(socket, data);
    });

    // Set up comprehensive DM handlers for Discord-like functionality
    setupDMHandlers(io, socket);

    // Handle voice settings updates
    socket.on('voiceSettingsUpdate', async (data) => {
      await handleVoiceSettingsUpdate(socket, data);
    });

    // Handle presence updates
    socket.on('presenceUpdate', async (data) => {
      await handlePresenceUpdate(io, socket, data);
    });

    // Handle disconnection
    socket.on('disconnect', async (reason) => {
      await handleDisconnection(io, socket, reason);
    });
  };
};

// Server event handlers
const handleJoinServer = async (socket, data) => {
  try {
    const { serverId } = data;
    const user = socket.user;

    const server = await Server.findById(serverId);
    if (!server || !server.isMember(user._id)) {
      return socket.emit('error', { message: 'Server not found or access denied' });
    }

    socket.join(`server:${serverId}`);

    // Join channels user has access to
    const channels = await Channel.find({ server: serverId });
    for (const channel of channels) {
      const canView = await server.hasPermission(user._id, 'viewChannels', channel._id);
      if (canView) {
        socket.join(`channel:${channel._id}`);
      }
    }

    socket.emit('serverJoined', { serverId });
  } catch (error) {
    console.error('Error joining server:', error);
    socket.emit('error', { message: 'Failed to join server' });
  }
};

const handleLeaveServer = async (socket, data) => {
  try {
    const { serverId } = data;

    socket.leave(`server:${serverId}`);

    // Leave all channels in this server
    const channels = await Channel.find({ server: serverId });
    for (const channel of channels) {
      socket.leave(`channel:${channel._id}`);
    }

    socket.emit('serverLeft', { serverId });
  } catch (error) {
    console.error('Error leaving server:', error);
  }
};

// Channel event handlers
const handleJoinChannel = async (socket, data) => {
  try {
    const { channelId } = data;
    const user = socket.user;

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return socket.emit('error', { message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server);
    if (!server || !server.isMember(user._id)) {
      return socket.emit('error', { message: 'Access denied' });
    }

    const canView = await server.hasPermission(user._id, 'viewChannels', channelId);
    if (!canView) {
      return socket.emit('error', { message: 'Cannot view this channel' });
    }

    socket.join(`channel:${channelId}`);
    socket.emit('channelJoined', { channelId });
  } catch (error) {
    console.error('Error joining channel:', error);
    socket.emit('error', { message: 'Failed to join channel' });
  }
};

const handleLeaveChannel = async (socket, data) => {
  try {
    const { channelId } = data;
    socket.leave(`channel:${channelId}`);
    socket.emit('channelLeft', { channelId });
  } catch (error) {
    console.error('Error leaving channel:', error);
  }
};

// Voice channel event handlers
const handleJoinVoiceChannel = async (io, socket, data) => {
  try {
    const { channelId } = data;
    const user = socket.user;

    const channel = await Channel.findById(channelId);
    if (!channel || channel.type !== 'VOICE') {
      return socket.emit('error', { message: 'Voice channel not found' });
    }

    const server = await Server.findById(channel.server);
    const canConnect = await server.hasPermission(user._id, 'connect', channelId);
    if (!canConnect) {
      return socket.emit('error', { message: 'Cannot connect to this voice channel' });
    }

    await channel.addConnectedUser(user._id);

    // Broadcast voice state update to server
    io.to(`server:${channel.server}`).emit('voiceStateUpdate', {
      channelId,
      userId: user._id,
      user: {
        username: user.username,
        discriminator: user.discriminator,
        displayName: user.displayName,
        avatar: user.avatar
      },
      joined: true
    });

    socket.emit('voiceChannelJoined', { channelId });
  } catch (error) {
    console.error('Error joining voice channel:', error);
    socket.emit('error', { message: 'Failed to join voice channel' });
  }
};

const handleLeaveVoiceChannel = async (io, socket, data) => {
  try {
    const { channelId } = data;
    const user = socket.user;

    const channel = await Channel.findById(channelId);
    if (channel) {
      await channel.removeConnectedUser(user._id);

      // Broadcast voice state update to server
      io.to(`server:${channel.server}`).emit('voiceStateUpdate', {
        channelId,
        userId: user._id,
        user: {
          username: user.username,
          discriminator: user.discriminator,
          displayName: user.displayName,
          avatar: user.avatar
        },
        joined: false
      });
    }

    socket.emit('voiceChannelLeft', { channelId });
  } catch (error) {
    console.error('Error leaving voice channel:', error);
  }
};

const handleVoiceStateUpdate = async (io, socket, data) => {
  try {
    const { channelId, isMuted, isDeafened, isSpeaking } = data;
    const user = socket.user;

    // Update user's voice settings if provided
    if (typeof isMuted === 'boolean' || typeof isDeafened === 'boolean') {
      const voiceSettings = { ...user.voiceSettings };
      if (typeof isMuted === 'boolean') voiceSettings.isMuted = isMuted;
      if (typeof isDeafened === 'boolean') voiceSettings.isDeafened = isDeafened;
      
      await user.updateVoiceSettings(voiceSettings);
    }

    // Broadcast voice state to channel
    io.to(`channel:${channelId}`).emit('userVoiceStateUpdate', {
      userId: user._id,
      isMuted: user.voiceSettings.isMuted,
      isDeafened: user.voiceSettings.isDeafened,
      isSpeaking: isSpeaking || false
    });
  } catch (error) {
    console.error('Error updating voice state:', error);
  }
};

// Typing event handlers
const handleTyping = (socket, data) => {
  const { channelId, isDM = false } = data;
  const user = socket.user;

  const roomName = isDM ? `dm:${channelId}` : `channel:${channelId}`;
  socket.to(roomName).emit(isDM ? 'dmTyping' : 'typing', {
    channelId,
    user: {
      _id: user._id,
      username: user.username,
      discriminator: user.discriminator,
      displayName: user.displayName,
      avatar: user.avatar
    }
  });
};

const handleStopTyping = (socket, data) => {
  const { channelId, isDM = false } = data;
  const user = socket.user;

  const roomName = isDM ? `dm:${channelId}` : `channel:${channelId}`;
  socket.to(roomName).emit(isDM ? 'dmStopTyping' : 'stopTyping', {
    channelId,
    userId: user._id
  });
};

// Status event handlers
const handleStatusUpdate = async (io, socket, data) => {
  try {
    const { status } = data;
    const user = socket.user;

    await user.updateStatus(status);
    connectedUsers.set(user._id.toString(), {
      ...connectedUsers.get(user._id.toString()),
      status,
      lastSeen: new Date()
    });

    await broadcastStatusChange(io, user._id, status);
    socket.emit('statusUpdated', { status });
  } catch (error) {
    console.error('Error updating status:', error);
    socket.emit('error', { message: 'Failed to update status' });
  }
};

const handleCustomStatusUpdate = async (io, socket, data) => {
  try {
    const { customStatus } = data;
    const user = socket.user;

    user.customStatus = customStatus;
    await user.save();

    await broadcastStatusChange(io, user._id, user.status, customStatus);
    socket.emit('customStatusUpdated', { customStatus });
  } catch (error) {
    console.error('Error updating custom status:', error);
    socket.emit('error', { message: 'Failed to update custom status' });
  }
};

// DM event handlers
const handleJoinDM = async (socket, data) => {
  try {
    const { channelId } = data;
    const user = socket.user;

    const dmChannel = await DirectMessageChannel.findById(channelId);
    if (!dmChannel || !dmChannel.participants.includes(user._id)) {
      return socket.emit('error', { message: 'DM channel not found or access denied' });
    }

    socket.join(`dm:${channelId}`);
    socket.emit('dmJoined', { channelId });
  } catch (error) {
    console.error('Error joining DM:', error);
    socket.emit('error', { message: 'Failed to join DM' });
  }
};

const handleLeaveDM = async (socket, data) => {
  try {
    const { channelId } = data;
    socket.leave(`dm:${channelId}`);
    socket.emit('dmLeft', { channelId });
  } catch (error) {
    console.error('Error leaving DM:', error);
  }
};

// Voice settings handler
const handleVoiceSettingsUpdate = async (socket, data) => {
  try {
    const user = socket.user;
    await user.updateVoiceSettings(data);
    socket.emit('voiceSettingsUpdated', { settings: user.voiceSettings });
  } catch (error) {
    console.error('Error updating voice settings:', error);
    socket.emit('error', { message: 'Failed to update voice settings' });
  }
};

// Presence handler
const handlePresenceUpdate = async (io, socket, data) => {
  try {
    const { activity } = data;
    const user = socket.user;

    // Update user's last seen
    user.lastSeen = new Date();
    await user.save();

    connectedUsers.set(user._id.toString(), {
      ...connectedUsers.get(user._id.toString()),
      lastSeen: new Date(),
      activity
    });

    // Broadcast presence update to friends and servers
    await broadcastPresenceUpdate(io, user._id, activity);
  } catch (error) {
    console.error('Error updating presence:', error);
  }
};

// Disconnection handler
const handleDisconnection = async (io, socket, reason) => {
  try {
    const user = socket.user;
    console.log(`User ${user.username}#${user.discriminator} disconnected: ${reason}`);

    // Remove from connected users
    connectedUsers.delete(user._id.toString());
    userSockets.delete(socket.id);

    // Update user status to offline
    await user.updateStatus('OFFLINE');

    // Remove from all voice channels
    const voiceChannels = await Channel.find({
      type: 'VOICE',
      connectedUsers: user._id
    });

    for (const channel of voiceChannels) {
      await channel.removeConnectedUser(user._id);
      
      // Broadcast voice state update
      io.to(`server:${channel.server}`).emit('voiceStateUpdate', {
        channelId: channel._id,
        userId: user._id,
        user: {
          username: user.username,
          discriminator: user.discriminator,
          displayName: user.displayName,
          avatar: user.avatar
        },
        joined: false
      });
    }

    // Broadcast offline status
    await broadcastStatusChange(io, user._id, 'OFFLINE');
  } catch (error) {
    console.error('Error handling disconnection:', error);
  }
};

// Utility functions
const broadcastStatusChange = async (io, userId, status, customStatus = null) => {
  try {
    // Get user's friends
    const user = await User.findById(userId);
    const friends = await user.getFriends();

    // Broadcast to friends
    friends.forEach(friend => {
      io.to(`user:${friend._id}`).emit('friendStatusUpdate', {
        userId,
        status,
        customStatus,
        lastSeen: new Date()
      });
    });

    // Get user's servers and broadcast to members
    const servers = await user.getServers();
    servers.forEach(server => {
      io.to(`server:${server._id}`).emit('memberStatusUpdate', {
        userId,
        status,
        customStatus,
        lastSeen: new Date()
      });
    });
  } catch (error) {
    console.error('Error broadcasting status change:', error);
  }
};

const broadcastPresenceUpdate = async (io, userId, activity) => {
  try {
    const user = await User.findById(userId);
    const friends = await user.getFriends();

    // Broadcast to friends
    friends.forEach(friend => {
      io.to(`user:${friend._id}`).emit('friendPresenceUpdate', {
        userId,
        activity,
        lastSeen: new Date()
      });
    });

    // Broadcast to servers
    const servers = await user.getServers();
    servers.forEach(server => {
      io.to(`server:${server._id}`).emit('memberPresenceUpdate', {
        userId,
        activity,
        lastSeen: new Date()
      });
    });
  } catch (error) {
    console.error('Error broadcasting presence update:', error);
  }
};

// Export utility functions for use in routes
export const getConnectedUsers = () => connectedUsers;
export const getUserSocket = (userId) => {
  const userData = connectedUsers.get(userId);
  return userData ? userData.socketId : null;
};

export const isUserOnline = (userId) => {
  return connectedUsers.has(userId);
};
