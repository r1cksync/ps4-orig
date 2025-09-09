import express from 'express';
import mongoose from 'mongoose';
import Channel from '../models/Channel.js';
import Server from '../models/Server.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import s3Service, { memoryUpload } from '../services/s3Service.js';

const router = express.Router();

// Utility function to check if user is member of server
const isServerMember = (server, userId) => {
  return server && server.members.some(member => 
    member.user._id ? member.user._id.toString() === userId.toString() 
                   : member.user.toString() === userId.toString()
  );
};

// Simple permission check utility - for now just check if user is member and owner has all permissions
const hasServerPermission = (server, userId, permission) => {
  if (!isServerMember(server, userId)) return false;
  
  // Server owner has all permissions
  if (server.owner.toString() === userId.toString()) return true;
  
  // For now, all members have basic permissions except manage channels
  const basicPermissions = ['viewChannels', 'readMessageHistory', 'sendMessages', 'connect', 'attachFiles'];
  if (basicPermissions.includes(permission)) return true;
  
  // Only owner can manage channels for now
  return false;
};

// @route   POST /api/channels
// @desc    Create a new channel
// @access  Private
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, type, serverId, categoryId, topic, slowMode } = req.body;

    // Validate required fields
    if (!name || !type || !serverId) {
      return res.status(400).json({ message: 'Name, type, and server ID are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId).populate('members.user');
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions (simplified - only server owner can create channels for now)
    const isOwner = server.owner.toString() === req.user._id.toString();
    if (!isOwner) {
      return res.status(403).json({ message: 'Only server owner can manage channels' });
    }

    // Get position for new channel
    const maxPosition = await Channel.findOne({ server: serverId })
      .sort({ position: -1 })
      .select('position');
    
    const position = maxPosition ? maxPosition.position + 1 : 0;

    const channel = new Channel({
      name: name.trim().toLowerCase().replace(/\s+/g, '-'),
      type,
      server: serverId,
      category: categoryId || null,
      topic: topic?.trim(),
      slowMode: slowMode || 0,
      position
    });

    await channel.save();

    const populatedChannel = await Channel.findById(channel._id)
      .populate('category', 'name')
      .populate('server', 'name');

    // Emit real-time channel created event
    req.app.get('io').to(`server:${serverId}`).emit('channelCreated', {
      serverId,
      channel: populatedChannel,
      createdBy: req.user._id
    });

    res.status(201).json(populatedChannel);
  } catch (error) {
    console.error('Error creating channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/channels/:channelId
// @desc    Get channel details
// @access  Private
router.get('/:channelId', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const channel = await Channel.findById(channelId)
      .populate('category', 'name')
      .populate('server', 'name')
      .populate('connectedUsers', 'username discriminator displayName avatar');

    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Check if user has access to this channel
    const server = await Server.findById(channel.server);
    if (!server || !isServerMember(server, req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const canView = hasServerPermission(server, req.user._id, 'viewChannels');
    if (!canView) {
      return res.status(403).json({ message: 'Cannot view this channel' });
    }

    res.json(channel);
  } catch (error) {
    console.error('Error fetching channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/channels/:channelId
// @desc    Update channel
// @access  Private
router.put('/:channelId', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { name, topic, slowMode, position } = req.body;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    const canManageChannels = hasServerPermission(server, req.user._id, 'manageChannels');
    if (!canManageChannels) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    // Update fields
    if (name) {
      channel.name = name.trim().toLowerCase().replace(/\s+/g, '-');
    }
    if (topic !== undefined) {
      channel.topic = topic?.trim();
    }
    if (slowMode !== undefined) {
      channel.slowMode = slowMode;
    }
    if (position !== undefined) {
      channel.position = position;
    }

    await channel.save();

    const updatedChannel = await Channel.findById(channelId)
      .populate('category', 'name')
      .populate('server', 'name');

    // Emit real-time channel updated event
    req.app.get('io').to(`server:${updatedChannel.server._id}`).emit('channelUpdated', {
      serverId: updatedChannel.server._id,
      channel: updatedChannel,
      updatedBy: req.user._id,
      changes: { name, topic, slowMode, position }
    });

    res.json(updatedChannel);
  } catch (error) {
    console.error('Error updating channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/channels/:channelId
// @desc    Delete channel
// @access  Private
router.delete('/:channelId', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    const canManageChannels = hasServerPermission(server, req.user._id, 'manageChannels');
    if (!canManageChannels) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    // Delete all messages in the channel
    await Message.deleteMany({ channel: channelId });

    // Delete the channel
    await Channel.findByIdAndDelete(channelId);

    // Emit real-time channel deleted event
    req.app.get('io').to(`server:${channel.server}`).emit('channelDeleted', {
      serverId: channel.server,
      channelId,
      channelName: channel.name,
      deletedBy: req.user._id
    });

    res.json({ message: 'Channel deleted successfully' });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/channels/:channelId/messages
// @desc    Get channel messages
// @access  Private
router.get('/:channelId/messages', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { limit = 50, before, after } = req.query;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server);
    if (!server || !isServerMember(server, req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const canView = hasServerPermission(server, req.user._id, 'viewChannels');
    const canReadHistory = hasServerPermission(server, req.user._id, 'readMessageHistory');
    
    if (!canView || !canReadHistory) {
      return res.status(403).json({ message: 'Cannot read messages in this channel' });
    }

    // Build query
    const query = { channel: channelId, isDeleted: false };
    
    if (before) {
      query._id = { $lt: before };
    }
    if (after) {
      query._id = { $gt: after };
    }

    const messages = await Message.find(query)
      .populate('author', 'username discriminator displayName avatar')
      .populate('reference.messageId', 'content author')
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit), 100));

    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/channels/:channelId/messages
// @desc    Send message to channel
// @access  Private
router.post('/:channelId/messages', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { content, attachments, embeds, referencedMessageId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    if (!content && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ message: 'Message content or attachments required' });
    }

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server);
    if (!server || !isServerMember(server, req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const canSend = hasServerPermission(server, req.user._id, 'sendMessages');
    if (!canSend) {
      return res.status(403).json({ message: 'Cannot send messages in this channel' });
    }

    // Check slow mode
    if (channel.slowMode > 0) {
      const lastMessage = await Message.findOne({
        channel: channelId,
        author: req.user._id
      }).sort({ createdAt: -1 });

      if (lastMessage) {
        const timeDiff = Date.now() - lastMessage.createdAt.getTime();
        if (timeDiff < channel.slowMode * 1000) {
          const remainingTime = Math.ceil((channel.slowMode * 1000 - timeDiff) / 1000);
          return res.status(429).json({ 
            message: `Slow mode is enabled. Please wait ${remainingTime} seconds.` 
          });
        }
      }
    }

    const message = new Message({
      content: content?.trim(),
      author: req.user._id,
      channel: channelId,
      server: channel.server,
      attachments: attachments || [],
      embeds: embeds || [],
      reference: referencedMessageId ? {
        messageId: referencedMessageId,
        channelId: channelId,
        serverId: channel.server
      } : undefined
    });

    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('author', 'username discriminator displayName avatar')
      .populate('reference.messageId', 'content author');

    // Emit to Socket.IO for real-time delivery
    req.app.get('io').to(`channel:${channelId}`).emit('message', populatedMessage);

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/channels/:channelId/typing
// @desc    Send typing indicator
// @access  Private
router.post('/:channelId/typing', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server);
    if (!server || !isServerMember(server, req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const canSend = hasServerPermission(server, req.user._id, 'sendMessages');
    if (!canSend) {
      return res.status(403).json({ message: 'Cannot send messages in this channel' });
    }

    // Emit typing event
    req.app.get('io').to(`channel:${channelId}`).emit('typing', {
      channelId,
      user: {
        _id: req.user._id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        displayName: req.user.displayName,
        avatar: req.user.avatar
      }
    });

    res.json({ message: 'Typing indicator sent' });
  } catch (error) {
    console.error('Error sending typing indicator:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/channels/:channelId/upload
// @desc    Upload file to channel
// @access  Private
router.post('/:channelId/upload', authenticate, memoryUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    const { channelId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server);
    if (!server || !isServerMember(server, req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const canSend = hasServerPermission(server, req.user._id, 'sendMessages');
    const canAttach = hasServerPermission(server, req.user._id, 'attachFiles');
    if (!canSend || !canAttach) {
      return res.status(403).json({ message: 'Cannot upload files in this channel' });
    }

    // Upload file to S3
    const uploadResult = await s3Service.uploadFile(req.file, req.user.id, 'channel-attachments');
    
    // Generate signed URL for immediate access
    const signedUrl = await s3Service.getSignedUrl(uploadResult.key, 86400); // 24 hours

    const attachment = {
      id: uploadResult.key,
      filename: uploadResult.filename,
      contentType: req.file.mimetype,
      size: uploadResult.size,
      url: signedUrl,
      proxyUrl: uploadResult.url,
      // Add dimensions for images
      ...(req.file.mimetype.startsWith('image/') && {
        height: null, // Can be enhanced with image processing
        width: null
      })
    };

    res.status(201).json({
      success: true,
      data: {
        attachment,
        message: 'File uploaded successfully'
      }
    });

  } catch (error) {
    console.error('Channel file upload error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      userId: req.user._id,
      channelId: req.params.channelId,
      fileName: req.file?.originalname
    });
    res.status(500).json({ message: 'Failed to upload file', error: error.message });
  }
});

// @route   POST /api/channels/:channelId/messages/with-file
// @desc    Send message with file attachment to channel
// @access  Private
router.post('/:channelId/messages/with-file', authenticate, memoryUpload.single('file'), async (req, res) => {
  try {
    const { channelId } = req.params;
    const { content } = req.body;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    if (!content && !req.file) {
      return res.status(400).json({ message: 'Message content or file required' });
    }

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server);
    if (!server || !isServerMember(server, req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const canSend = hasServerPermission(server, req.user._id, 'sendMessages');
    if (req.file) {
      const canAttach = hasServerPermission(server, req.user._id, 'attachFiles');
      if (!canSend || !canAttach) {
        return res.status(403).json({ message: 'Cannot send files in this channel' });
      }
    } else if (!canSend) {
      return res.status(403).json({ message: 'Cannot send messages in this channel' });
    }

    // Check slow mode
    if (channel.slowMode > 0) {
      const lastMessage = await Message.findOne({
        channel: channelId,
        author: req.user._id
      }).sort({ createdAt: -1 });

      if (lastMessage) {
        const timeDiff = Date.now() - lastMessage.createdAt.getTime();
        if (timeDiff < channel.slowMode * 1000) {
          const remainingTime = Math.ceil((channel.slowMode * 1000 - timeDiff) / 1000);
          return res.status(429).json({ 
            message: `Slow mode is enabled. Please wait ${remainingTime} seconds.` 
          });
        }
      }
    }

    let attachments = [];

    // Upload file if provided
    if (req.file) {
      try {
        const uploadResult = await s3Service.uploadFile(req.file, req.user.id, 'channel-attachments');
        const signedUrl = await s3Service.getSignedUrl(uploadResult.key, 86400);

        attachments.push({
          id: uploadResult.key,
          filename: uploadResult.filename,
          contentType: req.file.mimetype,
          size: uploadResult.size,
          url: signedUrl,
          proxyUrl: uploadResult.url,
          // Add dimensions for images
          ...(req.file.mimetype.startsWith('image/') && {
            height: null, // Can be enhanced with image processing
            width: null
          })
        });
      } catch (uploadError) {
        console.error('File upload error:', uploadError);
        return res.status(500).json({ message: 'Failed to upload file' });
      }
    }

    const message = new Message({
      content: content?.trim() || '',
      author: req.user._id,
      channel: channelId,
      server: channel.server,
      attachments,
      type: req.file ? 'FILE_ATTACHMENT' : 'DEFAULT'
    });

    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('author', 'username discriminator displayName avatar');

    // Emit to Socket.IO for real-time delivery
    req.app.get('io').to(`channel:${channelId}`).emit('message', populatedMessage);

    res.status(201).json(populatedMessage);

  } catch (error) {
    console.error('Error sending message with file:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      channelId: req.params.channelId,
      userId: req.user._id,
      hasFile: !!req.file
    });
    res.status(500).json({ 
      message: 'Server error',
      details: error.message 
    });
  }
});

// @route   POST /api/channels/:channelId/voice/join
// @desc    Join voice channel
// @access  Private
router.post('/:channelId/voice/join', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (channel.type !== 'VOICE') {
      return res.status(400).json({ message: 'Not a voice channel' });
    }

    const server = await Server.findById(channel.server);
    if (!server || !isServerMember(server, req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const canConnect = hasServerPermission(server, req.user._id, 'connect');
    if (!canConnect) {
      return res.status(403).json({ message: 'Cannot connect to this voice channel' });
    }

    await channel.addConnectedUser(req.user._id);

    // Emit voice state update
    req.app.get('io').to(`server:${channel.server}`).emit('voiceStateUpdate', {
      channelId,
      userId: req.user._id,
      user: {
        username: req.user.username,
        discriminator: req.user.discriminator,
        displayName: req.user.displayName,
        avatar: req.user.avatar
      },
      joined: true
    });

    res.json({ message: 'Joined voice channel' });
  } catch (error) {
    console.error('Error joining voice channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/channels/:channelId/voice/leave
// @desc    Leave voice channel
// @access  Private
router.post('/:channelId/voice/leave', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (channel.type !== 'VOICE') {
      return res.status(400).json({ message: 'Not a voice channel' });
    }

    await channel.removeConnectedUser(req.user._id);

    // Emit voice state update
    req.app.get('io').to(`server:${channel.server}`).emit('voiceStateUpdate', {
      channelId,
      userId: req.user._id,
      user: {
        username: req.user.username,
        discriminator: req.user.discriminator,
        displayName: req.user.displayName,
        avatar: req.user.avatar
      },
      joined: false
    });

    res.json({ message: 'Left voice channel' });
  } catch (error) {
    console.error('Error leaving voice channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
