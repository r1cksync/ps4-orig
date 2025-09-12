import express from 'express';
import mongoose from 'mongoose';
import DirectMessageChannel from '../models/DirectMessageChannel.js';
import DirectMessage from '../models/DirectMessage.js';
import User from '../models/User.js';
import Friendship from '../models/Friendship.js';
import Server from '../models/Server.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import s3Service, { memoryUpload } from '../services/s3Service.js';

const router = express.Router();

// Helper function to check if users can DM (Discord-like logic)
async function checkDMPermissions(userId1, userId2) {
  try {
    // Check if users are friends
    const friendship = await Friendship.findOne({
      $or: [
        { requester: userId1, recipient: userId2, status: 'ACCEPTED' },
        { requester: userId2, recipient: userId1, status: 'ACCEPTED' }
      ]
    });

    if (friendship) {
      return { allowed: true, reason: 'Friends' };
    }

    // Check if users share a mutual server
    const user1Servers = await Server.find({
      'members.user': userId1,
      'members.isActive': true
    }).select('_id');

    const user2Servers = await Server.find({
      'members.user': userId2,
      'members.isActive': true
    }).select('_id');

    const user1ServerIds = user1Servers.map(s => s._id.toString());
    const user2ServerIds = user2Servers.map(s => s._id.toString());
    
    const mutualServers = user1ServerIds.filter(id => user2ServerIds.includes(id));
    
    if (mutualServers.length > 0) {
      return { allowed: true, reason: 'Mutual server' };
    }

    // If no mutual connection, DM is not allowed
    return { 
      allowed: false, 
      reason: 'You can only send direct messages to friends or users in mutual servers' 
    };
  } catch (error) {
    console.error('Error checking DM permissions:', error);
    return { allowed: false, reason: 'Error checking permissions' };
  }
}

// Helper function to check if user can manage group DM
function canManageGroupDM(channel, userId) {
  return channel.owner && channel.owner.toString() === userId.toString();
}

// @route   GET /api/dms
// @desc    Get user's DM channels
// @access  Private
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const dmChannels = await req.user.getDMChannels();
  
  // Get last message for each channel and unread count
  const channelsWithDetails = await Promise.all(
    dmChannels.map(async (channel) => {
      const lastMessage = await DirectMessage.findOne({
        channel: channel._id,
        isDeleted: false
      })
      .populate('author', 'username discriminator displayName avatar')
      .sort({ createdAt: -1 });

      // Get user's read status for this channel
      const userReadStatus = channel.readStatus?.find(
        rs => rs.user?.toString() === req.user._id.toString()
      );

      // Count unread messages
      let unreadCount = 0;
      if (userReadStatus?.lastReadAt) {
        unreadCount = await DirectMessage.countDocuments({
          channel: channel._id,
          createdAt: { $gt: userReadStatus.lastReadAt },
          author: { $ne: req.user._id },
          isDeleted: false
        });
      } else {
        // If no read status, count all messages from others
        unreadCount = await DirectMessage.countDocuments({
          channel: channel._id,
          author: { $ne: req.user._id },
          isDeleted: false
        });
      }

      return {
        ...channel.toObject(),
        lastMessage,
        unreadCount
      };
    })
  );

  // Sort by last message timestamp (most recent first)
  channelsWithDetails.sort((a, b) => {
    const aTime = a.lastMessage ? a.lastMessage.createdAt : a.createdAt;
    const bTime = b.lastMessage ? b.lastMessage.createdAt : b.createdAt;
    return bTime - aTime;
  });

  res.json({ success: true, data: channelsWithDetails });
}));

// @route   POST /api/dms
// @desc    Create/Get DM channel with Discord-like permissions
// @access  Private
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { recipientId, participants, groupName } = req.body;

  // For direct messages (1-on-1)
  if (recipientId) {
    if (!mongoose.Types.ObjectId.isValid(recipientId)) {
      throw new ApiError('Invalid recipient ID', 400);
    }

    if (recipientId === req.user._id.toString()) {
      throw new ApiError('Cannot create DM with yourself', 400);
    }

    const recipient = await User.findById(recipientId);
    if (!recipient || !recipient.isActive) {
      throw new ApiError('User not found or inactive', 404);
    }

    // Check if users are blocked
    const isBlocked = await Friendship.isBlocked(req.user._id, recipientId);
    if (isBlocked) {
      throw new ApiError('Cannot send DM to blocked user', 403);
    }

    // Check DM permissions (Discord-like logic)
    const canDM = await checkDMPermissions(req.user._id, recipientId);
    if (!canDM.allowed) {
      throw new ApiError(canDM.reason, 403);
    }

    // Check if DM channel already exists
    let dmChannel = await DirectMessageChannel.findOne({
      type: 'DM',
      participants: { $all: [req.user._id, recipientId], $size: 2 },
      isDeleted: false
    }).populate('participants', 'username discriminator displayName avatar status lastSeen');

    if (dmChannel) {
      return res.json({ success: true, data: dmChannel });
    }

    // Create new DM channel
    dmChannel = new DirectMessageChannel({
      type: 'DM',
      participants: [req.user._id, recipientId],
      readStatus: [
        { user: req.user._id, lastReadAt: new Date() },
        { user: recipientId, lastReadAt: new Date() }
      ]
    });

    await dmChannel.save();

    const populatedChannel = await DirectMessageChannel.findById(dmChannel._id)
      .populate('participants', 'username discriminator displayName avatar status lastSeen');

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${recipientId}`).emit('dmChannelCreated', {
        channel: populatedChannel,
        initiator: {
          _id: req.user._id,
          username: req.user.username,
          displayName: req.user.displayName
        }
      });
    }

    res.status(201).json({ success: true, data: populatedChannel });
  }
  // For group DMs
  else if (participants && Array.isArray(participants)) {
    if (participants.length < 1 || participants.length > 9) {
      throw new ApiError('Group DM must have 1-9 additional participants (max 10 total)', 400);
    }

    // Validate all participant IDs
    const validParticipants = participants.filter(id => 
      mongoose.Types.ObjectId.isValid(id) && id !== req.user._id.toString()
    );

    if (validParticipants.length === 0) {
      throw new ApiError('No valid participants provided', 400);
    }

    // Check if all participants exist and are active
    const users = await User.find({ 
      _id: { $in: validParticipants },
      isActive: true 
    });
    
    if (users.length !== validParticipants.length) {
      throw new ApiError('Some participants not found or inactive', 400);
    }

    // Check if creator can DM all participants
    for (const participantId of validParticipants) {
      const isBlocked = await Friendship.isBlocked(req.user._id, participantId);
      if (isBlocked) {
        throw new ApiError(`Cannot create group DM with blocked user`, 403);
      }

      const canDM = await checkDMPermissions(req.user._id, participantId);
      if (!canDM.allowed) {
        throw new ApiError(`Cannot create group DM: ${canDM.reason}`, 403);
      }
    }

    const allParticipants = [req.user._id, ...validParticipants];

    // Check if identical group DM already exists
    const existingGroupDM = await DirectMessageChannel.findOne({
      type: 'GROUP_DM',
      participants: { $all: allParticipants, $size: allParticipants.length },
      isDeleted: false
    });

    if (existingGroupDM) {
      const populated = await DirectMessageChannel.findById(existingGroupDM._id)
        .populate('participants', 'username discriminator displayName avatar status lastSeen')
        .populate('owner', 'username discriminator displayName avatar');
      return res.json({ success: true, data: populated });
    }

    // Create group DM
    const groupDM = new DirectMessageChannel({
      type: 'GROUP_DM',
      participants: allParticipants,
      owner: req.user._id,
      name: groupName || null,
      readStatus: allParticipants.map(userId => ({
        user: userId,
        lastReadAt: new Date()
      }))
    });

    await groupDM.save();

    const populatedChannel = await DirectMessageChannel.findById(groupDM._id)
      .populate('participants', 'username discriminator displayName avatar status lastSeen')
      .populate('owner', 'username discriminator displayName avatar');

    // Create system message for group creation
    const systemMessage = new DirectMessage({
      content: `${req.user.displayName} created the group`,
      author: req.user._id,
      channel: groupDM._id,
      type: 'SYSTEM'
    });
    await systemMessage.save();

    // Update channel's last message
    groupDM.lastMessage = systemMessage._id;
    groupDM.lastMessageAt = new Date();
    await groupDM.save();

    // Emit real-time events to all participants
    const io = req.app.get('io');
    if (io) {
      validParticipants.forEach(participantId => {
        io.to(`user:${participantId}`).emit('groupDMCreated', {
          channel: populatedChannel,
          creator: {
            _id: req.user._id,
            username: req.user.username,
            displayName: req.user.displayName
          }
        });
      });
    }

    res.status(201).json({ success: true, data: populatedChannel });
  } else {
    throw new ApiError('Either recipientId or participants array is required', 400);
  }
}));

// @route   GET /api/dms/:channelId
// @desc    Get DM channel details
// @access  Private
router.get('/:channelId', authenticate, asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError('Invalid channel ID', 400);
  }

  const dmChannel = await DirectMessageChannel.findById(channelId)
    .populate('participants', 'username discriminator displayName avatar status lastSeen')
    .populate('owner', 'username discriminator displayName avatar');

  if (!dmChannel || dmChannel.isDeleted) {
    throw new ApiError('DM channel not found', 404);
  }

  // Check if user is a participant
  if (!dmChannel.participants.some(p => p._id.equals(req.user._id))) {
    throw new ApiError('Access denied', 403);
  }

  res.json({ success: true, data: dmChannel });
}));

// @route   PUT /api/dms/:channelId
// @desc    Update DM channel (group DMs only)
// @access  Private
router.put('/:channelId', authenticate, asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { name, icon } = req.body;

  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError('Invalid channel ID', 400);
  }

  const dmChannel = await DirectMessageChannel.findById(channelId)
    .populate('participants', 'username discriminator displayName avatar status lastSeen')
    .populate('owner', 'username discriminator displayName avatar');

  if (!dmChannel || dmChannel.isDeleted) {
    throw new ApiError('DM channel not found', 404);
  }

  // Only group DMs can be updated
  if (dmChannel.type !== 'GROUP_DM') {
    throw new ApiError('Cannot update direct message channels', 400);
  }

  // Check if user is a participant
  if (!dmChannel.participants.some(p => p._id.equals(req.user._id))) {
    throw new ApiError('Access denied', 403);
  }

  // Update channel
  if (name !== undefined) {
    if (name && name.length > 100) {
      throw new ApiError('Channel name too long (max 100 characters)', 400);
    }
    dmChannel.name = name;
  }

  if (icon !== undefined) {
    dmChannel.icon = icon;
  }

  await dmChannel.save();

  // Create system message for name change
  if (name !== undefined) {
    const systemMessage = new DirectMessage({
      content: name 
        ? `${req.user.displayName} changed the group name to "${name}"` 
        : `${req.user.displayName} removed the group name`,
      author: req.user._id,
      channel: dmChannel._id,
      type: 'CHANNEL_NAME_CHANGE'
    });
    await systemMessage.save();

    // Update last message
    dmChannel.lastMessage = systemMessage._id;
    dmChannel.lastMessageAt = new Date();
    await dmChannel.save();
  }

  const updatedChannel = await DirectMessageChannel.findById(channelId)
    .populate('participants', 'username discriminator displayName avatar status lastSeen')
    .populate('owner', 'username discriminator displayName avatar');

  // Emit real-time event
  const io = req.app.get('io');
  if (io) {
    dmChannel.participants.forEach(participant => {
      if (participant._id.toString() !== req.user._id.toString()) {
        io.to(`user:${participant._id}`).emit('groupDMUpdated', {
          channelId: dmChannel._id,
          channel: updatedChannel,
          updatedBy: {
            _id: req.user._id,
            username: req.user.username,
            displayName: req.user.displayName
          },
          changes: { name, icon }
        });
      }
    });
  }

  res.json({ success: true, data: updatedChannel });
}));

// @route   POST /api/dms/:channelId/recipients
// @desc    Add recipient to group DM
// @access  Private
router.post('/:channelId/recipients', authenticate, asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { userId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(channelId) || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError('Invalid channel or user ID', 400);
  }

  const dmChannel = await DirectMessageChannel.findById(channelId)
    .populate('participants', 'username discriminator displayName avatar status lastSeen')
    .populate('owner', 'username discriminator displayName avatar');

  if (!dmChannel || dmChannel.isDeleted) {
    throw new ApiError('DM channel not found', 404);
  }

  // Only group DMs can have recipients added
  if (dmChannel.type !== 'GROUP_DM') {
    throw new ApiError('Cannot add recipients to direct message channels', 400);
  }

  // Check if user is a participant
  if (!dmChannel.participants.some(p => p._id.equals(req.user._id))) {
    throw new ApiError('Access denied', 403);
  }

  // Check if group is at max capacity (Discord allows up to 10 users in group DM)
  if (dmChannel.participants.length >= 10) {
    throw new ApiError('Group DM is at maximum capacity (10 users)', 400);
  }

  // Check if user is already in the group
  if (dmChannel.participants.some(p => p._id.toString() === userId)) {
    throw new ApiError('User is already in this group DM', 400);
  }

  // Check if user exists and is active
  const userToAdd = await User.findById(userId);
  if (!userToAdd || !userToAdd.isActive) {
    throw new ApiError('User not found or inactive', 404);
  }

  // Check if the person adding can DM the new user
  const isBlocked = await Friendship.isBlocked(req.user._id, userId);
  if (isBlocked) {
    throw new ApiError('Cannot add blocked user to group DM', 403);
  }

  const canDM = await checkDMPermissions(req.user._id, userId);
  if (!canDM.allowed) {
    throw new ApiError(`Cannot add user: ${canDM.reason}`, 403);
  }

  // Add user to the group
  dmChannel.participants.push(userId);
  
  // Add read status for new user
  dmChannel.readStatus.push({
    user: userId,
    lastReadAt: new Date()
  });

  await dmChannel.save();

  // Create system message
  const systemMessage = new DirectMessage({
    content: `${req.user.displayName} added ${userToAdd.displayName} to the group`,
    author: req.user._id,
    channel: dmChannel._id,
    type: 'RECIPIENT_ADD'
  });
  await systemMessage.save();

  // Update last message
  dmChannel.lastMessage = systemMessage._id;
  dmChannel.lastMessageAt = new Date();
  await dmChannel.save();

  const updatedChannel = await DirectMessageChannel.findById(channelId)
    .populate('participants', 'username discriminator displayName avatar status lastSeen')
    .populate('owner', 'username discriminator displayName avatar');

  // Emit real-time events
  const io = req.app.get('io');
  if (io) {
    // Notify existing participants
    dmChannel.participants.forEach(participant => {
      if (participant._id.toString() !== req.user._id.toString()) {
        io.to(`user:${participant._id}`).emit('groupDMRecipientAdded', {
          channelId: dmChannel._id,
          channel: updatedChannel,
          addedUser: {
            _id: userToAdd._id,
            username: userToAdd.username,
            displayName: userToAdd.displayName,
            avatar: userToAdd.avatar
          },
          addedBy: {
            _id: req.user._id,
            username: req.user.username,
            displayName: req.user.displayName
          }
        });
      }
    });

    // Notify the added user
    io.to(`user:${userId}`).emit('addedToGroupDM', {
      channel: updatedChannel,
      addedBy: {
        _id: req.user._id,
        username: req.user.username,
        displayName: req.user.displayName
      }
    });
  }

  res.json({ success: true, data: updatedChannel });
}));

router.delete('/:channelId/recipients/:userId', authenticate, asyncHandler(async (req, res) => {
  const { channelId, userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(channelId) || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError('Invalid channel or user ID', 400);
  }

  const dmChannel = await DirectMessageChannel.findById(channelId)
    .populate('participants', 'username discriminator displayName avatar status lastSeen')
    .populate('owner', 'username discriminator displayName avatar');

  if (!dmChannel || dmChannel.isDeleted) {
    throw new ApiError('DM channel not found', 404);
  }

  // Only group DMs can have recipients removed
  if (dmChannel.type !== 'GROUP_DM') {
    throw new ApiError('Cannot remove recipients from direct message channels', 400);
  }

  // Check if user is a participant
  if (!dmChannel.participants.some(p => p._id.equals(req.user._id))) {
    throw new ApiError('Access denied', 403);
  }

  // Check if user to remove exists in the group
  if (!dmChannel.participants.some(p => p._id.toString() === userId)) {
    throw new ApiError('User is not in this group DM', 400);
  }

  const isRemovingSelf = userId === req.user._id.toString();
  // Check if the user is the owner using ObjectId.equals()
  const isOwner = dmChannel.owner && mongoose.Types.ObjectId.isValid(dmChannel.owner) 
    ? dmChannel.owner.equals(req.user._id)
    : false;

  console.log('DEBUG: Owner check', {
    channelId,
    userId: req.user._id.toString(),
    ownerId: dmChannel.owner ? dmChannel.owner.toString() : 'null',
    isOwner,
    isRemovingSelf
  });

  // Only owner can remove others, anyone can leave themselves
  if (!isRemovingSelf && !isOwner) {
    throw new ApiError('Only the group owner can remove other participants', 403);
  }

  const userToRemove = dmChannel.participants.find(p => p._id.toString() === userId);

  // Remove user from participants
  dmChannel.participants = dmChannel.participants.filter(p => p._id.toString() !== userId);
  
  // Remove user's read status
  dmChannel.readStatus = dmChannel.readStatus.filter(rs => rs.user.toString() !== userId);

  // If group becomes empty or has only one person, mark as deleted
  if (dmChannel.participants.length <= 1) {
    dmChannel.isDeleted = true;
  }

  // If owner leaves, transfer ownership to next participant
  if (isRemovingSelf && isOwner && dmChannel.participants.length > 0) {
    dmChannel.owner = dmChannel.participants[0]._id;
  }

  await dmChannel.save();

  // Create system message
  const systemMessage = new DirectMessage({
    content: isRemovingSelf 
      ? `${req.user.displayName} left the group`
      : `${req.user.displayName} removed ${userToRemove.displayName} from the group`,
    author: req.user._id,
    channel: dmChannel._id,
    type: 'RECIPIENT_REMOVE'
  });
  await systemMessage.save();

  // Update last message if group still exists
  if (!dmChannel.isDeleted) {
    dmChannel.lastMessage = systemMessage._id;
    dmChannel.lastMessageAt = new Date();
    await dmChannel.save();
  }

  const updatedChannel = await DirectMessageChannel.findById(channelId)
    .populate('participants', 'username discriminator displayName avatar status lastSeen')
    .populate('owner', 'username discriminator displayName avatar');

  // Emit real-time events
  const io = req.app.get('io');
  if (io) {
    // Notify remaining participants
    dmChannel.participants.forEach(participant => {
      if (participant._id.toString() !== req.user._id.toString()) {
        io.to(`user:${participant._id}`).emit('groupDMRecipientRemoved', {
          channelId: dmChannel._id,
          channel: updatedChannel,
          removedUser: {
            _id: userToRemove._id,
            username: userToRemove.username,
            displayName: userToRemove.displayName
          },
          removedBy: {
            _id: req.user._id,
            username: req.user.username,
            displayName: req.user.displayName
          },
          isDeleted: dmChannel.isDeleted
        });
      }
    });

    // Notify the removed user
    if (!isRemovingSelf) {
      io.to(`user:${userId}`).emit('removedFromGroupDM', {
        channelId: dmChannel._id,
        removedBy: {
          _id: req.user._id,
          username: req.user.username,
          displayName: req.user.displayName
        }
      });
    }
  }

  res.json({ 
    success: true, 
    data: { 
      message: isRemovingSelf ? 'Left group DM' : 'User removed from group DM',
      channel: dmChannel.isDeleted ? null : updatedChannel,
      isDeleted: dmChannel.isDeleted
    }
  });
}));

// @route   PATCH /api/dms/:channelId
// @desc    Update group DM channel (name, icon)
// @access  Private
router.patch('/:channelId', authenticate, asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { name, icon } = req.body;

  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError('Invalid channel ID', 400);
  }

  const dmChannel = await DirectMessageChannel.findById(channelId);
  if (!dmChannel || dmChannel.isDeleted) {
    throw new ApiError('DM channel not found', 404);
  }

  if (dmChannel.type !== 'GROUP_DM') {
    throw new ApiError('Cannot update direct message channels', 400);
  }

  // Check if user is the owner or participant
  if (!dmChannel.owner.equals(req.user._id) && !dmChannel.participants.some(p => p._id.equals(req.user._id))) {
    throw new ApiError('Access denied', 403);
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

  // Emit update to all participants
  const io = req.app.get('io');
  if (io) {
    dmChannel.participants.forEach(participant => {
      io.to(`user:${participant._id}`).emit('dmChannelUpdate', {
        channelId: dmChannel._id,
        channel: updatedChannel
      });
    });
  }

  res.json({ 
    success: true, 
    data: updatedChannel
  });
}));
// @route   DELETE /api/dms/:channelId
// @desc    Close/Delete DM channel (1:1 DMs or group DMs by owner)
// @access  Private
router.delete('/:channelId', authenticate, asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError('Invalid channel ID', 400);
  }

  const dmChannel = await DirectMessageChannel.findById(channelId)
    .populate('participants', 'username discriminator displayName avatar status lastSeen')
    .populate('owner', 'username discriminator displayName avatar');

  if (!dmChannel || dmChannel.isDeleted) {
    throw new ApiError('DM channel not found', 404);
  }

  // Check if user is a participant
  if (!dmChannel.participants.some(p => p._id.equals(req.user._id))) {
    throw new ApiError('Access denied', 403);
  }

  if (dmChannel.type === 'DM') {
    // For direct messages, mark as deleted for this user
    dmChannel.isDeleted = true;
    await dmChannel.save();
  } else if (dmChannel.type === 'GROUP_DM' && dmChannel.owner.equals(req.user._id)) {
    // For group DMs, allow owner to delete the entire channel
    dmChannel.isDeleted = true;
    await dmChannel.save();

    // Create system message for group deletion
    const systemMessage = new DirectMessage({
      content: `${req.user.displayName} deleted the group`,
      author: req.user._id,
      channel: dmChannel._id,
      type: 'SYSTEM'
    });
    await systemMessage.save();

    // Update last message
    dmChannel.lastMessage = systemMessage._id;
    dmChannel.lastMessageAt = new Date();
    await dmChannel.save();

    // Emit real-time event to all participants
    const io = req.app.get('io');
    if (io) {
      dmChannel.participants.forEach(participant => {
        io.to(`user:${participant._id}`).emit('groupDMDeleted', {
          channelId: dmChannel._id,
          deletedBy: {
            _id: req.user._id,
            username: req.user.username,
            displayName: req.user.displayName
          }
        });
      });
    }
  } else {
    // For group DMs, non-owners must use recipients endpoint to leave
    throw new ApiError('Use recipients endpoint to leave group DMs', 400);
  }

  res.json({ 
    success: true, 
    data: { message: dmChannel.type === 'DM' ? 'DM channel closed successfully' : 'Group DM deleted successfully' }
  });
}));

// @route   GET /api/dms/:channelId/messages
// @desc    Get DM messages with pagination
// @access  Private
router.get('/:channelId/messages', authenticate, asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { limit = 50, before, after } = req.query;

  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError('Invalid channel ID', 400);
  }

  const dmChannel = await DirectMessageChannel.findById(channelId);
  if (!dmChannel || dmChannel.isDeleted) {
    throw new ApiError('DM channel not found', 404);
  }

  // Check if user is a participant
  if (!dmChannel.participants.some(p => p._id.equals(req.user._id))) {
    throw new ApiError('Access denied', 403);
  }

  // Build query for pagination
  const query = { channel: channelId, isDeleted: false };
  
  if (before && mongoose.Types.ObjectId.isValid(before)) {
    query._id = { $lt: before };
  }
  if (after && mongoose.Types.ObjectId.isValid(after)) {
    query._id = { $gt: after };
  }

  const messages = await DirectMessage.find(query)
    .populate('author', 'username discriminator displayName avatar status')
    .populate('referencedMessage', 'content author createdAt')
    .populate('referencedMessage.author', 'username discriminator displayName avatar')
    .populate('reactions.users', 'username displayName avatar')
    .sort({ createdAt: -1 })
    .limit(Math.min(parseInt(limit), 100));

  // Mark messages as read
  const userReadStatus = dmChannel.readStatus.find(
    rs => rs.user?.toString() === req.user._id.toString()
  );
  
  if (userReadStatus) {
    userReadStatus.lastReadAt = new Date();
    if (messages.length > 0) {
      userReadStatus.lastReadMessageId = messages[0]._id;
    }
    await dmChannel.save();
  }

  res.json({ 
    success: true, 
    data: messages.reverse() // Return in chronological order
  });
}));

// @route   POST /api/dms/:channelId/upload
// @desc    Upload file to DM channel
// @access  Private
router.post('/:channelId/upload', authenticate, memoryUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError('No file provided', 400);
  }

  const { channelId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError('Invalid channel ID', 400);
  }

  // Check if DM channel exists and user has access
  const dmChannel = await DirectMessageChannel.findOne({
    _id: channelId,
    participants: req.user._id,
    isDeleted: false
  });

  if (!dmChannel) {
    throw new ApiError('DM channel not found or no access', 404);
  }

  try {
    // Upload file to S3
    const uploadResult = await s3Service.uploadFile(req.file, req.user.id, 'dm-attachments');
    
    // Generate signed URL for immediate access
    const signedUrl = await s3Service.getSignedUrl(uploadResult.key, 86400); // 24 hours

    const attachment = {
      id: uploadResult.key,
      filename: uploadResult.filename,
      contentType: req.file.mimetype,
      size: uploadResult.size,
      url: signedUrl,
      proxyUrl: uploadResult.url,
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
    console.error('File upload error:', error);
    throw new ApiError('Failed to upload file', 500);
  }
}));

// @route   POST /api/dms/:channelId/messages/with-file
// @desc    Send DM message with file attachment
// @access  Private
router.post('/:channelId/messages/with-file', authenticate, memoryUpload.single('file'), asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { content, referencedMessageId, nonce, attachments } = req.body;

  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError('Invalid channel ID', 400);
  }

  if (!content?.trim() && !req.file && (!attachments || !Array.isArray(attachments) || attachments.length === 0)) {
    throw new ApiError('Message content or file required', 400);
  }

  // Check if DM channel exists and user has access
  const dmChannel = await DirectMessageChannel.findOne({
    _id: channelId,
    participants: req.user._id,
    isDeleted: false
  }).populate('participants', 'username discriminator displayName status lastSeen');

  if (!dmChannel) {
    throw new ApiError('DM channel not found or no access', 404);
  }

  let messageAttachments = [];

  // Handle file upload if provided
  if (req.file) {
    try {
      const uploadResult = await s3Service.uploadFile(req.file, req.user.id, 'dm-attachments');
      const signedUrl = await s3Service.getSignedUrl(uploadResult.key, 86400);

      messageAttachments.push({
        id: uploadResult.key,
        filename: uploadResult.filename,
        contentType: req.file.mimetype,
        size: uploadResult.size,
        url: signedUrl,
        proxyUrl: uploadResult.url,
        ...(req.file.mimetype.startsWith('image/') && {
          height: null,
          width: null
        })
      });
    } catch (error) {
      console.error('File upload error:', error);
      throw new ApiError('Failed to upload file', 500);
    }
  } else if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    // Use pre-uploaded attachment metadata
    messageAttachments = attachments.map(attachment => ({
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      url: attachment.url,
      proxyUrl: attachment.proxyUrl,
      ...(attachment.contentType.startsWith('image/') && {
        height: attachment.height || null,
        width: attachment.width || null
      })
    }));
  }

  // Handle referenced message for replies
  let referencedMessage = null;
  if (referencedMessageId) {
    if (!mongoose.Types.ObjectId.isValid(referencedMessageId)) {
      throw new ApiError('Invalid referenced message ID', 400);
    }

    referencedMessage = await DirectMessage.findOne({
      _id: referencedMessageId,
      channel: channelId,
      isDeleted: false
    });

    if (!referencedMessage) {
      throw new ApiError('Referenced message not found', 404);
    }
  }

  // Create message
  const message = new DirectMessage({
    content: content?.trim() || '',
    author: req.user._id,
    channel: channelId,
    attachments: messageAttachments,
    referencedMessage: referencedMessageId || null,
    nonce
  });

  await message.save();

  // Populate message for response
  const populatedMessage = await DirectMessage.findById(message._id)
    .populate('author', 'username discriminator displayName avatar status')
    .populate('referencedMessage', 'content author createdAt type')
    .populate('referencedMessage.author', 'username discriminator displayName avatar');

  // Update channel's last message
  dmChannel.lastMessage = message._id;
  dmChannel.lastActivity = new Date();
  await dmChannel.save();

  // Emit real-time event to other participants
  const otherParticipants = dmChannel.participants.filter(
    p => p._id.toString() !== req.user._id.toString()
  );

  otherParticipants.forEach(participant => {
    req.app.get('io').to(`user:${participant._id}`).emit('dmMessage', {
      channelId,
      message: populatedMessage,
      type: 'message_create'
    });
  });

  res.status(201).json({
    success: true,
    data: populatedMessage
  });
}));

// @route   POST /api/dms/:channelId/messages
// @desc    Send DM message with Discord-like features
// @access  Private
router.post('/:channelId/messages', authenticate, asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { content, attachments, embeds, referencedMessageId, nonce } = req.body;

  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError('Invalid channel ID', 400);
  }

  if (!content?.trim() && (!attachments || attachments.length === 0)) {
    throw new ApiError('Message content or attachments required', 400);
  }

  if (content && content.length > 2000) {
    throw new ApiError('Message content too long (max 2000 characters)', 400);
  }

  const dmChannel = await DirectMessageChannel.findById(channelId)
    .populate('participants', 'username discriminator displayName avatar status lastSeen');

  if (!dmChannel || dmChannel.isDeleted) {
    throw new ApiError('DM channel not found', 404);
  }

  // Check if user is a participant
  if (!dmChannel.participants.some(p => p._id.equals(req.user._id))) {
    throw new ApiError('Access denied', 403);
  }

  // For DMs, check if users can still message each other
  if (dmChannel.type === 'DM') {
    const otherUser = dmChannel.participants.find(p => !p._id.equals(req.user._id));
    const isBlocked = await Friendship.isBlocked(req.user._id, otherUser._id);
    if (isBlocked) {
      throw new ApiError('Cannot send message to blocked user', 403);
    }
  }

  // Validate referenced message if provided
  let referencedMessage = null;
  if (referencedMessageId) {
    if (!mongoose.Types.ObjectId.isValid(referencedMessageId)) {
      throw new ApiError('Invalid referenced message ID', 400);
    }
    
    referencedMessage = await DirectMessage.findOne({
      _id: referencedMessageId,
      channel: channelId,
      isDeleted: false
    });
    
    if (!referencedMessage) {
      throw new ApiError('Referenced message not found', 404);
    }
  }

  const message = new DirectMessage({
    content: content?.trim(),
    author: req.user._id,
    channel: channelId,
    attachments: attachments || [],
    embeds: embeds || [],
    referencedMessage: referencedMessageId || null,
    nonce: nonce || null
  });

  await message.save();

  // Update channel's last message and activity
  dmChannel.lastMessage = message._id;
  dmChannel.lastMessageAt = new Date();
  await dmChannel.save();

  const populatedMessage = await DirectMessage.findById(message._id)
    .populate('author', 'username discriminator displayName avatar status')
    .populate('referencedMessage', 'content author createdAt type')
    .populate('referencedMessage.author', 'username discriminator displayName avatar');

  // Emit real-time event to all participants
  const io = req.io; // Use req.io instead of req.app.get('io')
  if (io) {
    console.log('Emitting dmMessage to dm channel room:', `dm:${dmChannel._id}`, 'Message:', populatedMessage);
    io.to(`dm:${dmChannel._id}`).emit('dmMessage', {
      channelId: dmChannel._id,
      message: populatedMessage
    });
  } else {
    console.error('Socket.IO instance not available');
  }

  res.status(201).json({ success: true, data: populatedMessage });
}));

// @route   PUT /api/dms/:channelId/messages/:messageId
// @desc    Edit DM message
// @access  Private
router.put('/:channelId/messages/:messageId', authenticate, asyncHandler(async (req, res) => {
  const { channelId, messageId } = req.params;
  const { content } = req.body;

  if (!mongoose.Types.ObjectId.isValid(channelId) || !mongoose.Types.ObjectId.isValid(messageId)) {
    throw new ApiError('Invalid channel or message ID', 400);
  }

  if (!content?.trim()) {
    throw new ApiError('Message content required', 400);
  }

  if (content.length > 2000) {
    throw new ApiError('Message content too long (max 2000 characters)', 400);
  }

  const dmChannel = await DirectMessageChannel.findById(channelId);
  if (!dmChannel || dmChannel.isDeleted) {
    throw new ApiError('DM channel not found', 404);
  }

  // Check if user is a participant
  if (!dmChannel.participants.some(p => p._id.equals(req.user._id))) {
    throw new ApiError('Access denied', 403);
  }

  const message = await DirectMessage.findOne({
    _id: messageId,
    channel: channelId,
    author: req.user._id,
    isDeleted: false
  });

  if (!message) {
    throw new ApiError('Message not found or not yours to edit', 404);
  }

  // Check if message is too old to edit (Discord allows editing for a while)
  const hoursSinceCreated = (Date.now() - message.createdAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceCreated > 24) {
    throw new ApiError('Message too old to edit (24 hour limit)', 400);
  }

  message.content = content.trim();
  message.editedAt = new Date();
  await message.save();

  const populatedMessage = await DirectMessage.findById(message._id)
    .populate('author', 'username discriminator displayName avatar status')
    .populate('referencedMessage', 'content author createdAt type')
    .populate('referencedMessage.author', 'username discriminator displayName avatar');

  // Emit real-time event
  const io = req.app.get('io');
  if (io) {
    dmChannel.participants.forEach(participant => {
      io.to(`user:${participant._id}`).emit('dmMessageEdit', {
        channelId: dmChannel._id,
        message: populatedMessage
      });
    });
  }

  res.json({ success: true, data: populatedMessage });
}));

// @route   DELETE /api/dms/:channelId/messages/:messageId
// @desc    Delete DM message
// @access  Private
router.delete('/:channelId/messages/:messageId', authenticate, asyncHandler(async (req, res) => {
  const { channelId, messageId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(channelId) || !mongoose.Types.ObjectId.isValid(messageId)) {
    throw new ApiError('Invalid channel or message ID', 400);
  }

  const dmChannel = await DirectMessageChannel.findById(channelId);
  if (!dmChannel || dmChannel.isDeleted) {
    throw new ApiError('DM channel not found', 404);
  }

  // Check if user is a participant
  if (!dmChannel.participants.some(p => p._id.equals(req.user._id))) {
    throw new ApiError('Access denied', 403);
  }

  const message = await DirectMessage.findOne({
    _id: messageId,
    channel: channelId,
    isDeleted: false
  });

  if (!message) {
    throw new ApiError('Message not found', 404);
  }

  // Only message author can delete their own messages
  if (!message.author.equals(req.user._id)) {
    throw new ApiError('Can only delete your own messages', 403);
  }

  message.isDeleted = true;
  message.content = '';
  message.attachments = [];
  message.embeds = [];
  await message.save();

  // Emit real-time event
  const io = req.app.get('io');
  if (io) {
    dmChannel.participants.forEach(participant => {
      io.to(`user:${participant._id}`).emit('dmMessageDelete', {
        channelId: dmChannel._id,
        messageId: message._id
      });
    });
  }

  res.json({ success: true, data: { message: 'Message deleted' } });
}));

// @route   POST /api/dms/:channelId/messages/:messageId/reactions/:emoji
// @desc    Add reaction to DM message
// @access  Private
router.post('/:channelId/messages/:messageId/reactions/:emoji', authenticate, asyncHandler(async (req, res) => {
  const { channelId, messageId, emoji } = req.params;

  if (!mongoose.Types.ObjectId.isValid(channelId) || !mongoose.Types.ObjectId.isValid(messageId)) {
    throw new ApiError('Invalid channel or message ID', 400);
  }

  const dmChannel = await DirectMessageChannel.findById(channelId);
  if (!dmChannel || dmChannel.isDeleted) {
    throw new ApiError('DM channel not found', 404);
  }

  // Check if user is a participant
  if (!dmChannel.participants.some(p => p._id.equals(req.user._id))) {
    throw new ApiError('Access denied', 403);
  }

  const message = await DirectMessage.findOne({
    _id: messageId,
    channel: channelId,
    isDeleted: false
  });

  if (!message) {
    throw new ApiError('Message not found', 404);
  }

  // Find or create reaction
  let reaction = message.reactions.find(r => r.emoji === emoji);
  if (!reaction) {
    reaction = { emoji, count: 0, users: [] };
    message.reactions.push(reaction);
  }

  // Toggle user reaction
  const userIndex = reaction.users.indexOf(req.user._id);
  if (userIndex === -1) {
    // Add reaction
    reaction.users.push(req.user._id);
    reaction.count++;
  } else {
    // Remove reaction
    reaction.users.splice(userIndex, 1);
    reaction.count--;
    
    // Remove empty reactions
    if (reaction.count === 0) {
      message.reactions = message.reactions.filter(r => r.emoji !== emoji);
    }
  }

  await message.save();

  const populatedMessage = await DirectMessage.findById(message._id)
    .populate('reactions.users', 'username displayName avatar');

  // Emit real-time event
  const io = req.app.get('io');
  if (io) {
    dmChannel.participants.forEach(participant => {
      io.to(`user:${participant._id}`).emit('dmMessageReaction', {
        channelId: dmChannel._id,
        messageId: message._id,
        reaction: {
          emoji,
          count: reaction?.count || 0,
          users: reaction?.users || []
        },
        user: {
          _id: req.user._id,
          username: req.user.username,
          displayName: req.user.displayName
        }
      });
    });
  }

  res.json({ success: true, data: populatedMessage });
}));

// @route   POST /api/dms/:channelId/typing
// @desc    Send typing indicator in DM
// @access  Private
router.post('/:channelId/typing', authenticate, asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError('Invalid channel ID', 400);
  }

  const dmChannel = await DirectMessageChannel.findById(channelId);
  if (!dmChannel || dmChannel.isDeleted) {
    throw new ApiError('DM channel not found', 404);
  }

  // Check if user is a participant
  if (!dmChannel.participants.some(p => p._id.equals(req.user._id))) {
    throw new ApiError('Access denied', 403);
  }

  // Emit typing event to other participants
  const io = req.app.get('io');
  if (io) {
    dmChannel.participants.forEach(participant => {
      if (!participant._id.equals(req.user._id)) {
        io.to(`user:${participant._id}`).emit('dmTyping', {
          channelId,
          user: {
            _id: req.user._id,
            username: req.user.username,
            discriminator: req.user.discriminator,
            displayName: req.user.displayName,
            avatar: req.user.avatar
          }
        });
      }
    });
  }

  res.json({ success: true, data: { message: 'Typing indicator sent' } });
}));

// @route   POST /api/dms/:channelId/read
// @desc    Mark DM messages as read
// @access  Private
router.post('/:channelId/read', authenticate, asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { messageId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError('Invalid channel ID', 400);
  }

  const dmChannel = await DirectMessageChannel.findById(channelId);
  if (!dmChannel || dmChannel.isDeleted) {
    throw new ApiError('DM channel not found', 404);
  }

  // Check if user is a participant
  if (!dmChannel.participants.some(p => p._id.equals(req.user._id))) {
    throw new ApiError('Access denied', 403);
  }

  // Update user's read status
  let userReadStatus = dmChannel.readStatus.find(
    rs => rs.user?.toString() === req.user._id.toString()
  );

  if (!userReadStatus) {
    userReadStatus = { user: req.user._id };
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

  res.json({ success: true, data: { message: 'Messages marked as read' } });
}));

export default router;
