const AuditLog = require('../models/AuditLog');

// Middleware to automatically log server actions
const auditLogger = {
  // Log server actions
  logServerAction: async (action, server, executor, changes = {}, metadata = {}, reason = null) => {
    try {
      await AuditLog.log({
        server: server._id || server,
        action,
        executor: executor._id || executor,
        targetType: 'Server',
        targetId: server._id || server,
        reason,
        changes,
        metadata
      });
    } catch (error) {
      console.error('Failed to log server action:', error);
    }
  },

  // Log member actions
  logMemberAction: async (action, server, executor, target, changes = {}, metadata = {}, reason = null) => {
    try {
      await AuditLog.log({
        server: server._id || server,
        action,
        executor: executor._id || executor,
        target: target._id || target,
        targetType: 'User',
        reason,
        changes,
        metadata
      });
    } catch (error) {
      console.error('Failed to log member action:', error);
    }
  },

  // Log role actions
  logRoleAction: async (action, server, executor, role, changes = {}, metadata = {}, reason = null) => {
    try {
      await AuditLog.log({
        server: server._id || server,
        action,
        executor: executor._id || executor,
        targetType: 'Role',
        targetId: role._id || role,
        reason,
        changes,
        metadata
      });
    } catch (error) {
      console.error('Failed to log role action:', error);
    }
  },

  // Log channel actions
  logChannelAction: async (action, server, executor, channel, changes = {}, metadata = {}, reason = null) => {
    try {
      await AuditLog.log({
        server: server._id || server,
        action,
        executor: executor._id || executor,
        targetType: 'Channel',
        targetId: channel._id || channel,
        reason,
        changes,
        metadata
      });
    } catch (error) {
      console.error('Failed to log channel action:', error);
    }
  },

  // Log message actions
  logMessageAction: async (action, server, executor, message, changes = {}, metadata = {}, reason = null) => {
    try {
      await AuditLog.log({
        server: server._id || server,
        action,
        executor: executor._id || executor,
        targetType: 'Message',
        targetId: message._id || message,
        reason,
        changes,
        metadata
      });
    } catch (error) {
      console.error('Failed to log message action:', error);
    }
  },

  // Log invite actions
  logInviteAction: async (action, server, executor, invite, changes = {}, metadata = {}, reason = null) => {
    try {
      await AuditLog.log({
        server: server._id || server,
        action,
        executor: executor._id || executor,
        targetType: 'Invite',
        targetId: invite._id || invite,
        reason,
        changes,
        metadata: {
          ...metadata,
          inviteCode: invite.code || invite
        }
      });
    } catch (error) {
      console.error('Failed to log invite action:', error);
    }
  },

  // Log emoji actions
  logEmojiAction: async (action, server, executor, emoji, changes = {}, metadata = {}, reason = null) => {
    try {
      await AuditLog.log({
        server: server._id || server,
        action,
        executor: executor._id || executor,
        targetType: 'Emoji',
        targetId: emoji._id || emoji,
        reason,
        changes,
        metadata: {
          ...metadata,
          emojiName: emoji.name || emoji
        }
      });
    } catch (error) {
      console.error('Failed to log emoji action:', error);
    }
  },

  // Express middleware to track changes
  trackChanges: (model) => {
    return (req, res, next) => {
      // Store original document for comparison
      req.originalDoc = null;
      
      // If this is an update operation, fetch the original
      if (req.method === 'PATCH' || req.method === 'PUT') {
        const id = req.params.serverId || req.params.roleId || req.params.channelId;
        if (id) {
          model.findById(id).then(doc => {
            req.originalDoc = doc ? doc.toObject() : null;
            next();
          }).catch(next);
        } else {
          next();
        }
      } else {
        next();
      }
    };
  },

  // Helper to calculate changes between old and new documents
  calculateChanges: (oldDoc, newDoc) => {
    const changes = {};
    
    if (!oldDoc || !newDoc) return changes;

    const compareFields = (old, updated, prefix = '') => {
      for (const key in updated) {
        if (updated.hasOwnProperty(key)) {
          const fullKey = prefix ? `${prefix}.${key}` : key;
          
          if (typeof updated[key] === 'object' && updated[key] !== null && !Array.isArray(updated[key])) {
            // Recursively compare nested objects
            if (old[key]) {
              compareFields(old[key], updated[key], fullKey);
            } else {
              changes[fullKey] = { old: undefined, new: updated[key] };
            }
          } else if (old[key] !== updated[key]) {
            changes[fullKey] = { old: old[key], new: updated[key] };
          }
        }
      }
    };

    compareFields(oldDoc, newDoc);
    return changes;
  },

  // Middleware to automatically log after successful operations
  autoLog: (action, getTargetInfo) => {
    return async (req, res, next) => {
      // Store original response methods
      const originalSend = res.send;
      const originalJson = res.json;

      // Override response methods to log after successful operations
      const logAfterResponse = (data) => {
        // Only log for successful operations (2xx status codes)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          setImmediate(async () => {
            try {
              const targetInfo = getTargetInfo(req, data);
              const changes = req.originalDoc ? 
                auditLogger.calculateChanges(req.originalDoc, data) : {};

              await auditLogger.logServerAction(
                action,
                targetInfo.server,
                req.user.userId || req.user._id,
                changes,
                targetInfo.metadata,
                req.body.reason
              );
            } catch (error) {
              console.error('Auto-log failed:', error);
            }
          });
        }
      };

      res.send = function(data) {
        logAfterResponse(data);
        return originalSend.call(this, data);
      };

      res.json = function(data) {
        logAfterResponse(data);
        return originalJson.call(this, data);
      };

      next();
    };
  }
};

module.exports = auditLogger;
