import express from 'express';
import Call from '../models/Call.js';
import VoiceState from '../models/VoiceState.js';
import Channel from '../models/Channel.js';
import DirectMessageChannel from '../models/DirectMessageChannel.js';
import { authenticate } from '../middleware/auth.js';
import { body, param, validationResult } from 'express-validator';
import { generateRoomId } from '../utils/helpers.js';

const router = express.Router();

// ================================
// VOICE CHANNEL CALLS
// ================================

// Start a call in a voice channel
router.post('/voice-channel/:channelId/start', [
  authenticate,
  param('channelId').isMongoId().withMessage('Invalid channel ID'),
  body('hasVideo').optional().isBoolean().withMessage('hasVideo must be boolean'),
  body('isScreenShare').optional().isBoolean().withMessage('isScreenShare must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { channelId } = req.params;
    const { hasVideo = false, isScreenShare = false } = req.body;
    const userId = req.user.id;

    // Check if channel exists and is a voice channel
    const channel = await Channel.findById(channelId);
    if (!channel || channel.type !== 'VOICE') {
      return res.status(404).json({ message: 'Voice channel not found' });
    }

    // Check permissions (CONNECT permission)
    // TODO: Implement permission checking logic
    
    // Check if there's already an active call
    const existingCall = await Call.getActiveCall(channelId, 'VOICE_CHANNEL');
    if (existingCall) {
      return res.status(409).json({ message: 'Call already active in this channel' });
    }

    // Create new call
    const roomId = generateRoomId();
    const call = new Call({
      type: 'VOICE_CHANNEL',
      voiceChannel: channelId,
      initiator: userId,
      participants: [{
        user: userId,
        hasVideo: hasVideo,
        connectionState: 'CONNECTING'
      }],
      settings: {
        hasVideo: hasVideo,
        isScreenShare: isScreenShare,
        maxParticipants: channel.settings?.userLimit || 25
      },
      rtcData: {
        roomId: roomId
      }
    });

    await call.save();

    // Update/create voice state for user
    await VoiceState.createOrUpdateVoiceState(userId, {
      channel: channelId,
      call: call._id,
      connectionState: 'CONNECTING',
      hasVideo: hasVideo,
      isScreenSharing: isScreenShare
    });

    // Add user to channel's connected users
    await channel.addConnectedUser(userId);

    const populatedCall = await Call.findById(call._id)
      .populate('participants.user', 'username avatar')
      .populate('initiator', 'username avatar')
      .populate('voiceChannel', 'name server');

    // Emit socket events
    req.io.to(`channel:${channelId}`).emit('callStarted', {
      call: populatedCall,
      channel: channel,
      timestamp: new Date()
    });

    req.io.to(`server:${channel.server}`).emit('voiceStateUpdate', {
      userId: userId,
      channelId: channelId,
      action: 'joined',
      hasVideo: hasVideo,
      timestamp: new Date()
    });

    res.status(201).json({
      message: 'Call started successfully',
      call: populatedCall,
      roomId: roomId
    });

  } catch (error) {
    console.error('Error starting voice channel call:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Join a voice channel call
router.post('/voice-channel/:channelId/join', [
  authenticate,
  param('channelId').isMongoId().withMessage('Invalid channel ID'),
  body('hasVideo').optional().isBoolean().withMessage('hasVideo must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { channelId } = req.params;
    const { hasVideo = false } = req.body;
    const userId = req.user.id;

    // Check if channel exists and is a voice channel
    const channel = await Channel.findById(channelId);
    if (!channel || channel.type !== 'VOICE') {
      return res.status(404).json({ message: 'Voice channel not found' });
    }

    // Get or create active call
    let call = await Call.getActiveCall(channelId, 'VOICE_CHANNEL');
    
    if (!call) {
      // Create new call if none exists
      const roomId = generateRoomId();
      call = new Call({
        type: 'VOICE_CHANNEL',
        voiceChannel: channelId,
        initiator: userId,
        participants: [{
          user: userId,
          hasVideo: hasVideo,
          connectionState: 'CONNECTING'
        }],
        settings: {
          hasVideo: hasVideo,
          maxParticipants: channel.settings?.userLimit || 25
        },
        rtcData: {
          roomId: roomId
        }
      });
      await call.save();
    } else {
      // Add user to existing call
      await call.addParticipant(userId, hasVideo);
    }

    // Update voice state
    await VoiceState.createOrUpdateVoiceState(userId, {
      channel: channelId,
      call: call._id,
      connectionState: 'CONNECTING',
      hasVideo: hasVideo
    });

    // Add user to channel
    await channel.addConnectedUser(userId);

    const populatedCall = await Call.findById(call._id)
      .populate('participants.user', 'username avatar')
      .populate('initiator', 'username avatar')
      .populate('voiceChannel', 'name server');

    // Emit socket events
    req.io.to(`channel:${channelId}`).emit('userJoinedCall', {
      call: populatedCall,
      user: req.user,
      hasVideo: hasVideo,
      timestamp: new Date()
    });

    req.io.to(`server:${channel.server}`).emit('voiceStateUpdate', {
      userId: userId,
      channelId: channelId,
      action: 'joined',
      hasVideo: hasVideo,
      timestamp: new Date()
    });

    res.json({
      message: 'Joined call successfully',
      call: populatedCall,
      roomId: call.rtcData.roomId
    });

  } catch (error) {
    console.error('Error joining voice channel call:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Leave a voice channel call
router.post('/voice-channel/:channelId/leave', [
  authenticate,
  param('channelId').isMongoId().withMessage('Invalid channel ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { channelId } = req.params;
    const userId = req.user.id;

    // Get active call
    const call = await Call.getActiveCall(channelId, 'VOICE_CHANNEL');
    if (!call) {
      return res.status(404).json({ message: 'No active call found' });
    }

    // Remove user from call
    await call.removeParticipant(userId);

    // Update voice state
    const voiceState = await VoiceState.getUserVoiceState(userId);
    if (voiceState) {
      await voiceState.leaveChannel();
    }

    // Remove user from channel
    const channel = await Channel.findById(channelId);
    if (channel) {
      await channel.removeConnectedUser(userId);
    }

    const updatedCall = await Call.findById(call._id)
      .populate('participants.user', 'username avatar')
      .populate('initiator', 'username avatar')
      .populate('voiceChannel', 'name server');

    // Emit socket events
    req.io.to(`channel:${channelId}`).emit('userLeftCall', {
      call: updatedCall,
      userId: userId,
      timestamp: new Date()
    });

    req.io.to(`server:${channel.server}`).emit('voiceStateUpdate', {
      userId: userId,
      channelId: channelId,
      action: 'left',
      timestamp: new Date()
    });

    // If call ended, emit call ended event
    if (updatedCall.status === 'ENDED') {
      req.io.to(`channel:${channelId}`).emit('callEnded', {
        call: updatedCall,
        timestamp: new Date()
      });
    }

    res.json({
      message: 'Left call successfully',
      call: updatedCall
    });

  } catch (error) {
    console.error('Error leaving voice channel call:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ================================
// DM CALLS
// ================================

// Start a DM call
router.post('/dm/:dmChannelId/start', [
  authenticate,
  param('dmChannelId').isMongoId().withMessage('Invalid DM channel ID'),
  body('hasVideo').optional().isBoolean().withMessage('hasVideo must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { dmChannelId } = req.params;
    const { hasVideo = false } = req.body;
    const userId = req.user.id;

    // Check if DM channel exists and user is participant
    const dmChannel = await DirectMessageChannel.findById(dmChannelId);
    if (!dmChannel || !dmChannel.participants.includes(userId)) {
      return res.status(404).json({ message: 'DM channel not found or access denied' });
    }

    // Check if there's already an active call
    const existingCall = await Call.getActiveCall(dmChannelId, 'DM');
    if (existingCall) {
      return res.status(409).json({ message: 'Call already active in this DM' });
    }

    // Create new call
    const roomId = generateRoomId();
    const callType = dmChannel.type === 'GROUP_DM' ? 'GROUP_DM' : 'DM';
    
    const call = new Call({
      type: callType,
      dmChannel: dmChannelId,
      initiator: userId,
      participants: [{
        user: userId,
        hasVideo: hasVideo,
        connectionState: 'CONNECTING'
      }],
      settings: {
        hasVideo: hasVideo,
        maxParticipants: dmChannel.type === 'GROUP_DM' ? 25 : 2
      },
      rtcData: {
        roomId: roomId
      }
    });

    await call.save();

    // Update voice state
    await VoiceState.createOrUpdateVoiceState(userId, {
      dmChannel: dmChannelId,
      call: call._id,
      connectionState: 'CONNECTING',
      hasVideo: hasVideo
    });

    const populatedCall = await Call.findById(call._id)
      .populate('participants.user', 'username avatar')
      .populate('initiator', 'username avatar')
      .populate('dmChannel', 'participants type name');

    // Emit socket events to all DM participants
    dmChannel.participants.forEach(participantId => {
      req.io.to(`user:${participantId}`).emit('dmCallStarted', {
        call: populatedCall,
        dmChannel: dmChannel,
        timestamp: new Date()
      });
    });

    res.status(201).json({
      message: 'DM call started successfully',
      call: populatedCall,
      roomId: roomId
    });

  } catch (error) {
    console.error('Error starting DM call:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Join a DM call
router.post('/dm/:dmChannelId/join', [
  authenticate,
  param('dmChannelId').isMongoId().withMessage('Invalid DM channel ID'),
  body('hasVideo').optional().isBoolean().withMessage('hasVideo must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { dmChannelId } = req.params;
    const { hasVideo = false } = req.body;
    const userId = req.user.id;

    // Check if DM channel exists and user is participant
    const dmChannel = await DirectMessageChannel.findById(dmChannelId);
    if (!dmChannel || !dmChannel.participants.includes(userId)) {
      return res.status(404).json({ message: 'DM channel not found or access denied' });
    }

    // Get active call
    const call = await Call.getActiveCall(dmChannelId, dmChannel.type === 'GROUP_DM' ? 'GROUP_DM' : 'DM');
    if (!call) {
      return res.status(404).json({ message: 'No active call found' });
    }

    // Add user to call
    await call.addParticipant(userId, hasVideo);

    // Update voice state
    await VoiceState.createOrUpdateVoiceState(userId, {
      dmChannel: dmChannelId,
      call: call._id,
      connectionState: 'CONNECTING',
      hasVideo: hasVideo
    });

    const populatedCall = await Call.findById(call._id)
      .populate('participants.user', 'username avatar')
      .populate('initiator', 'username avatar')
      .populate('dmChannel', 'participants type name');

    // Emit socket events
    dmChannel.participants.forEach(participantId => {
      req.io.to(`user:${participantId}`).emit('userJoinedDmCall', {
        call: populatedCall,
        user: req.user,
        hasVideo: hasVideo,
        timestamp: new Date()
      });
    });

    res.json({
      message: 'Joined DM call successfully',
      call: populatedCall,
      roomId: call.rtcData.roomId
    });

  } catch (error) {
    console.error('Error joining DM call:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Leave a DM call
router.post('/dm/:dmChannelId/leave', [
  authenticate,
  param('dmChannelId').isMongoId().withMessage('Invalid DM channel ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { dmChannelId } = req.params;
    const userId = req.user.id;

    // Get DM channel
    const dmChannel = await DirectMessageChannel.findById(dmChannelId);
    if (!dmChannel || !dmChannel.participants.includes(userId)) {
      return res.status(404).json({ message: 'DM channel not found or access denied' });
    }

    // Get active call
    const call = await Call.getActiveCall(dmChannelId, dmChannel.type === 'GROUP_DM' ? 'GROUP_DM' : 'DM');
    if (!call) {
      return res.status(404).json({ message: 'No active call found' });
    }

    // Remove user from call
    await call.removeParticipant(userId);

    // Update voice state
    const voiceState = await VoiceState.getUserVoiceState(userId);
    if (voiceState) {
      await voiceState.leaveChannel();
    }

    const updatedCall = await Call.findById(call._id)
      .populate('participants.user', 'username avatar')
      .populate('initiator', 'username avatar')
      .populate('dmChannel', 'participants type name');

    // Emit socket events
    dmChannel.participants.forEach(participantId => {
      req.io.to(`user:${participantId}`).emit('userLeftDmCall', {
        call: updatedCall,
        userId: userId,
        timestamp: new Date()
      });
    });

    // If call ended, emit call ended event
    if (updatedCall.status === 'ENDED') {
      dmChannel.participants.forEach(participantId => {
        req.io.to(`user:${participantId}`).emit('dmCallEnded', {
          call: updatedCall,
          timestamp: new Date()
        });
      });
    }

    res.json({
      message: 'Left DM call successfully',
      call: updatedCall
    });

  } catch (error) {
    console.error('Error leaving DM call:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ================================
// VOICE STATE MANAGEMENT
// ================================

// Update voice state (mute, deafen, video, screen share)
router.patch('/voice-state', [
  authenticate,
  body('isMuted').optional().isBoolean(),
  body('isDeafened').optional().isBoolean(),
  body('isSelfMuted').optional().isBoolean(),
  body('isSelfDeafened').optional().isBoolean(),
  body('hasVideo').optional().isBoolean(),
  body('isScreenSharing').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const updates = req.body;

    // Get current voice state
    let voiceState = await VoiceState.getUserVoiceState(userId);
    if (!voiceState || voiceState.connectionState === 'DISCONNECTED') {
      return res.status(404).json({ message: 'User not in any call' });
    }

    // Update voice settings
    if ('isMuted' in updates || 'isDeafened' in updates || 'isSelfMuted' in updates || 'isSelfDeafened' in updates) {
      await voiceState.updateVoiceSettings(updates);
    }

    // Update video settings
    if ('hasVideo' in updates || 'isScreenSharing' in updates) {
      await voiceState.updateVideoSettings(updates);
    }

    // Update call participant state
    if (voiceState.call) {
      const call = await Call.findById(voiceState.call);
      if (call) {
        await call.updateParticipantState(userId, updates);
      }
    }

    // Get updated voice state
    voiceState = await VoiceState.getUserVoiceState(userId);

    // Emit socket events
    const channelId = voiceState.channel || voiceState.dmChannel;
    const eventData = {
      userId: userId,
      voiceState: voiceState,
      updates: updates,
      timestamp: new Date()
    };

    if (voiceState.channel) {
      // Voice channel
      req.io.to(`channel:${channelId}`).emit('voiceStateUpdate', eventData);
    } else if (voiceState.dmChannel) {
      // DM channel
      const dmChannel = await DirectMessageChannel.findById(channelId);
      if (dmChannel) {
        dmChannel.participants.forEach(participantId => {
          req.io.to(`user:${participantId}`).emit('dmVoiceStateUpdate', eventData);
        });
      }
    }

    res.json({
      message: 'Voice state updated successfully',
      voiceState: voiceState
    });

  } catch (error) {
    console.error('Error updating voice state:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get user's current voice state
router.get('/voice-state', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const voiceState = await VoiceState.getUserVoiceState(userId);
    
    res.json({
      voiceState: voiceState
    });

  } catch (error) {
    console.error('Error getting voice state:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get active calls for a user
router.get('/my-calls', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const calls = await Call.getUserActiveCalls(userId);
    
    res.json({
      calls: calls
    });

  } catch (error) {
    console.error('Error getting user calls:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get call history
router.get('/:channelId/history', [
  authenticate,
  param('channelId').isMongoId().withMessage('Invalid channel ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { channelId } = req.params;
    const { type = 'voice', limit = 50 } = req.query;

    // Determine call type
    const callType = type === 'voice' ? 'VOICE_CHANNEL' : 'DM';
    
    const history = await Call.getCallHistory(channelId, callType, parseInt(limit));
    
    res.json({
      history: history
    });

  } catch (error) {
    console.error('Error getting call history:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
