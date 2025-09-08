import express from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { authenticate, generateToken } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import User from '../models/User.js';
import Friendship from '../models/Friendship.js';
import { config } from '../config/index.js';

const router = express.Router();

// Initialize Google OAuth client
const googleClient = new OAuth2Client(
  config.GOOGLE_CLIENT_ID,
  config.GOOGLE_CLIENT_SECRET,
  config.GOOGLE_REDIRECT_URI
);

// Register user
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, name, username } = req.body;

  if (!email || !password) {
    throw new ApiError('Email and password are required', 400);
  }

  // Check if user exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ApiError('User already exists', 400);
  }

  // Generate username if not provided
  let finalUsername = username || name || email.split('@')[0];
  finalUsername = finalUsername.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '');

  // Ensure username length
  if (finalUsername.length < 2) {
    finalUsername = 'user' + Math.floor(Math.random() * 10000);
  }
  if (finalUsername.length > 32) {
    finalUsername = finalUsername.substring(0, 32);
  }

  // Generate unique discriminator
  const discriminator = await User.generateDiscriminator();

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create user
  const user = new User({
    email: email.toLowerCase(),
    password: hashedPassword,
    name: name || finalUsername,
    username: finalUsername,
    discriminator,
    displayName: name || finalUsername
  });

  await user.save();

  // Generate token
  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    data: {
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        username: user.username,
        discriminator: user.discriminator,
        displayName: user.displayName,
        tag: user.getTag(),
        isActive: user.isActive,
        avatar: user.avatar,
        status: user.status
      },
    },
  });
}));

// Login user
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError('Email and password are required', 400);
  }

  // Find user with password
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) {
    throw new ApiError('Invalid credentials', 401);
  }

  // Check password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new ApiError('Invalid credentials', 401);
  }

  if (!user.isActive) {
    throw new ApiError('Account is deactivated', 401);
  }

  // Generate token
  const token = generateToken(user._id);

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        username: user.username,
        discriminator: user.discriminator,
        displayName: user.displayName,
        tag: user.getTag(),
        isActive: user.isActive,
        avatar: user.avatar,
        status: user.status,
        customStatus: user.customStatus,
        badges: user.badges
      },
    },
  });
}));

// Google OAuth login/register
router.post('/google', asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    throw new ApiError('Google ID token is required', 400);
  }

  try {
    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: config.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Find or create user
    let user = await User.findOne({ 
      $or: [
        { googleId },
        { email: email.toLowerCase() }
      ]
    });

    if (!user) {
      // Create new user
      user = new User({
        email: email.toLowerCase(),
        name,
        avatar: picture,
        googleId,
        isActive: true,
      });
      await user.save();
    } else if (!user.googleId) {
      // Link Google account to existing user
      user.googleId = googleId;
      user.avatar = user.avatar || picture;
      await user.save();
    }

    if (!user.isActive) {
      throw new ApiError('Account is deactivated', 401);
    }

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          isActive: user.isActive,
          avatar: user.avatar,
        },
      },
    });
  } catch (error) {
    console.error('Google auth error:', error);
    throw new ApiError('Google authentication failed', 401);
  }
}));

// Get current user
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user._id,
      email: req.user.email,
      name: req.user.name,
      isActive: req.user.isActive,
      avatar: req.user.avatar,
      settings: req.user.settings,
      createdAt: req.user.createdAt,
    },
  });
}));

// Update user profile
router.put('/profile', authenticate, asyncHandler(async (req, res) => {
  const { name, avatar } = req.body;

  const updateData = {};
  if (name) updateData.name = name;
  if (avatar) updateData.avatar = avatar;

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
      isActive: user.isActive,
      avatar: user.avatar,
    },
  });
}));

// Update user status
router.put('/status', authenticate, asyncHandler(async (req, res) => {
  const { status, customStatus } = req.body;

  // Validate status
  const validStatuses = ['ONLINE', 'IDLE', 'DND', 'INVISIBLE', 'OFFLINE'];
  if (status && !validStatuses.includes(status)) {
    throw new ApiError('Invalid status. Must be one of: ' + validStatuses.join(', '), 400);
  }

  const updateData = {};
  if (status) updateData.status = status;
  if (customStatus !== undefined) updateData.customStatus = customStatus;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    updateData,
    { new: true, runValidators: true }
  );

  // Broadcast status update to friends
  const io = req.app.get('io');
  if (io) {
    // Get user's friends to notify them of status change
    const friends = await Friendship.find({
      $or: [
        { requester: req.user._id, status: 'ACCEPTED' },
        { recipient: req.user._id, status: 'ACCEPTED' }
      ]
    }).populate('requester recipient', '_id');

    // Notify each friend
    friends.forEach(friendship => {
      const friendId = friendship.requester._id.toString() === req.user._id.toString() 
        ? friendship.recipient._id.toString() 
        : friendship.requester._id.toString();
      
      io.to(`user:${friendId}`).emit('friendStatusUpdate', {
        userId: req.user._id,
        status: user.status,
        customStatus: user.customStatus
      });
    });
  }

  res.json({
    success: true,
    data: {
      id: user._id,
      status: user.status,
      customStatus: user.customStatus
    }
  });
}));

// Change password
router.put('/password', authenticate, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError('Current password and new password are required', 400);
  }

  // Get user with password
  const user = await User.findById(req.user._id).select('+password');
  
  // If user has no password (Google OAuth only), don't require current password
  if (user.password) {
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new ApiError('Current password is incorrect', 400);
    }
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  // Update password
  user.password = hashedPassword;
  await user.save();

  res.json({
    success: true,
    message: 'Password updated successfully',
  });
}));

// Update user settings
router.put('/settings', authenticate, asyncHandler(async (req, res) => {
  const settings = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { settings },
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    data: user.settings,
  });
}));

// Refresh token
router.post('/refresh', authenticate, asyncHandler(async (req, res) => {
  const token = generateToken(req.user._id);

  res.json({
    success: true,
    data: { token },
  });
}));

// Logout (client-side token removal)
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
}));

// Deactivate account
router.delete('/account', authenticate, asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { isActive: false });

  res.json({
    success: true,
    message: 'Account deactivated successfully',
  });
}));

export default router;
