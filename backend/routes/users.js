import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import User from '../models/User.js';
import ScanResult from '../models/ScanResult.js';
import Alert from '../models/Alert.js';

const router = express.Router();

// Get user dashboard stats
router.get('/dashboard', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Get scan statistics
  const scanStats = await ScanResult.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: null,
        totalScans: { $sum: 1 },
        highRiskScans: { 
          $sum: { 
            $cond: [
              { $in: ['$riskLevel', ['HIGH', 'CRITICAL']] }, 
              1, 
              0 
            ] 
          } 
        },
        avgRiskScore: { $avg: '$riskScore' }
      }
    }
  ]);

  // Get scans by risk level
  const scansByRisk = await ScanResult.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: '$riskLevel',
        count: { $sum: 1 }
      }
    }
  ]);

  // Get recent scans
  const recentScans = await ScanResult.find({ userId })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('riskLevel riskScore source contentType originalContent createdAt');

  // Get alert count
  const alertCount = await Alert.countDocuments({ userId, isRead: false });

  // Get scans by source
  const scansBySource = await ScanResult.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: '$source',
        count: { $sum: 1 }
      }
    }
  ]);

  const stats = scanStats[0] || {
    totalScans: 0,
    highRiskScans: 0,
    avgRiskScore: 0
  };

  res.json({
    success: true,
    data: {
      stats,
      scansByRisk,
      scansBySource,
      recentScans,
      unreadAlerts: alertCount
    }
  });
}));

// Get user profile
router.get('/profile', authenticate, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  res.json({
    success: true,
    data: {
      id: user._id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      isActive: user.isActive,
      settings: user.settings,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  });
}));

// Update user profile
router.put('/profile', authenticate, asyncHandler(async (req, res) => {
  const { name, avatar } = req.body;

  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (avatar !== undefined) updateData.avatar = avatar;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    updateData,
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    data: {
      id: user._id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      isActive: user.isActive
    }
  });
}));

// Get user settings
router.get('/settings', authenticate, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  res.json({
    success: true,
    data: user.settings || {}
  });
}));

// Update user settings
router.put('/settings', authenticate, asyncHandler(async (req, res) => {
  const settings = req.body;

  // Validate settings structure
  const allowedSettings = [
    'emailAlerts', 'pushNotifications', 'slackIntegration',
    'autoScanGmail', 'autoScanWhatsApp', 'scanImages', 'scanAudio', 'scanUrls',
    'lowRiskThreshold', 'mediumRiskThreshold', 'highRiskThreshold'
  ];

  const validSettings = {};
  Object.keys(settings).forEach(key => {
    if (allowedSettings.includes(key)) {
      validSettings[key] = settings[key];
    }
  });

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { 
      $set: Object.keys(validSettings).reduce((acc, key) => {
        acc[`settings.${key}`] = validSettings[key];
        return acc;
      }, {})
    },
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    data: user.settings
  });
}));

// Get user activity
router.get('/activity', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, days = 30 } = req.query;
  const userId = req.user._id;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(days));

  // Get recent scan activity
  const scanActivity = await ScanResult.find({
    userId,
    createdAt: { $gte: startDate }
  })
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .select('source contentType riskLevel riskScore originalContent createdAt');

  const total = await ScanResult.countDocuments({
    userId,
    createdAt: { $gte: startDate }
  });

  // Get activity by day
  const activityByDay = await ScanResult.aggregate([
    {
      $match: {
        userId,
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
        count: { $sum: 1 },
        highRiskCount: {
          $sum: {
            $cond: [
              { $in: ['$riskLevel', ['HIGH', 'CRITICAL']] },
              1,
              0
            ]
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.json({
    success: true,
    data: {
      activity: scanActivity,
      activityByDay,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  });
}));

// Export user data
router.get('/export', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Get user data
  const user = await User.findById(userId);
  const scanResults = await ScanResult.find({ userId });
  const alerts = await Alert.find({ userId });

  const exportData = {
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      settings: user.settings,
      createdAt: user.createdAt
    },
    scanResults: scanResults.map(scan => ({
      id: scan._id,
      source: scan.source,
      contentType: scan.contentType,
      riskLevel: scan.riskLevel,
      riskScore: scan.riskScore,
      detectedPatterns: scan.detectedPatterns,
      createdAt: scan.createdAt
    })),
    alerts: alerts.map(alert => ({
      id: alert._id,
      title: alert.title,
      message: alert.message,
      severity: alert.severity,
      createdAt: alert.createdAt
    })),
    exportedAt: new Date(),
    version: '1.0'
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=fraud-detection-data.json');
  res.json(exportData);
}));

export default router;
