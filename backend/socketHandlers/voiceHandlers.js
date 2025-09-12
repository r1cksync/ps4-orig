import Call from '../models/Call.js';
import VoiceState from '../models/VoiceState.js';
import Channel from '../models/Channel.js';
import DirectMessageChannel from '../models/DirectMessageChannel.js';
import crypto from 'crypto';

export const handleVoiceEvents = (io, socket) => {
  
  // Join voice channel
  socket.on('joinVoiceChannel', async (data) => {
    try {
      const { channelId, hasVideo = false } = data;
      const userId = socket.userId;

      // Validate channel
      const channel = await Channel.findById(channelId);
      if (!channel || channel.type !== 'VOICE') {
        socket.emit('error', { message: 'Voice channel not found' });
        return;
      }

      // Join socket room for channel
      socket.join(`channel:${channelId}`);
      
      // Update voice state
      await VoiceState.createOrUpdateVoiceState(userId, {
        channel: channelId,
        connectionState: 'CONNECTING',
        hasVideo: hasVideo,
        joinedAt: new Date()
      });

      // Add to channel's connected users
      await channel.addConnectedUser(userId);

      // Get or create call
      let call = await Call.getActiveCall(channelId, 'VOICE_CHANNEL');
      if (!call) {
        const roomId = crypto.randomBytes(16).toString('hex');
        call = new Call({
          type: 'VOICE_CHANNEL',
          voiceChannel: channelId,
          initiator: userId,
          rtcData: { roomId }
        });
        await call.save();
      }

      await call.addParticipant(userId, hasVideo);

      // Emit to channel
      socket.to(`channel:${channelId}`).emit('userJoinedVoice', {
        userId: userId,
        channelId: channelId,
        hasVideo: hasVideo,
        timestamp: new Date()
      });

      // Emit to server
      socket.to(`server:${channel.server}`).emit('voiceStateUpdate', {
        userId: userId,
        channelId: channelId,
        action: 'joined',
        hasVideo: hasVideo,
        timestamp: new Date()
      });

      socket.emit('voiceChannelJoined', {
        channelId: channelId,
        roomId: call.rtcData.roomId,
        participants: call.activeParticipants
      });

    } catch (error) {
      console.error('Error joining voice channel:', error);
      socket.emit('error', { message: 'Failed to join voice channel' });
    }
  });

  // Leave voice channel
  socket.on('leaveVoiceChannel', async () => {
    try {
      const userId = socket.userId;

      // Get current voice state
      const voiceState = await VoiceState.getUserVoiceState(userId);
      if (!voiceState || !voiceState.channel) {
        return;
      }

      const channelId = voiceState.channel._id;

      // Update voice state
      await voiceState.leaveChannel();

      // Remove from channel
      const channel = await Channel.findById(channelId);
      if (channel) {
        await channel.removeConnectedUser(userId);
        socket.leave(`channel:${channelId}`);
      }

      // Update call
      if (voiceState.call) {
        const call = await Call.findById(voiceState.call);
        if (call) {
          await call.removeParticipant(userId);
        }
      }

      // Emit events
      socket.to(`channel:${channelId}`).emit('userLeftVoice', {
        userId: userId,
        channelId: channelId,
        timestamp: new Date()
      });

      if (channel) {
        socket.to(`server:${channel.server}`).emit('voiceStateUpdate', {
          userId: userId,
          channelId: channelId,
          action: 'left',
          timestamp: new Date()
        });
      }

      socket.emit('voiceChannelLeft', {
        channelId: channelId
      });

    } catch (error) {
      console.error('Error leaving voice channel:', error);
      socket.emit('error', { message: 'Failed to leave voice channel' });
    }
  });

  // Update voice state (mute, deafen, video, etc.)
  socket.on('updateVoiceState', async (data) => {
    try {
      const userId = socket.userId;
      const { isMuted, isDeafened, isSelfMuted, isSelfDeafened, hasVideo, isScreenSharing } = data;

      const voiceState = await VoiceState.getUserVoiceState(userId);
      if (!voiceState || voiceState.connectionState === 'DISCONNECTED') {
        socket.emit('error', { message: 'Not in any voice channel' });
        return;
      }

      // Update voice state
      const updates = {};
      if (isMuted !== undefined) updates.isMuted = isMuted;
      if (isDeafened !== undefined) updates.isDeafened = isDeafened;
      if (isSelfMuted !== undefined) updates.isSelfMuted = isSelfMuted;
      if (isSelfDeafened !== undefined) updates.isSelfDeafened = isSelfDeafened;
      if (hasVideo !== undefined) updates.hasVideo = hasVideo;
      if (isScreenSharing !== undefined) updates.isScreenSharing = isScreenSharing;

      await voiceState.updateVoiceSettings(updates);
      await voiceState.updateVideoSettings(updates);

      // Update call if exists
      if (voiceState.call) {
        const call = await Call.findById(voiceState.call);
        if (call) {
          await call.updateParticipantState(userId, updates);
        }
      }

      const channelId = voiceState.channel?._id || voiceState.dmChannel?._id;
      if (channelId) {
        const eventData = {
          userId: userId,
          updates: updates,
          timestamp: new Date()
        };

        if (voiceState.channel) {
          // Voice channel
          socket.to(`channel:${channelId}`).emit('voiceStateUpdate', eventData);
        } else if (voiceState.dmChannel) {
          // DM channel
          const dmChannel = await DirectMessageChannel.findById(channelId);
          if (dmChannel) {
            dmChannel.participants.forEach(participantId => {
              if (participantId.toString() !== userId.toString()) {
                io.to(`user:${participantId}`).emit('dmVoiceStateUpdate', eventData);
              }
            });
          }
        }
      }

      socket.emit('voiceStateUpdated', {
        voiceState: voiceState,
        updates: updates
      });

    } catch (error) {
      console.error('Error updating voice state:', error);
      socket.emit('error', { message: 'Failed to update voice state' });
    }
  });

  // Start DM call
  socket.on('startDmCall', async (data) => {
    try {
      const { dmChannelId, hasVideo = false } = data;
      const userId = socket.userId;

      // Validate DM channel
      const dmChannel = await DirectMessageChannel.findById(dmChannelId);
      if (!dmChannel || !dmChannel.participants.includes(userId)) {
        socket.emit('error', { message: 'DM channel not found or access denied' });
        return;
      }

      // Check for existing call
      const existingCall = await Call.getActiveCall(dmChannelId, dmChannel.type === 'GROUP_DM' ? 'GROUP_DM' : 'DM');
      if (existingCall) {
        socket.emit('error', { message: 'Call already active' });
        return;
      }

      // Create call
      const roomId = crypto.randomBytes(16).toString('hex');
      const call = new Call({
        type: dmChannel.type === 'GROUP_DM' ? 'GROUP_DM' : 'DM',
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
        rtcData: { roomId }
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
        .populate('initiator', 'username avatar');

      // Emit to all participants
      dmChannel.participants.forEach(participantId => {
        io.to(`user:${participantId}`).emit('dmCallStarted', {
          call: populatedCall,
          dmChannel: dmChannel,
          timestamp: new Date()
        });
      });

      socket.emit('dmCallCreated', {
        call: populatedCall,
        roomId: roomId
      });

    } catch (error) {
      console.error('Error starting DM call:', error);
      socket.emit('error', { message: 'Failed to start DM call' });
    }
  });

  // Join DM call
  socket.on('joinDmCall', async (data) => {
    try {
      const { dmChannelId, hasVideo = false } = data;
      const userId = socket.userId;

      const dmChannel = await DirectMessageChannel.findById(dmChannelId);
      if (!dmChannel || !dmChannel.participants.includes(userId)) {
        socket.emit('error', { message: 'DM channel not found or access denied' });
        return;
      }

      const call = await Call.getActiveCall(dmChannelId, dmChannel.type === 'GROUP_DM' ? 'GROUP_DM' : 'DM');
      if (!call) {
        socket.emit('error', { message: 'No active call found' });
        return;
      }

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
        .populate('initiator', 'username avatar');

      // Emit to all participants
      dmChannel.participants.forEach(participantId => {
        io.to(`user:${participantId}`).emit('userJoinedDmCall', {
          call: populatedCall,
          userId: userId,
          hasVideo: hasVideo,
          timestamp: new Date()
        });
      });

      socket.emit('dmCallJoined', {
        call: populatedCall,
        roomId: call.rtcData.roomId
      });

    } catch (error) {
      console.error('Error joining DM call:', error);
      socket.emit('error', { message: 'Failed to join DM call' });
    }
  });

  // Leave DM call
  socket.on('leaveDmCall', async () => {
    try {
      const userId = socket.userId;

      const voiceState = await VoiceState.getUserVoiceState(userId);
      if (!voiceState || !voiceState.dmChannel) {
        return;
      }

      const dmChannelId = voiceState.dmChannel._id;
      const dmChannel = await DirectMessageChannel.findById(dmChannelId);

      // Update voice state
      await voiceState.leaveChannel();

      // Update call
      if (voiceState.call) {
        const call = await Call.findById(voiceState.call);
        if (call) {
          await call.removeParticipant(userId);
          
          const updatedCall = await Call.findById(call._id)
            .populate('participants.user', 'username avatar')
            .populate('initiator', 'username avatar');

          // Emit to all participants
          if (dmChannel) {
            dmChannel.participants.forEach(participantId => {
              io.to(`user:${participantId}`).emit('userLeftDmCall', {
                call: updatedCall,
                userId: userId,
                timestamp: new Date()
              });
            });

            // If call ended
            if (updatedCall.status === 'ENDED') {
              dmChannel.participants.forEach(participantId => {
                io.to(`user:${participantId}`).emit('dmCallEnded', {
                  call: updatedCall,
                  timestamp: new Date()
                });
              });
            }
          }
        }
      }

      socket.emit('dmCallLeft', {
        dmChannelId: dmChannelId
      });

    } catch (error) {
      console.error('Error leaving DM call:', error);
      socket.emit('error', { message: 'Failed to leave DM call' });
    }
  });

  // WebRTC signaling events
  socket.on('rtcOffer', (data) => {
    const { targetUserId, offer, roomId } = data;
    socket.to(`user:${targetUserId}`).emit('rtcOffer', {
      fromUserId: socket.userId,
      offer: offer,
      roomId: roomId
    });
  });

  socket.on('rtcAnswer', (data) => {
    const { targetUserId, answer, roomId } = data;
    socket.to(`user:${targetUserId}`).emit('rtcAnswer', {
      fromUserId: socket.userId,
      answer: answer,
      roomId: roomId
    });
  });

  socket.on('rtcIceCandidate', (data) => {
    const { targetUserId, candidate, roomId } = data;
    socket.to(`user:${targetUserId}`).emit('rtcIceCandidate', {
      fromUserId: socket.userId,
      candidate: candidate,
      roomId: roomId
    });
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    try {
      const userId = socket.userId;
      if (!userId) return;

      // Get voice state and clean up
      const voiceState = await VoiceState.getUserVoiceState(userId);
      if (voiceState && voiceState.connectionState !== 'DISCONNECTED') {
        
        // Update voice state
        await voiceState.leaveChannel();

        // Clean up channel if in voice channel
        if (voiceState.channel) {
          const channel = await Channel.findById(voiceState.channel._id);
          if (channel) {
            await channel.removeConnectedUser(userId);
            
            socket.to(`channel:${voiceState.channel._id}`).emit('userLeftVoice', {
              userId: userId,
              channelId: voiceState.channel._id,
              timestamp: new Date()
            });

            socket.to(`server:${channel.server}`).emit('voiceStateUpdate', {
              userId: userId,
              channelId: voiceState.channel._id,
              action: 'disconnected',
              timestamp: new Date()
            });
          }
        }

        // Clean up DM call if in DM call
        if (voiceState.dmChannel) {
          const dmChannel = await DirectMessageChannel.findById(voiceState.dmChannel._id);
          if (dmChannel) {
            dmChannel.participants.forEach(participantId => {
              if (participantId.toString() !== userId.toString()) {
                io.to(`user:${participantId}`).emit('userLeftDmCall', {
                  userId: userId,
                  dmChannelId: voiceState.dmChannel._id,
                  timestamp: new Date()
                });
              }
            });
          }
        }

        // Update call
        if (voiceState.call) {
          const call = await Call.findById(voiceState.call);
          if (call) {
            await call.removeParticipant(userId);
          }
        }
      }

    } catch (error) {
      console.error('Error handling voice disconnect:', error);
    }
  });

};