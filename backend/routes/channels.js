import express from 'express';
import mongoose from 'mongoose';
import Channel from '../models/Channel.js';
import Server from '../models/Server.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import s3Service, { memoryUpload } from '../services/s3Service.js';
import { body, param, validationResult } from 'express-validator';
import Call from '../models/Call.js';

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
    const { name, type, serverId, settings } = req.body;

    // Validate required fields
    if (!name || !type || !serverId) {
      return res.status(400).json({ message: 'Name, type, and serverId are required' });
    }

    // Validate channel type
    const validTypes = ['TEXT', 'VOICE', 'CATEGORY', 'NEWS', 'STORE'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: 'Invalid channel type' });
    }

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    // Validate server exists and user permissions
    const server = await Server.findById(serverId).populate('members.user');
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check if user is owner (only owners can create channels for now)
    const isOwner = server.owner.toString() === req.user._id.toString();
    if (!isOwner) {
      return res.status(403).json({ message: 'Only server owner can manage channels' });
    }

    // Calculate position
    const lastChannel = await Channel.findOne({ server: serverId, isDeleted: false }).sort({ position: -1 });
    const position = lastChannel ? lastChannel.position + 1 : 0;

    // Create channel with explicit settings mapping
    const channel = new Channel({
      name: name.trim().toLowerCase().replace(/\s+/g, '-'),
      type,
      server: serverId,
      category: settings?.categoryId || null,
      position,
      settings: {
        topic: settings?.topic?.trim() || '',
        isNsfw: settings?.isNsfw ?? false,
        slowMode: settings?.slowMode ?? 0,
        bitrate: type === 'VOICE' ? (settings?.bitrate || 64) : undefined,
        userLimit: type === 'VOICE' ? (settings?.userLimit || 0) : undefined
      },
      permissions: [],
      connectedUsers: [],
      isDeleted: false
    });

    await channel.save();

    // Populate server and category for response
    const populatedChannel = await Channel.findById(channel._id)
      .populate('server', 'name')
      .populate('category', 'name');

    // Emit Socket.IO event
    req.app.get('io').to(`server:${serverId}`).emit('channelCreated', {
      serverId,
      channel: {
        _id: channel._id,
        name: channel.name,
        type: channel.type,
        server: { _id: server._id, name: server.name },
        settings: {
          topic: channel.settings.topic,
          isNsfw: channel.settings.isNsfw,
          slowMode: channel.settings.slowMode,
          bitrate: channel.settings.bitrate,
          userLimit: channel.settings.userLimit
        },
        position: channel.position,
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt,
        category: channel.category,
        connectedUsers: channel.connectedUsers,
        permissions: channel.permissions,
        isDeleted: channel.isDeleted
      },
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
      .populate('server', 'name')
      .populate('category', 'name')
      .populate('connectedUsers.user', 'name avatar');

    if (!channel || channel.isDeleted) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Check if user has access to this channel
    const server = await Server.findById(channel.server).populate('members.user');
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
    const { name, topic, nsfw, slowMode, position, bitrate, userLimit } = req.body;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const channel = await Channel.findById(channelId);
    if (!channel || channel.isDeleted) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server).populate('members.user');
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    const canManageChannels = hasServerPermission(server, req.user._id, 'manageChannels');
    if (!canManageChannels) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    // Validate fields
    if (name && (name.length < 1 || name.length > 100)) {
      return res.status(400).json({ message: 'Channel name must be between 1 and 100 characters' });
    }
    if (topic && topic.length > 1024) {
      return res.status(400).json({ message: 'Topic must be 1024 characters or less' });
    }
    if (slowMode !== undefined && (slowMode < 0 || slowMode > 21600)) {
      return res.status(400).json({ message: 'Slow mode must be between 0 and 21600 seconds' });
    }
    if (channel.type === 'VOICE') {
      if (bitrate !== undefined && (bitrate < 8 || bitrate > 384)) {
        return res.status(400).json({ message: 'Bitrate must be between 8 and 384 kbps' });
      }
      if (userLimit !== undefined && (userLimit < 0 || userLimit > 99)) {
        return res.status(400).json({ message: 'User limit must be between 0 and 99' });
      }
    }

    // Update fields
    const changes = {};
    if (name) {
      channel.name = name.trim().toLowerCase().replace(/\s+/g, '-');
      changes.name = channel.name;
    }
    if (topic !== undefined) {
      channel.settings.topic = topic?.trim() || '';
      changes.topic = channel.settings.topic;
    }
    if (nsfw !== undefined) {
      channel.settings.isNsfw = nsfw;
      changes.nsfw = channel.settings.isNsfw;
    }
    if (slowMode !== undefined) {
      channel.settings.slowMode = slowMode;
      changes.slowMode = channel.settings.slowMode;
    }
    if (position !== undefined) {
      channel.position = position;
      changes.position = channel.position;
    }
    if (channel.type === 'VOICE') {
      if (bitrate !== undefined) {
        channel.settings.bitrate = bitrate;
        changes.bitrate = channel.settings.bitrate;
      }
      if (userLimit !== undefined) {
        channel.settings.userLimit = userLimit;
        changes.userLimit = channel.settings.userLimit;
      }
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
      changes
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
    if (!channel || channel.isDeleted) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const server = await Server.findById(channel.server).populate('members.user');
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
   const io = req.app.get('io');
    console.log('Emitting message to channel:', `channel:${channelId}`, populatedMessage);
    io.to(`channel:${channelId}`).emit('message', populatedMessage);

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

// Get active call in a voice channel (visible to all server members)
router.get('/voice-channel/:channelId/active', [
  authenticate,
  param('channelId').isMongoId().withMessage('Invalid channel ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { channelId } = req.params;

    // Check if channel exists and user has access
    const channel = await Channel.findById(channelId).populate('server');
    if (!channel || channel.type !== 'VOICE') {
      return res.status(404).json({ message: 'Voice channel not found' });
    }

    const server = channel.server;
    if (!isServerMember(server, req.user.id)) {  // Reuse your utility function
      return res.status(403).json({ message: 'Access denied to this channel' });
    }

    const call = await Call.getActiveCall(channelId, 'VOICE_CHANNEL');
    if (!call) {
      return res.status(404).json({ message: 'No active call in this channel' });
    }

    res.json({ call });

  } catch (error) {
    console.error('Error fetching active call:', error);
    res.status(500).json({ message: 'Internal server error' });
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
