import express from 'express';
import mongoose from 'mongoose';
import Friendship from '../models/Friendship.js';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/friends
// @desc    Get user's friends and friend requests
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const { type = 'all' } = req.query;

    let query = {
      $or: [
        { requester: req.user._id },
        { recipient: req.user._id }
      ]
    };

    // Filter by friendship status
    switch (type) {
      case 'friends':
        query.status = 'ACCEPTED';
        break;
      case 'pending':
        query.status = 'PENDING';
        query.requester = { $ne: req.user._id }; // Only incoming requests
        break;
      case 'sent':
        query.status = 'PENDING';
        query.requester = req.user._id; // Only outgoing requests
        break;
      case 'blocked':
        query.status = 'BLOCKED';
        query.requester = req.user._id; // Only users I blocked
        break;
    }

    const friendships = await Friendship.find(query)
      .populate('requester', 'username discriminator displayName avatar status lastSeen')
      .populate('recipient', 'username discriminator displayName avatar status lastSeen')
      .sort({ updatedAt: -1 });

    // Format response based on user's perspective
    const formattedFriendships = friendships.map(friendship => {
      const isRequester = friendship.requester._id.equals(req.user._id);
      const friend = isRequester ? friendship.recipient : friendship.requester;
      
      return {
        _id: friendship._id,
        status: friendship.status,
        user: friend,
        isIncoming: !isRequester && friendship.status === 'PENDING',
        isOutgoing: isRequester && friendship.status === 'PENDING',
        createdAt: friendship.createdAt,
        updatedAt: friendship.updatedAt
      };
    });

    res.json(formattedFriendships);
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/friends/request
// @desc    Send friend request
// @access  Private
router.post('/request', authenticate, async (req, res) => {
  try {
    const { username, discriminator } = req.body;

    if (!username || !discriminator) {
      return res.status(400).json({ message: 'Username and discriminator are required' });
    }

    // Find the target user
    const targetUser = await User.findOne({ username, discriminator });
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if trying to add yourself
    if (targetUser._id.equals(req.user._id)) {
      return res.status(400).json({ message: 'Cannot send friend request to yourself' });
    }

    // Check if friendship already exists
    const existingFriendship = await Friendship.findOne({
      $or: [
        { requester: req.user._id, recipient: targetUser._id },
        { requester: targetUser._id, recipient: req.user._id }
      ]
    });

    if (existingFriendship) {
      switch (existingFriendship.status) {
        case 'ACCEPTED':
          return res.status(400).json({ message: 'Already friends with this user' });
        case 'PENDING':
          if (existingFriendship.requester.equals(req.user._id)) {
            return res.status(400).json({ message: 'Friend request already sent' });
          } else {
            return res.status(400).json({ message: 'This user has already sent you a friend request' });
          }
        case 'BLOCKED':
          return res.status(400).json({ message: 'Cannot send friend request to this user' });
      }
    }

    // Create friend request
    const friendship = new Friendship({
      requester: req.user._id,
      recipient: targetUser._id,
      status: 'PENDING'
    });

    await friendship.save();

    const populatedFriendship = await Friendship.findById(friendship._id)
      .populate('requester', 'username discriminator displayName avatar')
      .populate('recipient', 'username discriminator displayName avatar');

    // Emit notification to target user
    req.app.get('io').to(`user:${targetUser._id}`).emit('friendRequest', {
      friendship: populatedFriendship,
      type: 'incoming'
    });

    res.status(201).json({
      message: 'Friend request sent successfully',
      friendship: populatedFriendship
    });
  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/friends/:friendshipId/accept
// @desc    Accept friend request
// @access  Private
router.put('/:friendshipId/accept', authenticate, async (req, res) => {
  try {
    const { friendshipId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(friendshipId)) {
      return res.status(400).json({ message: 'Invalid friendship ID' });
    }

    const friendship = await Friendship.findById(friendshipId);
    if (!friendship) {
      return res.status(404).json({ message: 'Friend request not found' });
    }

    // Check if user is the recipient
    if (!friendship.recipient.equals(req.user._id)) {
      return res.status(403).json({ message: 'Cannot accept this friend request' });
    }

    // Check if request is still pending
    if (friendship.status !== 'PENDING') {
      return res.status(400).json({ message: 'Friend request is no longer pending' });
    }

    friendship.status = 'ACCEPTED';
    await friendship.save();

    const populatedFriendship = await Friendship.findById(friendshipId)
      .populate('requester', 'username discriminator displayName avatar status lastSeen')
      .populate('recipient', 'username discriminator displayName avatar status lastSeen');

    // Emit notifications to both users
    req.app.get('io').to(`user:${friendship.requester}`).emit('friendRequestAccepted', {
      friendship: populatedFriendship,
      acceptedBy: req.user._id
    });

    req.app.get('io').to(`user:${req.user._id}`).emit('friendshipUpdate', {
      friendship: populatedFriendship,
      type: 'accepted'
    });

    res.json({
      message: 'Friend request accepted',
      friendship: populatedFriendship
    });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/friends/:friendshipId/decline
// @desc    Decline friend request
// @access  Private
router.put('/:friendshipId/decline', authenticate, async (req, res) => {
  try {
    const { friendshipId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(friendshipId)) {
      return res.status(400).json({ message: 'Invalid friendship ID' });
    }

    const friendship = await Friendship.findById(friendshipId);
    if (!friendship) {
      return res.status(404).json({ message: 'Friend request not found' });
    }

    // Check if user is the recipient
    if (!friendship.recipient.equals(req.user._id)) {
      return res.status(403).json({ message: 'Cannot decline this friend request' });
    }

    // Check if request is still pending
    if (friendship.status !== 'PENDING') {
      return res.status(400).json({ message: 'Friend request is no longer pending' });
    }

    // Delete the friendship request
    await Friendship.findByIdAndDelete(friendshipId);

    // Emit notification to requester
    req.app.get('io').to(`user:${friendship.requester}`).emit('friendRequestDeclined', {
      friendshipId,
      declinedBy: req.user._id
    });

    res.json({ message: 'Friend request declined' });
  } catch (error) {
    console.error('Error declining friend request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/friends/:friendshipId
// @desc    Remove friend or cancel friend request
// @access  Private
router.delete('/:friendshipId', authenticate, async (req, res) => {
  try {
    const { friendshipId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(friendshipId)) {
      return res.status(400).json({ message: 'Invalid friendship ID' });
    }

    const friendship = await Friendship.findById(friendshipId);
    if (!friendship) {
      return res.status(404).json({ message: 'Friendship not found' });
    }

    // Check if user is part of this friendship
    const isRequester = friendship.requester.equals(req.user._id);
    const isRecipient = friendship.recipient.equals(req.user._id);

    if (!isRequester && !isRecipient) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const otherUserId = isRequester ? friendship.recipient : friendship.requester;

    // Delete the friendship
    await Friendship.findByIdAndDelete(friendshipId);

    // Emit notification to other user
    const eventType = friendship.status === 'ACCEPTED' ? 'friendRemoved' : 'friendRequestCancelled';
    req.app.get('io').to(`user:${otherUserId}`).emit(eventType, {
      friendshipId,
      userId: req.user._id
    });

    const message = friendship.status === 'ACCEPTED' ? 'Friend removed' : 'Friend request cancelled';
    res.json({ message });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/friends/:userId/block
// @desc    Block user
// @access  Private
router.post('/:userId/block', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Check if trying to block yourself
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot block yourself' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if friendship exists
    let friendship = await Friendship.findOne({
      $or: [
        { requester: req.user._id, recipient: userId },
        { requester: userId, recipient: req.user._id }
      ]
    });

    if (friendship) {
      // Update existing friendship to blocked
      friendship.status = 'BLOCKED';
      friendship.requester = req.user._id; // The blocker becomes the requester
      friendship.recipient = userId;
      await friendship.save();
    } else {
      // Create new blocked relationship
      friendship = new Friendship({
        requester: req.user._id,
        recipient: userId,
        status: 'BLOCKED'
      });
      await friendship.save();
    }

    const populatedFriendship = await Friendship.findById(friendship._id)
      .populate('requester', 'username discriminator displayName avatar')
      .populate('recipient', 'username discriminator displayName avatar');

    // Emit notification to blocked user
    req.app.get('io').to(`user:${userId}`).emit('userBlocked', {
      blockedBy: req.user._id
    });

    res.json({
      message: 'User blocked successfully',
      friendship: populatedFriendship
    });
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/friends/:userId/unblock
// @desc    Unblock user
// @access  Private
router.delete('/:userId/unblock', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const friendship = await Friendship.findOne({
      requester: req.user._id,
      recipient: userId,
      status: 'BLOCKED'
    });

    if (!friendship) {
      return res.status(404).json({ message: 'User is not blocked' });
    }

    // Delete the blocked relationship
    await Friendship.findByIdAndDelete(friendship._id);

    // Emit notification to unblocked user
    req.app.get('io').to(`user:${userId}`).emit('userUnblocked', {
      unblockedBy: req.user._id
    });

    res.json({ message: 'User unblocked successfully' });
  } catch (error) {
    console.error('Error unblocking user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/friends/search
// @desc    Search for users to add as friends
// @access  Private
router.get('/search', authenticate, async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }

    // Get users I've blocked or who have blocked me
    const blockedRelationships = await Friendship.find({
      $or: [
        { requester: req.user._id, status: 'BLOCKED' },
        { recipient: req.user._id, status: 'BLOCKED' }
      ]
    });

    const blockedUserIds = blockedRelationships.map(rel => 
      rel.requester.equals(req.user._id) ? rel.recipient : rel.requester
    );

    // Add own ID to excluded list
    const excludeIds = [...blockedUserIds, req.user._id];

    // Search for users
    const users = await User.searchUsers(query, excludeIds);

    // Get existing friendships for these users
    const userIds = users.map(user => user._id);
    const existingFriendships = await Friendship.find({
      $or: [
        { requester: req.user._id, recipient: { $in: userIds } },
        { requester: { $in: userIds }, recipient: req.user._id }
      ]
    });

    // Add friendship status to each user
    const usersWithStatus = users.map(user => {
      const friendship = existingFriendships.find(f => 
        f.requester.equals(user._id) || f.recipient.equals(user._id)
      );

      let relationshipStatus = 'none';
      if (friendship) {
        if (friendship.status === 'ACCEPTED') {
          relationshipStatus = 'friends';
        } else if (friendship.status === 'PENDING') {
          relationshipStatus = friendship.requester.equals(req.user._id) ? 'outgoing' : 'incoming';
        }
      }

      return {
        ...user.toObject(),
        relationshipStatus
      };
    });

    res.json(usersWithStatus.slice(0, parseInt(limit)));
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
