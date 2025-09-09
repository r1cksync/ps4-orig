const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const Server = require('../models/Server');
const auth = require('../middleware/auth');
const { validationResult, query, param } = require('express-validator');

// Get server audit logs
router.get('/:serverId/audit-logs', auth, [
  param('serverId').isMongoId().withMessage('Invalid server ID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('skip').optional().isInt({ min: 0 }).withMessage('Skip must be non-negative'),
  query('action').optional().isString().withMessage('Action must be a string'),
  query('executor').optional().isMongoId().withMessage('Executor must be a valid user ID'),
  query('target').optional().isMongoId().withMessage('Target must be a valid user ID'),
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { serverId } = req.params;
    const { 
      limit = 50, 
      skip = 0, 
      action, 
      executor, 
      target, 
      startDate, 
      endDate 
    } = req.query;

    // Check if server exists and user has permission
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Check permissions - only server owner or users with VIEW_AUDIT_LOG permission
    if (!server.isOwner(req.user.userId)) {
      const hasPermission = await server.hasPermission(req.user.userId, 'VIEW_AUDIT_LOG');
      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions to view audit logs' });
      }
    }

    const options = {
      limit: parseInt(limit),
      skip: parseInt(skip),
      action,
      executor,
      target,
      startDate,
      endDate
    };

    const logs = await AuditLog.getServerLogs(serverId, options);

    // Get total count for pagination
    const query = { server: serverId };
    if (action) query.action = action;
    if (executor) query.executor = executor;
    if (target) query.target = target;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const totalCount = await AuditLog.countDocuments(query);

    res.json({
      logs,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: (parseInt(skip) + parseInt(limit)) < totalCount
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get user action history across all servers
router.get('/user/:userId/history', auth, [
  param('userId').isMongoId().withMessage('Invalid user ID'),
  query('serverId').optional().isMongoId().withMessage('Invalid server ID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    const { serverId, limit = 50 } = req.query;

    // Users can only view their own history unless they're server owners/admins
    if (req.user.userId !== userId) {
      // If serverId provided, check if user has permissions in that server
      if (serverId) {
        const server = await Server.findById(serverId);
        if (!server) {
          return res.status(404).json({ error: 'Server not found' });
        }

        if (!server.isOwner(req.user.userId)) {
          const hasPermission = await server.hasPermission(req.user.userId, 'VIEW_AUDIT_LOG');
          if (!hasPermission) {
            return res.status(403).json({ error: 'Insufficient permissions' });
          }
        }
      } else {
        return res.status(403).json({ error: 'Can only view your own action history' });
      }
    }

    const history = await AuditLog.getUserHistory(userId, serverId, parseInt(limit));

    res.json(history);
  } catch (error) {
    console.error('Error fetching user history:', error);
    res.status(500).json({ error: 'Failed to fetch user history' });
  }
});

// Get audit log statistics for a server
router.get('/:serverId/audit-logs/stats', auth, [
  param('serverId').isMongoId().withMessage('Invalid server ID'),
  query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { serverId } = req.params;
    const { days = 30 } = req.query;

    // Check if server exists and user has permission
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (!server.isOwner(req.user.userId)) {
      const hasPermission = await server.hasPermission(req.user.userId, 'VIEW_AUDIT_LOG');
      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Aggregate statistics
    const stats = await AuditLog.aggregate([
      {
        $match: {
          server: server._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          lastOccurrence: { $max: '$createdAt' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Get top executors
    const topExecutors = await AuditLog.aggregate([
      {
        $match: {
          server: server._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$executor',
          count: { $sum: 1 },
          actions: { $addToSet: '$action' }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          user: { username: 1, avatar: 1 },
          count: 1,
          uniqueActions: { $size: '$actions' }
        }
      }
    ]);

    // Get daily activity
    const dailyActivity = await AuditLog.aggregate([
      {
        $match: {
          server: server._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const totalActions = await AuditLog.countDocuments({
      server: serverId,
      createdAt: { $gte: startDate }
    });

    res.json({
      period: `${days} days`,
      totalActions,
      actionBreakdown: stats,
      topExecutors,
      dailyActivity
    });
  } catch (error) {
    console.error('Error fetching audit log statistics:', error);
    res.status(500).json({ error: 'Failed to fetch audit log statistics' });
  }
});

// Get specific audit log entry
router.get('/entry/:logId', auth, [
  param('logId').isMongoId().withMessage('Invalid log ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { logId } = req.params;

    const log = await AuditLog.findById(logId)
      .populate('server', 'name icon')
      .populate('executor', 'username avatar')
      .populate('target', 'username avatar');

    if (!log) {
      return res.status(404).json({ error: 'Audit log entry not found' });
    }

    // Check permissions
    const server = await Server.findById(log.server._id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (!server.isOwner(req.user.userId)) {
      const hasPermission = await server.hasPermission(req.user.userId, 'VIEW_AUDIT_LOG');
      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    res.json({
      ...log.toObject(),
      formattedChanges: log.formatChanges(),
      description: log.description
    });
  } catch (error) {
    console.error('Error fetching audit log entry:', error);
    res.status(500).json({ error: 'Failed to fetch audit log entry' });
  }
});

// Export audit logs (for server backups/compliance)
router.get('/:serverId/audit-logs/export', auth, [
  param('serverId').isMongoId().withMessage('Invalid server ID'),
  query('format').optional().isIn(['json', 'csv']).withMessage('Format must be json or csv'),
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { serverId } = req.params;
    const { format = 'json', startDate, endDate } = req.query;

    // Check if server exists and user has permission
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Only server owner can export audit logs
    if (!server.isOwner(req.user.userId)) {
      return res.status(403).json({ error: 'Only server owner can export audit logs' });
    }

    const query = { server: serverId };
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(query)
      .populate('executor', 'username')
      .populate('target', 'username')
      .sort({ createdAt: -1 });

    if (format === 'csv') {
      // Convert to CSV format
      const csvHeader = 'Timestamp,Action,Executor,Target,Reason,Changes\n';
      const csvData = logs.map(log => {
        const timestamp = log.createdAt.toISOString();
        const action = log.action;
        const executor = log.executor?.username || 'Unknown';
        const target = log.target?.username || '';
        const reason = (log.reason || '').replace(/,/g, ';'); // Escape commas
        const changes = log.formatChanges()?.join('; ') || '';
        
        return `"${timestamp}","${action}","${executor}","${target}","${reason}","${changes}"`;
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${serverId}-${Date.now()}.csv"`);
      res.send(csvHeader + csvData);
    } else {
      // JSON format
      const exportData = {
        server: {
          id: server._id,
          name: server.name
        },
        exportDate: new Date().toISOString(),
        period: {
          startDate: startDate || 'All time',
          endDate: endDate || 'All time'
        },
        totalLogs: logs.length,
        logs: logs.map(log => ({
          id: log._id,
          timestamp: log.createdAt,
          action: log.action,
          description: log.description,
          executor: log.executor ? {
            id: log.executor._id,
            username: log.executor.username
          } : null,
          target: log.target ? {
            id: log.target._id,
            username: log.target.username
          } : null,
          reason: log.reason,
          changes: log.changes,
          metadata: log.metadata,
          formattedChanges: log.formatChanges()
        }))
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${serverId}-${Date.now()}.json"`);
      res.json(exportData);
    }
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

module.exports = router;
