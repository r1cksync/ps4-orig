import crypto from 'crypto';

/**
 * Generate a unique room ID for WebRTC calls
 * @returns {string} Unique room ID
 */
export const generateRoomId = () => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Generate a unique session ID
 * @returns {string} Unique session ID
 */
export const generateSessionId = () => {
  return crypto.randomUUID();
};

/**
 * Validate audio/video quality settings
 * @param {Object} quality - Quality settings object
 * @returns {boolean} Whether quality settings are valid
 */
export const validateQualitySettings = (quality) => {
  const validResolutions = ['480p', '720p', '1080p'];
  const validFrameRates = [15, 30, 60];
  const validBitrates = { min: 8, max: 384 };

  if (quality.resolution && !validResolutions.includes(quality.resolution)) {
    return false;
  }

  if (quality.frameRate && !validFrameRates.includes(quality.frameRate)) {
    return false;
  }

  if (quality.bitrate && (quality.bitrate < validBitrates.min || quality.bitrate > validBitrates.max)) {
    return false;
  }

  return true;
};

/**
 * Format call duration in human readable format
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
export const formatCallDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

/**
 * Check if user has permission for voice/video operations
 * @param {Object} user - User object
 * @param {Object} channel - Channel object
 * @param {string} permission - Permission to check
 * @returns {boolean} Whether user has permission
 */
export const checkVoicePermission = (user, channel, permission) => {
  // This is a placeholder - implement actual permission checking logic
  // based on your existing permission system
  const voicePermissions = ['CONNECT', 'SPEAK', 'USE_VAD', 'STREAM'];
  return voicePermissions.includes(permission);
};

/**
 * Generate WebRTC configuration for STUN/TURN servers
 * @returns {Object} WebRTC configuration
 */
export const getWebRTCConfig = () => {
  return {
    iceServers: [
      {
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302'
        ]
      },
      // Add TURN servers here for production
      // {
      //   urls: 'turn:your-turn-server.com:3478',
      //   username: 'username',
      //   credential: 'password'
      // }
    ],
    iceCandidatePoolSize: 10
  };
};
