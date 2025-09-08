import express from 'express';
import mongoose from 'mongoose';
import DirectMessageChannel from '../models/DirectMessageChannel.js';
import DirectMessage from '../models/DirectMessage.js';
import User from '../models/User.js';
import Friendship from '../models/Friendship.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/dms
// @desc    Get user's DM channels
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const dmChannels = await req.user.getDMChannels();
    
    // Get last message for each channel
    const channelsWithLastMessage = await Promise.all(
      dmChannels.map(async (channel) => {
        const lastMessage = await DirectMessage.findOne({
          channel: channel._id,
          isDeleted: false
        })
        .populate('author', 'username discriminator displayName avatar')
        .sort({ createdAt: -1 });

        return {
          ...channel.toObject(),
          lastMessage
        };
      })
    );

    // Sort by last message timestamp
    channelsWithLastMessage.sort((a, b) => {
      const aTime = a.lastMessage ? a.lastMessage.createdAt : a.createdAt;
      const bTime = b.lastMessage ? b.lastMessage.createdAt : b.createdAt;
      return bTime - aTime;
    });

    res.json(channelsWithLastMessage);
  } catch (error) {
    console.error('Error fetching DM channels:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/dms
// @desc    Create/Get DM channel
// @access  Private
router.post('/', authenticate, async (req, res) => {
  try {
    const { recipientId, participants } = req.body;

    // For direct messages (1-on-1)
    if (recipientId) {
      if (!mongoose.Types.ObjectId.isValid(recipientId)) {
        return res.status(400).json({ message: 'Invalid recipient ID' });
      }

      if (recipientId === req.user._id.toString()) {
        return res.status(400).json({ message: 'Cannot create DM with yourself' });
      }

      const recipient = await User.findById(recipientId);
      if (!recipient) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Check if users are friends or if DM already exists
      const friendship = await Friendship.findOne({
        $or: [
          { requester: req.user._id, recipient: recipientId },
          { requester: recipientId, recipient: req.user._id }
        ],
        status: { $in: ['ACCEPTED', 'PENDING'] }
      });

      // Check if DM channel already exists
      let dmChannel = await DirectMessageChannel.findOne({
        type: 'DM',
        participants: { $all: [req.user._id, recipientId], $size: 2 }
      }).populate('participants', 'username discriminator displayName avatar status');

      if (dmChannel) {
        return res.json(dmChannel);
      }

      // Create new DM channel
      dmChannel = new DirectMessageChannel({
        type: 'DM',
        participants: [req.user._id, recipientId]
      });

      await dmChannel.save();

      const populatedChannel = await DirectMessageChannel.findById(dmChannel._id)
        .populate('participants', 'username discriminator displayName avatar status');

      res.status(201).json(populatedChannel);
    }
    // For group DMs
    else if (participants && Array.isArray(participants)) {
      if (participants.length < 2 || participants.length > 10) {
        return res.status(400).json({ message: 'Group DM must have 2-10 participants' });
      }

      // Validate all participant IDs
      const validParticipants = participants.filter(id => 
        mongoose.Types.ObjectId.isValid(id) && id !== req.user._id.toString()
      );

      if (validParticipants.length === 0) {
        return res.status(400).json({ message: 'No valid participants provided' });
      }

      // Check if all participants exist
      const users = await User.find({ _id: { $in: validParticipants } });
      if (users.length !== validParticipants.length) {
        return res.status(400).json({ message: 'Some participants not found' });
      }

      const allParticipants = [req.user._id, ...validParticipants];

      // Create group DM
      const groupDM = new DirectMessageChannel({
        type: 'GROUP_DM',
        participants: allParticipants,
        owner: req.user._id
      });

      await groupDM.save();

      const populatedChannel = await DirectMessageChannel.findById(groupDM._id)
        .populate('participants', 'username discriminator displayName avatar status')
        .populate('owner', 'username discriminator displayName avatar');

      res.status(201).json(populatedChannel);
    } else {
      return res.status(400).json({ message: 'Either recipientId or participants array is required' });
    }
  } catch (error) {
    console.error('Error creating DM channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/dms/:channelId
// @desc    Get DM channel details
// @access  Private
router.get('/:channelId', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const dmChannel = await DirectMessageChannel.findById(channelId)
      .populate('participants', 'username discriminator displayName avatar status lastSeen')
      .populate('owner', 'username discriminator displayName avatar');

    if (!dmChannel) {
      return res.status(404).json({ message: 'DM channel not found' });
    }

    // Check if user is a participant
    if (!dmChannel.participants.some(p => p._id.equals(req.user._id))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(dmChannel);
  } catch (error) {
    console.error('Error fetching DM channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/dms/:channelId
// @desc    Update DM channel (group DMs only)
// @access  Private
router.put('/:channelId', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { name, icon } = req.body;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const dmChannel = await DirectMessageChannel.findById(channelId);
    if (!dmChannel) {
      return res.status(404).json({ message: 'DM channel not found' });
    }

    // Only group DMs can be updated
    if (dmChannel.type !== 'GROUP_DM') {
      return res.status(400).json({ message: 'Cannot update direct message channels' });
    }

    // Check if user is the owner or participant
    if (!dmChannel.owner.equals(req.user._id) && !dmChannel.participants.includes(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update fields
    if (name !== undefined) {
      dmChannel.name = name?.trim();
    }
    if (icon !== undefined) {
      dmChannel.icon = icon;
    }

    await dmChannel.save();

    const updatedChannel = await DirectMessageChannel.findById(channelId)
      .populate('participants', 'username discriminator displayName avatar status')
      .populate('owner', 'username discriminator displayName avatar');

    // Emit update to participants
    req.app.get('io').to(`dm:${channelId}`).emit('dmChannelUpdate', updatedChannel);

    res.json(updatedChannel);
  } catch (error) {
    console.error('Error updating DM channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/dms/:channelId
// @desc    Close/Delete DM channel
// @access  Private
router.delete('/:channelId', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const dmChannel = await DirectMessageChannel.findById(channelId);
    if (!dmChannel) {
      return res.status(404).json({ message: 'DM channel not found' });
    }

    // Check if user is a participant
    if (!dmChannel.participants.includes(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (dmChannel.type === 'DM') {
      // For direct messages, just mark as closed for this user
      dmChannel.closedBy = dmChannel.closedBy || [];
      if (!dmChannel.closedBy.includes(req.user._id)) {
        dmChannel.closedBy.push(req.user._id);
        await dmChannel.save();
      }
    } else {
      // For group DMs, remove user from participants
      dmChannel.participants = dmChannel.participants.filter(p => !p.equals(req.user._id));
      
      // If no participants left or only owner left, delete the channel
      if (dmChannel.participants.length <= 1) {
        await DirectMessage.deleteMany({ channel: channelId });
        await DirectMessageChannel.findByIdAndDelete(channelId);
      } else {
        await dmChannel.save();
        
        // If owner left, transfer ownership to first participant
        if (dmChannel.owner.equals(req.user._id)) {
          dmChannel.owner = dmChannel.participants[0];
          await dmChannel.save();
        }
      }

      // Emit update to remaining participants
      req.app.get('io').to(`dm:${channelId}`).emit('dmChannelUpdate', dmChannel);
    }

    res.json({ message: 'Left DM channel successfully' });
  } catch (error) {
    console.error('Error closing DM channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/dms/:channelId/messages
// @desc    Get DM messages
// @access  Private
router.get('/:channelId/messages', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { limit = 50, before, after } = req.query;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const dmChannel = await DirectMessageChannel.findById(channelId);
    if (!dmChannel) {
      return res.status(404).json({ message: 'DM channel not found' });
    }

    // Check if user is a participant
    if (!dmChannel.participants.includes(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Build query
    const query = { channel: channelId, isDeleted: false };
    
    if (before) {
      query._id = { $lt: before };
    }
    if (after) {
      query._id = { $gt: after };
    }

    const messages = await DirectMessage.find(query)
      .populate('author', 'username discriminator displayName avatar')
      .populate('referencedMessage', 'content author')
      .populate('referencedMessage.author', 'username discriminator displayName avatar')
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit), 100));

    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching DM messages:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/dms/:channelId/messages
// @desc    Send DM message
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

    const dmChannel = await DirectMessageChannel.findById(channelId);
    if (!dmChannel) {
      return res.status(404).json({ message: 'DM channel not found' });
    }

    // Check if user is a participant
    if (!dmChannel.participants.includes(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const message = new DirectMessage({
      content: content?.trim(),
      author: req.user._id,
      channel: channelId,
      attachments: attachments || [],
      embeds: embeds || [],
      referencedMessage: referencedMessageId || null
    });

    await message.save();

    // Update channel's last activity
    dmChannel.lastActivity = new Date();
    await dmChannel.save();

    const populatedMessage = await DirectMessage.findById(message._id)
      .populate('author', 'username discriminator displayName avatar')
      .populate('referencedMessage', 'content author')
      .populate('referencedMessage.author', 'username discriminator displayName avatar');

    // Emit to Socket.IO for real-time delivery
    req.app.get('io').to(`dm:${channelId}`).emit('directMessage', populatedMessage);

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error('Error sending DM:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/dms/:channelId/typing
// @desc    Send typing indicator in DM
// @access  Private
router.post('/:channelId/typing', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const dmChannel = await DirectMessageChannel.findById(channelId);
    if (!dmChannel) {
      return res.status(404).json({ message: 'DM channel not found' });
    }

    // Check if user is a participant
    if (!dmChannel.participants.includes(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Emit typing event
    req.app.get('io').to(`dm:${channelId}`).emit('dmTyping', {
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

// @route   POST /api/dms/:channelId/read
// @desc    Mark DM messages as read
// @access  Private
router.post('/:channelId/read', authenticate, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { messageId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    const dmChannel = await DirectMessageChannel.findById(channelId);
    if (!dmChannel) {
      return res.status(404).json({ message: 'DM channel not found' });
    }

    // Check if user is a participant
    if (!dmChannel.participants.includes(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    let query = { channel: channelId };
    
    if (messageId) {
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        return res.status(400).json({ message: 'Invalid message ID' });
      }
      
      const message = await DirectMessage.findById(messageId);
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }
      
      // Mark all messages up to this message as read
      query.createdAt = { $lte: message.createdAt };
    }

    // Mark messages as read for this user
    await DirectMessage.updateMany(
      query,
      { $addToSet: { readBy: req.user._id } }
    );

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
