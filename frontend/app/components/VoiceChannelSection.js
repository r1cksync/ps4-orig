
'use client';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../authImplementation';
import debounce from 'lodash/debounce';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const VoiceChannelSection = ({ channelId, serverId, socket, channel }) => {
  const { user, token, loading: authLoading } = useAuth();
  const [activeCall, setActiveCall] = useState(null);
  const [isUserInCall, setIsUserInCall] = useState(false);
  const [hasLeftCall, setHasLeftCall] = useState(() => {
    if (typeof window !== 'undefined' && user?.id) {
      const storedState = localStorage.getItem(`callState_${user.id}_${channelId}`);
      return storedState ? JSON.parse(storedState).hasLeftCall : false;
    }
    return false;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Log user data to verify username
  useEffect(() => {
    if (user) {
      console.log('VoiceChannelSection user:', { id: user.id, username: user.username, discriminator: user.discriminator, avatar: user.avatar });
    }
  }, [user]);

  // Save hasLeftCall to localStorage
  useEffect(() => {
    if (user?.id) {
      localStorage.setItem(`callState_${user.id}_${channelId}`, JSON.stringify({ hasLeftCall }));
    }
  }, [hasLeftCall, user?.id, channelId]);

  const fetchActiveCall = useCallback(
    debounce(async (retryCount = 5, retryDelay = 500) => {
      if (!token || !user?.id || hasLeftCall) {
        console.error('Cannot fetch call: No token, user ID, or user has left', {
          token,
          userId: user?.id,
          hasLeftCall,
        });
        return;
      }
      try {
        const response = await axios.get(`${BASE_URL}/calls/voice-channel/${channelId}/active`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const call = response.data.call;
        console.log('Fetched active call:', call);
        console.log('Raw participants:', call.participants);
        console.log(
          'Participants:',
          call.participants.map((p) => ({
            userId: p.user?.id || p.user?._id,
            username: p.user?.username || 'Unknown',
            leftAt: p.leftAt,
          }))
        );
        setActiveCall(call);
        const isInCall = call.participants.some(
          (p) => (p.user?.id?.toString() || p.user?._id?.toString()) === user.id?.toString() && !p.leftAt
        );
        setIsUserInCall(isInCall);
        console.log('fetchActiveCall isUserInCall:', isInCall, 'User ID:', user.id);
      } catch (err) {
        if (err.response?.status === 404 && err.response?.data?.message === 'No active call in this channel') {
          setActiveCall(null);
          setIsUserInCall(false);
        } else if (retryCount > 0) {
          console.warn(`Retrying fetchActiveCall (${retryCount} attempts left)...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return fetchActiveCall(retryCount - 1, retryDelay * 1.5);
        } else {
          console.error('Error fetching active call:', err.message);
          setError('Failed to fetch active call. Please try again.');
        }
      }
    }, 1000),
    [token, user?.id, channelId, hasLeftCall]
  );

  const fetchVoiceState = useCallback(async () => {
    if (!token || !user?.id) {
      console.error('Cannot fetch voice state: No token or user ID', { token, userId: user?.id });
      return;
    }
    try {
      const response = await axios.get(`${BASE_URL}/calls/voice-state`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const voiceState = response.data.voiceState;
      console.log('Fetched voice state:', voiceState);
      const isInCall = voiceState?.connectionState === 'CONNECTED' && voiceState?.channel?._id === channelId;
      setIsUserInCall(isInCall);
      setHasLeftCall(!isInCall && voiceState?.channel?._id === channelId);
      localStorage.setItem(`callState_${user.id}_${channelId}`, JSON.stringify({ hasLeftCall: !isInCall }));
      if (isInCall) {
        await fetchActiveCall();
      }
    } catch (err) {
      if (err.response?.status === 404 && err.response?.data?.message === 'User not in any call') {
        // Handle case where VoiceState doesn't exist
        setIsUserInCall(false);
        setHasLeftCall(true);
        localStorage.setItem(`callState_${user.id}_${channelId}`, JSON.stringify({ hasLeftCall: true }));
      } else {
        console.error('Error fetching voice state:', err.message);
        setError('Failed to fetch voice state. Please try again.');
      }
    }
  }, [token, user?.id, channelId, fetchActiveCall]);

  useEffect(() => {
    if (authLoading) return;
    if (token && user?.id) {
      console.log('Fetching voice state for user ID:', user.id, 'Username:', user.username);
      fetchVoiceState();
    } else {
      console.error('No token or user ID', { token, userId: user?.id });
      setError('Please log in to join calls');
    }

    socket.onAny((event, data) => console.log('Socket event:', event, data));

    const handleCallStarted = (data) => {
      if (data.call?.voiceChannel._id === channelId) {
        console.log('callStarted event:', data);
        console.log('Raw participants (callStarted):', data.call.participants);
        setActiveCall(data.call);
        const isInCall = data.call.participants.some(
          (p) => (p.user?.id?.toString() || p.user?._id?.toString()) === user.id?.toString() && !p.leftAt
        );
        setIsUserInCall(isInCall);
        if (isInCall) {
          setHasLeftCall(false);
          localStorage.setItem(`callState_${user.id}_${channelId}`, JSON.stringify({ hasLeftCall: false }));
        }
        console.log('callStarted isUserInCall:', isInCall);
      }
    };

    const handleUserJoinedCall = (data) => {
      if (data.call?.voiceChannel._id === channelId) {
        console.log('userJoinedCall event:', data);
        console.log('Raw participants (userJoinedCall):', data.call.participants);
        console.log(
          'Joined Participants:',
          data.call.participants.map((p) => ({
            userId: p.user?.id || p.user?._id,
            username: p.user?.username || 'Unknown',
            leftAt: p.leftAt,
          }))
        );
        setActiveCall(data.call);
        const isInCall = data.call.participants.some(
          (p) => (p.user?.id?.toString() || p.user?._id?.toString()) === user.id?.toString() && !p.leftAt
        );
        setIsUserInCall(isInCall);
        if (isInCall) {
          setHasLeftCall(false);
          localStorage.setItem(`callState_${user.id}_${channelId}`, JSON.stringify({ hasLeftCall: false }));
        }
        console.log('userJoinedCall isUserInCall:', isInCall);
      }
    };

    const handleUserLeftCall = (data) => {
      if (data.call?.voiceChannel._id === channelId) {
        console.log('userLeftCall event:', data);
        console.log('Raw participants (userLeftCall):', data.call.participants);
        console.log(
          'Left Participants:',
          data.call.participants.map((p) => ({
            userId: p.user?.id || p.user?._id,
            username: p.user?.username || 'Unknown',
            leftAt: p.leftAt,
          }))
        );
        setActiveCall(data.call);
        if (data.userId === user?.id?.toString()) {
          setIsUserInCall(false);
          setHasLeftCall(true);
          localStorage.setItem(`callState_${user.id}_${channelId}`, JSON.stringify({ hasLeftCall: true }));
          console.log('userLeftCall: User left, setting isUserInCall: false, hasLeftCall: true');
        } else {
          setActiveCall((prev) => ({
            ...prev,
            participants: prev?.participants?.map((p) =>
              (p.user?.id?.toString() || p.user?._id?.toString()) === data.userId ? { ...p, leftAt: new Date() } : p
            ) || [],
          }));
          const isInCall = data.call.participants.some(
            (p) => (p.user?.id?.toString() || p.user?._id?.toString()) === user.id?.toString() && !p.leftAt
          );
          setIsUserInCall(isInCall);
          fetchActiveCall();
          console.log('userLeftCall isUserInCall:', isInCall, 'User ID:', user.id);
        }
      }
    };

    const handleVoiceStateUpdate = (data) => {
      if (data.voiceState?.channel?._id === channelId) {
        console.log('voiceStateUpdate event:', data);
        setActiveCall((prev) => {
          if (!prev) return prev;
          const updatedParticipants = prev.participants.map((p) => {
            if ((p.user?.id?.toString() || p.user?._id?.toString()) === data.userId) {
              return {
                ...p,
                isMuted: data.voiceState.isMuted,
                hasVideo: data.voiceState.hasVideo,
                leftAt: data.voiceState.connectionState === 'DISCONNECTED' ? new Date() : p.leftAt,
              };
            }
            return p;
          });
          return { ...prev, participants: updatedParticipants };
        });
        if (data.userId === user?.id?.toString()) {
          const isInCall = data.voiceState.connectionState === 'CONNECTED';
          setIsUserInCall(isInCall);
          setHasLeftCall(!isInCall);
          localStorage.setItem(`callState_${user.id}_${channelId}`, JSON.stringify({ hasLeftCall: !isInCall }));
        }
      }
    };

    const handleCallEnded = (data) => {
      if (data.call?.voiceChannel._id === channelId) {
        console.log('callEnded event:', data);
        setActiveCall(null);
        setIsUserInCall(false);
        setHasLeftCall(false);
        localStorage.setItem(`callState_${user.id}_${channelId}`, JSON.stringify({ hasLeftCall: false }));
        setError('');
      }
    };

    socket.on('callStarted', handleCallStarted);
    socket.on('userJoinedCall', handleUserJoinedCall);
    socket.on('userLeftCall', handleUserLeftCall);
    socket.on('voiceStateUpdate', handleVoiceStateUpdate);
    socket.on('callEnded', handleCallEnded);

    return () => {
      socket.off('callStarted', handleCallStarted);
      socket.off('userJoinedCall', handleUserJoinedCall);
      socket.off('userLeftCall', handleUserLeftCall);
      socket.off('voiceStateUpdate', handleVoiceStateUpdate);
      socket.off('callEnded', handleCallEnded);
      socket.offAny();
      fetchActiveCall.cancel();
    };
  }, [socket, channelId, token, user, authLoading, fetchActiveCall, fetchVoiceState]);

  const joinCall = async () => {
    if (!user?.id || !token) {
      setError('Please log in to join calls');
      return;
    }
    setLoading(true);
    setError('');
    setHasLeftCall(false);
    localStorage.setItem(`callState_${user.id}_${channelId}`, JSON.stringify({ hasLeftCall: false }));
    try {
      const joinResponse = await axios.post(
        `${BASE_URL}/calls/voice-channel/${channelId}/join`,
        { hasVideo: false },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Join response:', joinResponse.data);
      setActiveCall(joinResponse.data.call);
      setIsUserInCall(true);

      // Update VoiceState
      await axios.patch(
        `${BASE_URL}/calls/voice-state`,
        { connectionState: 'CONNECTED', channelId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Voice state updated to CONNECTED');

      console.log('Joined/started call. Room ID:', joinResponse.data.roomId);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await fetchActiveCall();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to join/start call');
      setIsUserInCall(false);
      setHasLeftCall(false);
      localStorage.setItem(`callState_${user.id}_${channelId}`, JSON.stringify({ hasLeftCall: false }));
      await fetchActiveCall();
    } finally {
      setLoading(false);
    }
  };

  const leaveCall = async () => {
    if (!user?.id || !token) {
      setError('Please log in to leave calls');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const leaveResponse = await axios.post(
        `${BASE_URL}/calls/voice-channel/${channelId}/leave`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Leave response:', leaveResponse.data);
      console.log(
        'Leave response participants:',
        leaveResponse.data.call?.participants.map((p) => ({
          userId: p.user?.id || p.user?._id,
          username: p.user?.username || 'Unknown',
          leftAt: p.leftAt,
        }))
      );

      // Update VoiceState to DISCONNECTED
      await axios.patch(
        `${BASE_URL}/calls/voice-state`,
        { connectionState: 'DISCONNECTED' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Voice state updated to DISCONNECTED');

      setActiveCall(leaveResponse.data.call?.status === 'ENDED' ? null : leaveResponse.data.call);
      setIsUserInCall(false);
      setHasLeftCall(true);
      localStorage.setItem(`callState_${user.id}_${channelId}`, JSON.stringify({ hasLeftCall: true }));
      console.log('Left call successfully, isUserInCall: false, hasLeftCall: true');
    } catch (err) {
      if (err.response?.status === 404 && err.response?.data?.message === 'No active call found') {
        setActiveCall(null);
        setIsUserInCall(false);
        setHasLeftCall(true);
        localStorage.setItem(`callState_${user.id}_${channelId}`, JSON.stringify({ hasLeftCall: true }));
        setError('No active call to leave');
      } else {
        console.error('Error leaving call:', err.message);
        setError(err.response?.data?.message || 'Failed to leave call');
        setIsUserInCall(false);
        setHasLeftCall(true);
        localStorage.setItem(`callState_${user.id}_${channelId}`, JSON.stringify({ hasLeftCall: true }));
      }
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#36393f',
      color: '#dcddde',
      padding: '20px',
      justifyContent: 'center',
      alignItems: 'center',
      textAlign: 'center',
    },
    header: {
      fontSize: '28px',
      fontWeight: 'bold',
      marginBottom: '10px',
      color: '#ffffff',
    },
    subheader: {
      fontSize: '16px',
      marginBottom: '30px',
      color: '#b9bbbe',
    },
    button: {
      backgroundColor: '#5865f2',
      color: 'white',
      border: 'none',
      padding: '12px 24px',
      borderRadius: '3px',
      fontSize: '16px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
      marginBottom: '10px',
      marginRight: '10px',
    },
    leaveButton: {
      backgroundColor: '#ed4245',
      color: 'white',
      border: 'none',
      padding: '12px 24px',
      borderRadius: '3px',
      fontSize: '16px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
      marginBottom: '10px',
      marginRight: '10px',
    },
    buttonHover: {
      backgroundColor: '#4752c4',
    },
    leaveButtonHover: {
      backgroundColor: '#c13538',
    },
    buttonDisabled: {
      backgroundColor: '#4f545c',
      cursor: 'not-allowed',
    },
    error: {
      color: '#ed4245',
      marginTop: '10px',
      fontSize: '14px',
    },
    callActive: {
      backgroundColor: '#2f3136',
      padding: '20px',
      borderRadius: '8px',
      maxWidth: '400px',
      textAlign: 'left',
    },
    participants: {
      marginTop: '15px',
    },
    participant: {
      display: 'flex',
      alignItems: 'center',
      marginBottom: '8px',
      fontSize: '14px',
    },
  };

  const handleMouseEnter = (e, isLeaveButton = false) => {
    if (!loading) {
      e.target.style.backgroundColor = isLeaveButton
        ? styles.leaveButtonHover.backgroundColor
        : styles.buttonHover.backgroundColor;
    }
  };

  const handleMouseLeave = (e, isLeaveButton = false) => {
    if (!loading) {
      e.target.style.backgroundColor = isLeaveButton
        ? styles.leaveButton.backgroundColor
        : styles.button.backgroundColor;
    }
  };

  const uniqueParticipants = activeCall
    ? [
        ...(!hasLeftCall && user?.id
          ? [{
              user: {
                _id: user.id,
                id: user.id,
                username: user.username,
                avatar: user.avatar || null,
              },
              joinedAt: new Date(),
              leftAt: null,
              isMuted: false,
              hasVideo: false,
              connectionState: 'CONNECTED',
            }]
          : []),
        ...[...new Set(
          activeCall.participants
            .filter((p) => p.user && (p.user.id || p.user._id) && !p.leftAt && (p.user.id || p.user._id).toString() !== user?.id?.toString())
            .map((p) => (p.user.id || p.user._id).toString())
        )]
          .map((userId) =>
            activeCall.participants.find(
              (p) => (p.user?.id?.toString() || p.user?._id?.toString()) === userId && !p.leftAt
            )
          )
          .filter(Boolean)
          .map((p) => ({
            ...p,
            user: {
              ...p.user,
              username: p.user?.username || 'Unknown',
              avatar: p.user?.avatar || null,
            },
          })),
      ]
    : [];

  console.log(
    'Current unique participants:',
    uniqueParticipants.map((p) => p.user?.username),
    'User ID:',
    user?.id,
    'isUserInCall:',
    isUserInCall,
    'hasLeftCall:',
    hasLeftCall
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>{channel?.name || 'Voice Channel'}</div>
      <div style={styles.subheader}>
        {activeCall
          ? `${uniqueParticipants.length} ${uniqueParticipants.length === 1 ? 'person' : 'people'} in call`
          : 'No one is in this voice channel. Start a call to connect.'}
      </div>

      {authLoading ? (
        <div>Loading user data...</div>
      ) : !user?.id ? (
        <div style={styles.error}>Please log in to join calls</div>
      ) : activeCall ? (
        <>
          <div style={styles.callActive}>
            <p style={{ marginBottom: '10px', color: '#00d4aa' }}>🟢 Call is active</p>
            <p style={{ margin: '5px 0', fontSize: '12px', color: '#b9bbbe' }}>
              Room ID: {activeCall.rtcData.roomId}
            </p>
            <div style={styles.participants}>
              <strong>Participants:</strong>
              {uniqueParticipants.length > 0 ? (
                uniqueParticipants.map((p) => (
                  <div key={p.user._id || p.user.id} style={styles.participant}>
                    <span>{p.user.username}</span>
                    {p.isMuted && <span style={{ marginLeft: '5px', color: '#ed4245' }}>🔇</span>}
                    {p.hasVideo && <span style={{ marginLeft: '5px', color: '#00d4aa' }}>📹</span>}
                    {(p.user._id || p.user.id).toString() === user.id?.toString() && (
                      <span style={{ marginLeft: '5px', color: '#5865f2' }}>(You)</span>
                    )}
                  </div>
                ))
              ) : (
                <div style={styles.participant}>No active participants</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', marginTop: '20px' }}>
            {isUserInCall ? (
              <button
                onClick={leaveCall}
                disabled={loading}
                onMouseEnter={(e) => handleMouseEnter(e, true)}
                onMouseLeave={(e) => handleMouseLeave(e, true)}
                style={{
                  ...styles.leaveButton,
                  ...(loading ? styles.buttonDisabled : {}),
                }}
              >
                {loading ? 'Leaving...' : 'Leave Call'}
              </button>
            ) : (
              <button
                onClick={joinCall}
                disabled={loading}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                style={{
                  ...styles.button,
                  ...(loading ? styles.buttonDisabled : {}),
                }}
              >
                {loading ? 'Joining...' : 'Join Call'}
              </button>
            )}
          </div>
        </>
      ) : (
        <button
          onClick={joinCall}
          disabled={loading || !user?.id}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{
            ...styles.button,
            ...(loading || !user?.id ? styles.buttonDisabled : {}),
          }}
        >
          {loading ? 'Starting Call...' : 'Start Voice Call'}
        </button>
      )}

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
};

export default VoiceChannelSection;
