import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import User from '../models/User.js';
import { ApiError, asyncHandler } from './errorHandler.js';

export const authenticate = asyncHandler(async (req, res, next) => {
  let token;

  // Get token from header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Check if token exists
  if (!token) {
    throw new ApiError('Access denied. No token provided', 401);
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, config.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.id).select('-gmailToken -gmailRefresh -whatsappToken');
    
    if (!user) {
      throw new ApiError('User not found', 401);
    }

    if (!user.isActive) {
      throw new ApiError('Account is deactivated', 401);
    }

    // Add user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw new ApiError('Invalid token', 401);
    }
    if (error.name === 'TokenExpiredError') {
      throw new ApiError('Token expired', 401);
    }
    throw error;
  }
});

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new ApiError('Access denied. Authentication required', 401);
    }

    if (!roles.includes(req.user.role)) {
      throw new ApiError('Access denied. Insufficient permissions', 403);
    }

    next();
  };
};

export const optionalAuth = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-gmailToken -gmailRefresh -whatsappToken');
      
      if (user && user.isActive) {
        req.user = user;
      }
    } catch (error) {
      // Ignore token errors for optional auth
    }
  }

  next();
});

export const generateToken = (userId) => {
  return jwt.sign({ id: userId }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN || '7d',
  });
};
