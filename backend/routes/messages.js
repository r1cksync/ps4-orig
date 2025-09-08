import express from 'express';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Channel from '../models/Channel.js';
import Server from '../models/Server.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Utility function to check if user is member of server
const isServerMember = (server, userId) => {
  return server && server.members.some(member => 
    member.user._id ? member.user._id.toString() === userId.toString() 
                   : member.user.toString() === userId.toString()
  );
};

// Simple permission check utility
const hasServerPermission = (server, userId, permission) => {
  if (!isServerMember(server, userId)) return false;
  
  // Server owner has all permissions
  if (server.owner.toString() === userId.toString()) return true;
  
  // For now, all members have basic permissions
  const basicPermissions = ['addReactions', 'removeReactions', 'deleteMessages'];
  if (basicPermissions.includes(permission)) return true;
  
  return false;
};

// @route   GET /api/messages/:messageId
// @desc    Get specific message
// @access  Private
router.get('/:messageId', authenticate, async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: 'Invalid message ID' });
    }

    const message = await Message.findById(messageId)
      .populate('author', 'username discriminator displayName avatar')
      .populate('referencedMessage', 'content author')
      .populate('referencedMessage.author', 'username discriminator displayName avatar');

    if (!message || message.isDeleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user has access to this message
    const channel = await Channel.findById(message.channel);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server);
    if (!server || !server.isMember(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const canView = await server.hasPermission(req.user._id, 'viewChannels', message.channel);
    const canReadHistory = await server.hasPermission(req.user._id, 'readMessageHistory', message.channel);
    
    if (!canView || !canReadHistory) {
      return res.status(403).json({ message: 'Cannot view this message' });
    }

    res.json(message);
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/messages/:messageId
// @desc    Edit message
// @access  Private
router.put('/:messageId', authenticate, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: 'Invalid message ID' });
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user is the author
    if (!message.author.equals(req.user._id)) {
      return res.status(403).json({ message: 'Can only edit your own messages' });
    }

    // Check if message is too old to edit (24 hours)
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (message.createdAt < dayAgo) {
      return res.status(403).json({ message: 'Cannot edit messages older than 24 hours' });
    }

    // Update message content
    message.content = content.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    const updatedMessage = await Message.findById(messageId)
      .populate('author', 'username discriminator displayName avatar')
      .populate('reference.messageId', 'content author')
      .populate('reference.messageId.author', 'username discriminator displayName avatar');

    // Emit update to Socket.IO
    req.app.get('io').to(`channel:${message.channel}`).emit('messageUpdate', updatedMessage);

    res.json(updatedMessage);
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/messages/:messageId
// @desc    Delete message
// @access  Private
router.delete('/:messageId', authenticate, async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: 'Invalid message ID' });
    }

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const channel = await Channel.findById(message.channel);
    const server = await Server.findById(channel.server);

    // Check if user can delete this message
    const isAuthor = message.author.equals(req.user._id);
    const canManageMessages = await server.hasPermission(req.user._id, 'manageMessages', message.channel);

    if (!isAuthor && !canManageMessages) {
      return res.status(403).json({ message: 'Cannot delete this message' });
    }

    await message.softDelete();

    // Emit deletion to Socket.IO
    req.app.get('io').to(`channel:${message.channel}`).emit('messageDelete', {
      messageId: message._id,
      channelId: message.channel
    });

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/messages/:messageId/reactions
// @desc    Add reaction to message
// @access  Private
router.post('/:messageId/reactions', authenticate, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: 'Invalid message ID' });
    }

    if (!emoji || !emoji.name) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user has access to this message
    const channel = await Channel.findById(message.channel);
    const server = await Server.findById(channel.server);
    
    if (!server || !isServerMember(server, req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const canAddReactions = hasServerPermission(server, req.user._id, 'addReactions');
    if (!canAddReactions) {
      return res.status(403).json({ message: 'Cannot add reactions to messages' });
    }

    await message.addReaction(req.user._id, emoji);

    const updatedMessage = await Message.findById(messageId)
      .populate('author', 'username discriminator displayName avatar')
      .populate('reactions.users', 'username discriminator displayName avatar');

    // Emit reaction update to Socket.IO
    req.app.get('io').to(`channel:${message.channel}`).emit('reactionAdd', {
      messageId: message._id,
      channelId: message.channel,
      emoji,
      user: {
        _id: req.user._id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        displayName: req.user.displayName,
        avatar: req.user.avatar
      }
    });

    res.json(updatedMessage);
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/messages/:messageId/reactions/:emojiName
// @desc    Remove reaction from message
// @access  Private
router.delete('/:messageId/reactions/:emojiName', authenticate, async (req, res) => {
  try {
    const { messageId, emojiName } = req.params;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: 'Invalid message ID' });
    }

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user has access to this message
    const channel = await Channel.findById(message.channel);
    const server = await Server.findById(channel.server);
    
    if (!server || !server.isMember(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await message.removeReaction(req.user._id, { name: emojiName });

    const updatedMessage = await Message.findById(messageId)
      .populate('author', 'username discriminator displayName avatar')
      .populate('reactions.users', 'username discriminator displayName avatar');

    // Emit reaction update to Socket.IO
    req.app.get('io').to(`channel:${message.channel}`).emit('reactionRemove', {
      messageId: message._id,
      channelId: message.channel,
      emoji: { name: emojiName },
      user: {
        _id: req.user._id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        displayName: req.user.displayName,
        avatar: req.user.avatar
      }
    });

    res.json(updatedMessage);
  } catch (error) {
    console.error('Error removing reaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/messages/:messageId/pin
// @desc    Pin message
// @access  Private
router.post('/:messageId/pin', authenticate, async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: 'Invalid message ID' });
    }

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const channel = await Channel.findById(message.channel);
    const server = await Server.findById(channel.server);

    // Check permissions
    const canManageMessages = await server.hasPermission(req.user._id, 'manageMessages', message.channel);
    if (!canManageMessages) {
      return res.status(403).json({ message: 'Cannot pin messages in this channel' });
    }

    message.isPinned = true;
    message.pinnedAt = new Date();
    message.pinnedBy = req.user._id;
    await message.save();

    const updatedMessage = await Message.findById(messageId)
      .populate('author', 'username discriminator displayName avatar')
      .populate('pinnedBy', 'username discriminator displayName avatar');

    // Emit pin update to Socket.IO
    req.app.get('io').to(`channel:${message.channel}`).emit('messagePin', {
      messageId: message._id,
      channelId: message.channel,
      pinnedBy: req.user
    });

    res.json(updatedMessage);
  } catch (error) {
    console.error('Error pinning message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/messages/:messageId/pin
// @desc    Unpin message
// @access  Private
router.delete('/:messageId/pin', authenticate, async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: 'Invalid message ID' });
    }

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const channel = await Channel.findById(message.channel);
    const server = await Server.findById(channel.server);

    // Check permissions
    const canManageMessages = await server.hasPermission(req.user._id, 'manageMessages', message.channel);
    if (!canManageMessages) {
      return res.status(403).json({ message: 'Cannot unpin messages in this channel' });
    }

    message.isPinned = false;
    message.pinnedAt = null;
    message.pinnedBy = null;
    await message.save();

    const updatedMessage = await Message.findById(messageId)
      .populate('author', 'username discriminator displayName avatar');

    // Emit unpin update to Socket.IO
    req.app.get('io').to(`channel:${message.channel}`).emit('messageUnpin', {
      messageId: message._id,
      channelId: message.channel
    });

    res.json(updatedMessage);
  } catch (error) {
    console.error('Error unpinning message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/messages/search
// @desc    Search messages
// @access  Private
router.get('/search', authenticate, async (req, res) => {
  try {
    const { query, channelId, serverId, authorId, limit = 25, offset = 0 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }

    // Build search filter
    const searchFilter = {
      isDeleted: false,
      $text: { $search: query }
    };

    if (channelId && mongoose.Types.ObjectId.isValid(channelId)) {
      searchFilter.channel = channelId;
    }

    if (serverId && mongoose.Types.ObjectId.isValid(serverId)) {
      searchFilter.server = serverId;
    }

    if (authorId && mongoose.Types.ObjectId.isValid(authorId)) {
      searchFilter.author = authorId;
    }

    // Get channels user has access to
    let accessibleChannels = [];
    if (serverId) {
      const server = await Server.findById(serverId);
      if (!server || !server.isMember(req.user._id)) {
        return res.status(403).json({ message: 'Access denied to this server' });
      }

      const channels = await Channel.find({ server: serverId });
      for (const channel of channels) {
        const canView = await server.hasPermission(req.user._id, 'viewChannels', channel._id);
        const canReadHistory = await server.hasPermission(req.user._id, 'readMessageHistory', channel._id);
        if (canView && canReadHistory) {
          accessibleChannels.push(channel._id);
        }
      }

      if (!channelId) {
        searchFilter.channel = { $in: accessibleChannels };
      }
    }

    const messages = await Message.find(searchFilter)
      .populate('author', 'username discriminator displayName avatar')
      .populate('channel', 'name server')
      .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
      .skip(parseInt(offset))
      .limit(Math.min(parseInt(limit), 50));

    res.json({
      messages,
      hasMore: messages.length === parseInt(limit)
    });
  } catch (error) {
    console.error('Error searching messages:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
