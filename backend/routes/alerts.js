import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import Alert from '../models/Alert.js';

const router = express.Router();

// Get user alerts
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, severity, alertType, isRead } = req.query;

  const filter = { userId: req.user.id };
  
  if (severity) filter.severity = severity.toUpperCase();
  if (alertType) filter.alertType = alertType.toUpperCase();
  if (isRead !== undefined) filter.isRead = isRead === 'true';

  const alerts = await Alert.find(filter)
    .populate('scanResultId', 'riskLevel riskScore contentType source originalContent')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Alert.countDocuments(filter);
  const unreadCount = await Alert.countDocuments({ userId: req.user.id, isRead: false });

  res.json({
    success: true,
    data: alerts,
    unreadCount,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}));

// Mark alert as read
router.put('/:id/read', authenticate, asyncHandler(async (req, res) => {
  const alert = await Alert.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { isRead: true },
    { new: true }
  );

  if (!alert) {
    throw new ApiError('Alert not found', 404);
  }

  res.json({
    success: true,
    data: alert
  });
}));

// Mark alert as acknowledged
router.put('/:id/acknowledge', authenticate, asyncHandler(async (req, res) => {
  const alert = await Alert.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { 
      isAcknowledged: true,
      acknowledgedAt: new Date()
    },
    { new: true }
  );

  if (!alert) {
    throw new ApiError('Alert not found', 404);
  }

  res.json({
    success: true,
    data: alert
  });
}));

// Mark all alerts as read
router.put('/read-all', authenticate, asyncHandler(async (req, res) => {
  await Alert.updateMany(
    { userId: req.user.id, isRead: false },
    { isRead: true }
  );

  res.json({
    success: true,
    message: 'All alerts marked as read'
  });
}));

// Delete alert
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const alert = await Alert.findOneAndDelete({
    _id: req.params.id,
    userId: req.user.id
  });

  if (!alert) {
    throw new ApiError('Alert not found', 404);
  }

  res.json({
    success: true,
    message: 'Alert deleted successfully'
  });
}));

// Get alert statistics
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
  const stats = await Alert.aggregate([
    { $match: { userId: req.user._id } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        unread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
        critical: { $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] } },
        emergency: { $sum: { $cond: [{ $eq: ['$severity', 'EMERGENCY'] }, 1, 0] } }
      }
    }
  ]);

  const alertStats = stats[0] || {
    total: 0,
    unread: 0,
    critical: 0,
    emergency: 0
  };

  // Get alerts by type
  const alertsByType = await Alert.aggregate([
    { $match: { userId: req.user._id } },
    {
      $group: {
        _id: '$alertType',
        count: { $sum: 1 }
      }
    }
  ]);

  res.json({
    success: true,
    data: {
      ...alertStats,
      byType: alertsByType
    }
  });
}));

export default router;
