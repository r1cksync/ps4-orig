import mongoose from 'mongoose';
import DirectMessageChannel from '../models/DirectMessageChannel.js';
import DirectMessage from '../models/DirectMessage.js';
import User from '../models/User.js';
import Friendship from '../models/Friendship.js';

/**
 * Discord-like DM Socket.IO Event Handlers
 * Handles real-time DM functionality including:
 * - DM channel management
 * - Message sending/editing/deleting
 * - Typing indicators
 * - Read receipts
 * - Group DM management
 * - Presence updates
 */

// User typing states (expires after 10 seconds)
const typingStates = new Map();

// Helper function to check DM permissions
const checkDMPermissions = async (userId, targetUserId) => {
  // Check if users are friends
  const friendship = await Friendship.findOne({
    $or: [
      { requester: userId, recipient: targetUserId, status: 'accepted' },
      { requester: targetUserId, recipient: userId, status: 'accepted' }
    ]
  });

  if (friendship) return true;

  // Check if users are blocked
  const isBlocked = await Friendship.isBlocked(userId, targetUserId);
  if (isBlocked) return false;

  // Check if users share mutual servers (would require Server model)
  // For now, allow if not blocked and not friends (can be restricted later)
  return true;
};

// Helper function to clean expired typing states
const cleanExpiredTyping = () => {
  const now = Date.now();
  for (const [key, data] of typingStates.entries()) {
    if (now - data.timestamp > 10000) { // 10 seconds
      typingStates.delete(key);
    }
  }
};

// Clean typing states every 30 seconds
setInterval(cleanExpiredTyping, 30000);

export const setupDMHandlers = (io, socket) => {
  // Join user to their personal room for DM notifications
  socket.on('joinDMRooms', async () => {
    try {
      if (!socket.user) return;

      // Join user's personal room
      socket.join(`user:${socket.user._id}`);

      // Join all DM channels the user is part of
      const dmChannels = await DirectMessageChannel.find({
        participants: socket.user._id,
        isDeleted: false
      });

      dmChannels.forEach(channel => {
        socket.join(`dm:${channel._id}`);
      });

      console.log(`User ${socket.user.username} joined ${dmChannels.length} DM rooms`);
    } catch (error) {
      console.error('Error joining DM rooms:', error);
      socket.emit('error', { message: 'Failed to join DM rooms' });
    }
  });

  // Create new DM channel
  socket.on('createDM', async (data) => {
    try {
      const { recipientId, message } = data;

      if (!socket.user) {
        return socket.emit('error', { message: 'Authentication required' });
      }

      if (!mongoose.Types.ObjectId.isValid(recipientId)) {
        return socket.emit('error', { message: 'Invalid recipient ID' });
      }

      // Check if recipient exists
      const recipient = await User.findById(recipientId);
      if (!recipient) {
        return socket.emit('error', { message: 'Recipient not found' });
      }

      // Check DM permissions
      const canDM = await checkDMPermissions(socket.user._id, recipientId);
      if (!canDM) {
        return socket.emit('error', { message: 'Cannot send DM to this user' });
      }

      // Check if DM already exists
      let dmChannel = await DirectMessageChannel.findOne({
        type: 'DM',
        participants: { $all: [socket.user._id, recipientId] },
        isDeleted: false
      });

      if (!dmChannel) {
        // Create new DM channel
        dmChannel = new DirectMessageChannel({
          type: 'DM',
          participants: [socket.user._id, recipientId],
          readStatus: [
            { user: socket.user._id, lastReadAt: new Date() },
            { user: recipientId, lastReadAt: new Date() }
          ]
        });
        await dmChannel.save();
      }

      // Populate channel data
      const populatedChannel = await DirectMessageChannel.findById(dmChannel._id)
        .populate('participants', 'username discriminator displayName avatar status lastSeen');

      // Join both users to the DM room
      socket.join(`dm:${dmChannel._id}`);
      io.to(`user:${recipientId}`).emit('joinDMRoom', { channelId: dmChannel._id });

      // Send initial message if provided
      if (message && message.trim()) {
        const newMessage = new DirectMessage({
          content: message.trim(),
          author: socket.user._id,
          channel: dmChannel._id
        });

        await newMessage.save();

        dmChannel.lastMessage = newMessage._id;
        dmChannel.lastMessageAt = new Date();
        await dmChannel.save();

        const populatedMessage = await DirectMessage.findById(newMessage._id)
          .populate('author', 'username discriminator displayName avatar status');

        // Emit message to both participants
        io.to(`dm:${dmChannel._id}`).emit('dmMessage', {
          channelId: dmChannel._id,
          message: populatedMessage
        });
      }

      // Emit DM channel creation to both users
      io.to(`user:${socket.user._id}`).emit('dmChannelCreate', populatedChannel);
      io.to(`user:${recipientId}`).emit('dmChannelCreate', populatedChannel);

      socket.emit('dmCreateSuccess', populatedChannel);
    } catch (error) {
      console.error('Error creating DM:', error);
      socket.emit('error', { message: 'Failed to create DM' });
    }
  });

  // Send DM message
  socket.on('sendDMMessage', async (data) => {
    try {
      const { channelId, content, attachments, embeds, referencedMessageId, nonce } = data;

      if (!socket.user) {
        return socket.emit('error', { message: 'Authentication required' });
      }

      if (!mongoose.Types.ObjectId.isValid(channelId)) {
        return socket.emit('error', { message: 'Invalid channel ID' });
      }

      if (!content?.trim() && (!attachments || attachments.length === 0)) {
        return socket.emit('error', { message: 'Message content or attachments required' });
      }

      const dmChannel = await DirectMessageChannel.findById(channelId);
      if (!dmChannel || dmChannel.isDeleted) {
        return socket.emit('error', { message: 'DM channel not found' });
      }

      // Check if user is a participant
      if (!dmChannel.participants.some(p => p.equals(socket.user._id))) {
        return socket.emit('error', { message: 'Access denied' });
      }

      // For DMs, check blocking status
      if (dmChannel.type === 'DM') {
        const otherUser = dmChannel.participants.find(p => !p.equals(socket.user._id));
        const isBlocked = await Friendship.isBlocked(socket.user._id, otherUser);
        if (isBlocked) {
          return socket.emit('error', { message: 'Cannot send message to blocked user' });
        }
      }

      const message = new DirectMessage({
        content: content?.trim(),
        author: socket.user._id,
        channel: channelId,
        attachments: attachments || [],
        embeds: embeds || [],
        referencedMessage: referencedMessageId || null,
        nonce: nonce || null
      });

      await message.save();

      // Update channel
      dmChannel.lastMessage = message._id;
      dmChannel.lastMessageAt = new Date();
      await dmChannel.save();

      const populatedMessage = await DirectMessage.findById(message._id)
        .populate('author', 'username discriminator displayName avatar status')
        .populate('referencedMessage', 'content author createdAt type')
        .populate('referencedMessage.author', 'username discriminator displayName avatar');

      // Clear typing for this user
      const typingKey = `${channelId}:${socket.user._id}`;
      typingStates.delete(typingKey);

      // Emit to all participants
      io.to(`dm:${channelId}`).emit('dmMessage', {
        channelId,
        message: populatedMessage
      });

      // Stop typing indicator
      socket.to(`dm:${channelId}`).emit('dmTypingStop', {
        channelId,
        userId: socket.user._id
      });

      socket.emit('dmMessageSuccess', { 
        nonce,
        message: populatedMessage 
      });
    } catch (error) {
      console.error('Error sending DM message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Edit DM message
  socket.on('editDMMessage', async (data) => {
    try {
      const { channelId, messageId, content } = data;

      if (!socket.user) {
        return socket.emit('error', { message: 'Authentication required' });
      }

      if (!mongoose.Types.ObjectId.isValid(channelId) || !mongoose.Types.ObjectId.isValid(messageId)) {
        return socket.emit('error', { message: 'Invalid IDs' });
      }

      if (!content?.trim()) {
        return socket.emit('error', { message: 'Message content required' });
      }

      const dmChannel = await DirectMessageChannel.findById(channelId);
      if (!dmChannel || dmChannel.isDeleted) {
        return socket.emit('error', { message: 'DM channel not found' });
      }

      const message = await DirectMessage.findOne({
        _id: messageId,
        channel: channelId,
        author: socket.user._id,
        isDeleted: false
      });

      if (!message) {
        return socket.emit('error', { message: 'Message not found or not yours to edit' });
      }

      // Check if message is too old to edit
      const hoursSinceCreated = (Date.now() - message.createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceCreated > 24) {
        return socket.emit('error', { message: 'Message too old to edit (24 hour limit)' });
      }

      message.content = content.trim();
      message.editedAt = new Date();
      await message.save();

      const populatedMessage = await DirectMessage.findById(message._id)
        .populate('author', 'username discriminator displayName avatar status')
        .populate('referencedMessage', 'content author createdAt type')
        .populate('referencedMessage.author', 'username discriminator displayName avatar');

      // Emit to all participants
      io.to(`dm:${channelId}`).emit('dmMessageEdit', {
        channelId,
        message: populatedMessage
      });

      socket.emit('dmMessageEditSuccess', populatedMessage);
    } catch (error) {
      console.error('Error editing DM message:', error);
      socket.emit('error', { message: 'Failed to edit message' });
    }
  });

  // Delete DM message
  socket.on('deleteDMMessage', async (data) => {
    try {
      const { channelId, messageId } = data;

      if (!socket.user) {
        return socket.emit('error', { message: 'Authentication required' });
      }

      if (!mongoose.Types.ObjectId.isValid(channelId) || !mongoose.Types.ObjectId.isValid(messageId)) {
        return socket.emit('error', { message: 'Invalid IDs' });
      }

      const dmChannel = await DirectMessageChannel.findById(channelId);
      if (!dmChannel || dmChannel.isDeleted) {
        return socket.emit('error', { message: 'DM channel not found' });
      }

      const message = await DirectMessage.findOne({
        _id: messageId,
        channel: channelId,
        isDeleted: false
      });

      if (!message) {
        return socket.emit('error', { message: 'Message not found' });
      }

      // Only message author can delete
      if (!message.author.equals(socket.user._id)) {
        return socket.emit('error', { message: 'Can only delete your own messages' });
      }

      message.isDeleted = true;
      message.content = '';
      message.attachments = [];
      message.embeds = [];
      await message.save();

      // Emit to all participants
      io.to(`dm:${channelId}`).emit('dmMessageDelete', {
        channelId,
        messageId
      });

      socket.emit('dmMessageDeleteSuccess', { messageId });
    } catch (error) {
      console.error('Error deleting DM message:', error);
      socket.emit('error', { message: 'Failed to delete message' });
    }
  });

  // Add reaction to DM message
  socket.on('addDMReaction', async (data) => {
    try {
      const { channelId, messageId, emoji } = data;

      if (!socket.user) {
        return socket.emit('error', { message: 'Authentication required' });
      }

      if (!mongoose.Types.ObjectId.isValid(channelId) || !mongoose.Types.ObjectId.isValid(messageId)) {
        return socket.emit('error', { message: 'Invalid IDs' });
      }

      const dmChannel = await DirectMessageChannel.findById(channelId);
      if (!dmChannel || dmChannel.isDeleted) {
        return socket.emit('error', { message: 'DM channel not found' });
      }

      if (!dmChannel.participants.some(p => p.equals(socket.user._id))) {
        return socket.emit('error', { message: 'Access denied' });
      }

      const message = await DirectMessage.findOne({
        _id: messageId,
        channel: channelId,
        isDeleted: false
      });

      if (!message) {
        return socket.emit('error', { message: 'Message not found' });
      }

      // Find or create reaction
      let reaction = message.reactions.find(r => r.emoji === emoji);
      if (!reaction) {
        reaction = { emoji, count: 0, users: [] };
        message.reactions.push(reaction);
      }

      // Toggle reaction
      const userIndex = reaction.users.indexOf(socket.user._id);
      let added = false;

      if (userIndex === -1) {
        reaction.users.push(socket.user._id);
        reaction.count++;
        added = true;
      } else {
        reaction.users.splice(userIndex, 1);
        reaction.count--;
        if (reaction.count === 0) {
          message.reactions = message.reactions.filter(r => r.emoji !== emoji);
        }
      }

      await message.save();

      // Emit to all participants
      io.to(`dm:${channelId}`).emit('dmMessageReaction', {
        channelId,
        messageId,
        reaction: {
          emoji,
          count: reaction?.count || 0,
          users: reaction?.users || []
        },
        user: {
          _id: socket.user._id,
          username: socket.user.username,
          displayName: socket.user.displayName
        },
        added
      });

      socket.emit('dmReactionSuccess', { messageId, emoji, added });
    } catch (error) {
      console.error('Error adding DM reaction:', error);
      socket.emit('error', { message: 'Failed to add reaction' });
    }
  });

  // Typing indicator
  socket.on('dmTyping', async (data) => {
    try {
      const { channelId } = data;

      if (!socket.user) return;

      if (!mongoose.Types.ObjectId.isValid(channelId)) {
        return socket.emit('error', { message: 'Invalid channel ID' });
      }

      const dmChannel = await DirectMessageChannel.findById(channelId);
      if (!dmChannel || dmChannel.isDeleted) {
        return socket.emit('error', { message: 'DM channel not found' });
      }

      if (!dmChannel.participants.some(p => p.equals(socket.user._id))) {
        return socket.emit('error', { message: 'Access denied' });
      }

      // Track typing state
      const typingKey = `${channelId}:${socket.user._id}`;
      typingStates.set(typingKey, {
        channelId,
        userId: socket.user._id,
        timestamp: Date.now()
      });

      // Emit to other participants only
      socket.to(`dm:${channelId}`).emit('dmTypingStart', {
        channelId,
        user: {
          _id: socket.user._id,
          username: socket.user.username,
          discriminator: socket.user.discriminator,
          displayName: socket.user.displayName,
          avatar: socket.user.avatar
        }
      });

      // Auto-stop typing after 10 seconds
      setTimeout(() => {
        const currentState = typingStates.get(typingKey);
        if (currentState && Date.now() - currentState.timestamp >= 10000) {
          typingStates.delete(typingKey);
          socket.to(`dm:${channelId}`).emit('dmTypingStop', {
            channelId,
            userId: socket.user._id
          });
        }
      }, 10000);
    } catch (error) {
      console.error('Error handling typing:', error);
    }
  });

  // Stop typing
  socket.on('dmTypingStop', async (data) => {
    try {
      const { channelId } = data;

      if (!socket.user) return;

      const typingKey = `${channelId}:${socket.user._id}`;
      typingStates.delete(typingKey);

      socket.to(`dm:${channelId}`).emit('dmTypingStop', {
        channelId,
        userId: socket.user._id
      });
    } catch (error) {
      console.error('Error stopping typing:', error);
    }
  });

  // Mark messages as read
  socket.on('markDMRead', async (data) => {
    try {
      const { channelId, messageId } = data;

      if (!socket.user) return;

      if (!mongoose.Types.ObjectId.isValid(channelId)) {
        return socket.emit('error', { message: 'Invalid channel ID' });
      }

      const dmChannel = await DirectMessageChannel.findById(channelId);
      if (!dmChannel || dmChannel.isDeleted) {
        return socket.emit('error', { message: 'DM channel not found' });
      }

      if (!dmChannel.participants.some(p => p.equals(socket.user._id))) {
        return socket.emit('error', { message: 'Access denied' });
      }

      // Update read status
      let userReadStatus = dmChannel.readStatus.find(
        rs => rs.user?.toString() === socket.user._id.toString()
      );

      if (!userReadStatus) {
        userReadStatus = { user: socket.user._id };
        dmChannel.readStatus.push(userReadStatus);
      }

      userReadStatus.lastReadAt = new Date();

      if (messageId && mongoose.Types.ObjectId.isValid(messageId)) {
        const message = await DirectMessage.findOne({
          _id: messageId,
          channel: channelId,
          isDeleted: false
        });
        
        if (message) {
          userReadStatus.lastReadMessageId = messageId;
        }
      }

      await dmChannel.save();

      // Emit read status to other participants
      socket.to(`dm:${channelId}`).emit('dmReadUpdate', {
        channelId,
        userId: socket.user._id,
        lastReadAt: userReadStatus.lastReadAt,
        lastReadMessageId: userReadStatus.lastReadMessageId
      });

      socket.emit('dmReadSuccess', { channelId });
    } catch (error) {
      console.error('Error marking DM as read:', error);
      socket.emit('error', { message: 'Failed to mark as read' });
    }
  });

  // Leave DM room (when user disconnects or leaves channel)
  socket.on('leaveDMRoom', (data) => {
    const { channelId } = data;
    if (channelId) {
      socket.leave(`dm:${channelId}`);
    }
  });

  // Handle disconnect - clean up typing states
  socket.on('disconnect', () => {
    if (socket.user) {
      // Clean up typing states for this user
      for (const [key, data] of typingStates.entries()) {
        if (data.userId.toString() === socket.user._id.toString()) {
          typingStates.delete(key);
          
          // Notify channel that user stopped typing
          socket.to(`dm:${data.channelId}`).emit('dmTypingStop', {
            channelId: data.channelId,
            userId: socket.user._id
          });
        }
      }
    }
  });
};

export default setupDMHandlers;
