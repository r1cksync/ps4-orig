import express from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { authenticate, generateToken } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import User from '../models/User.js';
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
  const { email, password, name } = req.body;

  if (!email || !password) {
    throw new ApiError('Email and password are required', 400);
  }

  // Check if user exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ApiError('User already exists', 400);
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create user
  const user = new User({
    email: email.toLowerCase(),
    password: hashedPassword,
    name: name || email.split('@')[0],
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
        isActive: user.isActive,
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
        isActive: user.isActive,
        avatar: user.avatar,
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
