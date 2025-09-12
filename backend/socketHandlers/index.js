import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Server from '../models/Server.js';
import Channel from '../models/Channel.js';
import DirectMessageChannel from '../models/DirectMessageChannel.js';
import { setupDMHandlers } from '../socket/dmHandlers.js';

const connectedUsers = new Map();
const userSockets = new Map();

export const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || 
                 socket.handshake.headers.authorization?.replace('Bearer ', '') ||
                 socket.handshake.query.token;
    
    console.log('Socket.IO: Authenticating with token', token?.substring(0, 10) + '...');
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user || !user.isActive) {
      return next(new Error('Invalid or inactive user'));
    }

    socket.user = {
      ...user.toObject(),
      username: user.username || `User_${user._id.toString().slice(0, 8)}`,
      discriminator: user.discriminator || '0000',
      displayName: user.displayName || user.username || `User_${user._id.toString().slice(0, 8)}`,
    };
    console.log('Socket.IO: User authenticated:', socket.user._id);
    next();
  } catch (error) {
    console.error('Socket authentication error:', error.message);
    next(new Error('Authentication failed'));
  }
};

export const handleConnection = (io) => {
  return async (socket) => {
    const user = socket.user;
    console.log(`User ${user.username}#${user.discriminator} connected with socket ${socket.id}`);

    connectedUsers.set(user._id.toString(), {
      userId: user._id,
      socketId: socket.id,
      username: user.username,
      discriminator: user.discriminator,
      status: user.status,
      lastSeen: new Date()
    });

    userSockets.set(socket.id, user._id.toString());

    await User.findByIdAndUpdate(user._id, { status: 'ONLINE' });

    socket.join(`user:${user._id}`);
    console.log(`Socket.IO: Socket ${socket.id} joined user:${user._id}`);

    try {
      const userServers = await Server.find({ members: user._id });
      console.log(`Socket.IO: User ${user._id} servers:`, userServers.map(s => s._id.toString()));

      for (const server of userServers) {
        socket.join(`server:${server._id}`);
        const channels = await Channel.find({ server: server._id });
        for (const channel of channels) {
          console.log(`Socket.IO: Joining user ${user._id} to channel ${channel._id}`);
          socket.join(`channel:${channel._id}`);
        }
      }

      // Handle joinUser for DM real-time messaging
      socket.on('joinUser', ({ userId }) => {
        if (userId === user._id.toString()) {
          console.log(`Socket.IO: Socket ${socket.id} joined user:${userId}`);
          socket.join(`user:${userId}`);
        } else {
          console.error(`Socket.IO: Socket ${socket.id} attempted to join unauthorized user:${userId}`);
          socket.emit('error', { message: 'Unauthorized user join attempt' });
        }
      });

      // Allow joining any channel via joinChannel event
      socket.on('joinChannel', async (data) => {
        const { channelId } = data;
        try {
          const channel = await Channel.findById(channelId);
          if (!channel) {
            console.log(`Socket.IO: Channel ${channelId} not found for user ${user._id}`);
            return socket.emit('error', { message: 'Channel not found' });
          }
          console.log(`Socket.IO: Joining user ${user._id} to channel ${channelId} (manual)`);
          socket.join(`channel:${channelId}`);
          socket.emit('channelJoined', { channelId });
        } catch (error) {
          console.error(`Socket.IO: Error joining channel ${channelId}:`, error.message);
          socket.emit('error', { message: 'Failed to join channel' });
        }
      });

      // Remove automatic DM channel joining to avoid confusion with user:<userId> rooms
      // const dmChannels = await DirectMessageChannel.find({ participants: user._id });
      // for (const dmChannel of dmChannels) {
      //   socket.join(`dm:${dmChannel._id}`);
      // }

      await broadcastStatusChange(io, user._id, 'ONLINE');

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
        // dmChannels
      });

    } catch (error) {
      console.error('Error setting up user rooms:', error);
    }

    socket.on('joinServer', async (data) => {
      await handleJoinServer(socket, data);
    });

    socket.on('leaveServer', async (data) => {
      await handleLeaveServer(socket, data);
    });

    socket.on('leaveChannel', async (data) => {
      console.log('Socket.IO: Received leaveChannel event', data);
      await handleLeaveChannel(socket, data);
    });

    socket.on('joinVoiceChannel', async (data) => {
      await handleJoinVoiceChannel(io, socket, data);
    });

    socket.on('leaveVoiceChannel', async (data) => {
      await handleLeaveVoiceChannel(io, socket, data);
    });

    socket.on('voiceStateUpdate', async (data) => {
      await handleVoiceStateUpdate(io, socket, data);
    });

    socket.on('typing', (data) => {
      handleTyping(socket, data);
    });

    socket.on('stopTyping', (data) => {
      handleStopTyping(socket, data);
    });

    socket.on('statusUpdate', async (data) => {
      await handleStatusUpdate(io, socket, data);
    });

    socket.on('customStatusUpdate', async (data) => {
      await handleCustomStatusUpdate(io, socket, data);
    });

    socket.on('joinDM', async (data) => {
      await handleJoinDM(socket, data);
    });

    socket.on('leaveDM', async (data) => {
      await handleLeaveDM(socket, data);
    });

    setupDMHandlers(io, socket);

    socket.on('voiceSettingsUpdate', async (data) => {
      await handleVoiceSettingsUpdate(socket, data);
    });

    socket.on('presenceUpdate', async (data) => {
      await handlePresenceUpdate(io, socket, data);
    });

    socket.on('disconnect', async (reason) => {
      await handleDisconnection(io, socket, reason);
    });
  };
};

const handleJoinServer = async (socket, data) => {
  try {
    const { serverId } = data;
    const user = socket.user;

    const server = await Server.findById(serverId);
    if (!server || !server.members.includes(user._id)) {
      return socket.emit('error', { message: 'Server not found or access denied' });
    }

    socket.join(`server:${serverId}`);
    const channels = await Channel.find({ server: serverId });
    for (const channel of channels) {
      socket.join(`channel:${channel._id}`);
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
    const channels = await Channel.find({ server: serverId });
    for (const channel of channels) {
      socket.leave(`channel:${channel._id}`);
    }
    socket.emit('serverLeft', { serverId });
  } catch (error) {
    console.error('Error leaving server:', error);
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

    const voiceSettings = {};
    if (typeof isMuted === 'boolean') voiceSettings.isMuted = isMuted;
    if (typeof isDeafened === 'boolean') voiceSettings.isDeafened = isDeafened;
    
    await User.findByIdAndUpdate(user._id, { voiceSettings });

    io.to(`channel:${channelId}`).emit('userVoiceStateUpdate', {
      userId: user._id,
      isMuted: voiceSettings.isMuted,
      isDeafened: voiceSettings.isDeafened,
      isSpeaking: isSpeaking || false
    });
  } catch (error) {
    console.error('Error updating voice state:', error);
  }
};

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

const handleStatusUpdate = async (io, socket, data) => {
  try {
    const { status } = data;
    const user = socket.user;

    await User.findByIdAndUpdate(user._id, { status });
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

    await User.findByIdAndUpdate(user._id, { customStatus });
    await broadcastStatusChange(io, user._id, user.status, customStatus);
    socket.emit('customStatusUpdated', { customStatus });
  } catch (error) {
    console.error('Error updating custom status:', error);
    socket.emit('error', { message: 'Failed to update custom status' });
  }
};

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

const handleVoiceSettingsUpdate = async (socket, data) => {
  try {
    const user = socket.user;
    await User.findByIdAndUpdate(user._id, { voiceSettings: data });
    socket.emit('voiceSettingsUpdated', { settings: data });
  } catch (error) {
    console.error('Error updating voice settings:', error);
    socket.emit('error', { message: 'Failed to update voice settings' });
  }
};

const handlePresenceUpdate = async (io, socket, data) => {
  try {
    const { activity } = data;
    const user = socket.user;

    await User.findByIdAndUpdate(user._id, { lastSeen: new Date() });
    connectedUsers.set(user._id.toString(), {
      ...connectedUsers.get(user._id.toString()),
      lastSeen: new Date(),
      activity
    });

    await broadcastPresenceUpdate(io, user._id, activity);
  } catch (error) {
    console.error('Error updating presence:', error);
  }
};

const handleDisconnection = async (io, socket, reason) => {
  try {
    const user = socket.user;
    console.log(`User ${user.username}#${user.discriminator} disconnected: ${reason}`);

    connectedUsers.delete(user._id.toString());
    userSockets.delete(socket.id);

    await User.findByIdAndUpdate(user._id, { status: 'OFFLINE' });

    const voiceChannels = await Channel.find({
      type: 'VOICE',
      connectedUsers: user._id
    });

    for (const channel of voiceChannels) {
      await channel.removeConnectedUser(user._id);
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

    await broadcastStatusChange(io, user._id, 'OFFLINE');
  } catch (error) {
    console.error('Error handling disconnection:', error);
  }
};

const broadcastStatusChange = async (io, userId, status, customStatus = null) => {
  try {
    const user = await User.findById(userId);
    const friends = await user.getFriends();

    friends.forEach(friend => {
      io.to(`user:${friend._id}`).emit('friendStatusUpdate', {
        userId,
        status,
        customStatus,
        lastSeen: new Date()
      });
    });

    const servers = await Server.find({ members: userId });
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

    friends.forEach(friend => {
      io.to(`user:${friend._id}`).emit('friendPresenceUpdate', {
        userId,
        activity,
        lastSeen: new Date()
      });
    });

    const servers = await Server.find({ members: userId });
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

export const getConnectedUsers = () => connectedUsers;
export const getUserSocket = (userId) => {
  const userData = connectedUsers.get(userId);
  return userData ? userData.socketId : null;
};

export const isUserOnline = (userId) => {
  return connectedUsers.has(userId);
};