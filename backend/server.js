import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

// Import configurations and services
import { config } from './config/index.js';
import database from './config/database.js';

// Import routes
import authRoutes from './routes/auth.js';
import scanRoutes from './routes/scan.js';
import alertRoutes from './routes/alerts.js';
import userRoutes from './routes/users.js';
import webhookRoutes from './routes/webhooks.js';
import urlRoutes from './routes/url.js';
import serverRoutes from './routes/servers.js';
import channelRoutes from './routes/channels.js';
import messageRoutes from './routes/messages.js';
import dmRoutes from './routes/dms.js';
import friendRoutes from './routes/friends.js';
import rolesRoutes from './routes/roles.js';
import callsRoutes from './routes/calls.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './middleware/logger.js';
import { authenticateSocket, handleConnection } from './socketHandlers/index.js';

// Load environment variables
dotenv.config();

class Server {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? ['https://yourdomain.com'] 
          : ['http://localhost:3000', 'http://localhost:3001'],
        methods: ['GET', 'POST'],
        credentials: true
      }
    });
    this.port = config.PORT;
  }

  async initialize() {
    try {
      // Connect to database
      await database.connect();
      
      // Setup middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup WebSocket
      this.setupWebSocket();
      
      // Setup error handling
      this.setupErrorHandling();
      
      // Start server
      this.start();
    } catch (error) {
      console.error('❌ Failed to initialize server:', error);
      process.exit(1);
    }
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] 
        : ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX_REQUESTS,
      message: {
        error: 'Too many requests from this IP, please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Make Socket.IO available to routes
    this.app.use((req, res, next) => {
      req.io = this.io;
      next();
    });

    // Request logging
    this.app.use(logger);

    // Make io instance available to routes
    this.app.use((req, res, next) => {
      req.io = this.io;
      next();
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: database.isConnected() ? 'connected' : 'disconnected',
      });
    });
  }

  setupRoutes() {
    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/scan', scanRoutes);
    this.app.use('/api/alerts', alertRoutes);
    this.app.use('/api/users', userRoutes);
    this.app.use('/api/webhooks', webhookRoutes);
    this.app.use('/api/url', urlRoutes);
    
    // Discord-like chat routes
    this.app.use('/api/servers', serverRoutes);
    this.app.use('/api/servers', rolesRoutes);
    this.app.use('/api/roles', rolesRoutes); // Add direct roles route for permissions
    this.app.use('/api/channels', channelRoutes);
    this.app.use('/api/messages', messageRoutes);
    this.app.use('/api/dms', dmRoutes);
    this.app.use('/api/friends', friendRoutes);
    this.app.use('/api/calls', callsRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'IntelliHack Chat & Fraud Detection API',
        version: '2.0.0',
        status: 'running',
        features: {
          fraudDetection: 'Real-time scam and fraud detection',
          chat: 'Discord-like chat with servers, channels, DMs',
          realTime: 'Socket.IO powered real-time messaging'
        },
        endpoints: {
          health: '/health',
          auth: '/api/auth',
          scan: '/api/scan',
          alerts: '/api/alerts',
          users: '/api/users',
          webhooks: '/api/webhooks',
          url: '/api/url',
          servers: '/api/servers',
          channels: '/api/channels',
          messages: '/api/messages',
          dms: '/api/dms',
          friends: '/api/friends'
        },
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method,
      });
    });
  }

  setupWebSocket() {
    // Socket.IO authentication middleware
    this.io.use(authenticateSocket);
    
    // Handle connections with comprehensive Discord-like features
    this.io.on('connection', handleConnection(this.io));

    // Make io available to other modules
    this.app.set('io', this.io);
    
    console.log('🔌 WebSocket configured with Discord-like features:');
    console.log('   - Real-time messaging');
    console.log('   - Voice channel management');
    console.log('   - Typing indicators');
    console.log('   - User presence/status');
    console.log('   - Friend system');
    console.log('   - Direct messages');
  }

  setupErrorHandling() {
    // Error handling middleware (must be last)
    this.app.use(errorHandler);

    // Unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      console.error('❌ Unhandled Promise Rejection:', err);
      this.gracefulShutdown();
    });

    // Uncaught exceptions
    process.on('uncaughtException', (err) => {
      console.error('❌ Uncaught Exception:', err);
      this.gracefulShutdown();
    });

    // Graceful shutdown signals
    process.on('SIGTERM', () => {
      console.log('📡 SIGTERM received');
      this.gracefulShutdown();
    });

    process.on('SIGINT', () => {
      console.log('📡 SIGINT received');
      this.gracefulShutdown();
    });
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(`🚀 IntelliHack Server running on port ${this.port}`);
      console.log(`🌍 Environment: ${config.NODE_ENV}`);
      console.log(`📊 Database: ${database.isConnected() ? 'Connected' : 'Disconnected'}`);
      console.log(`🔗 Health check: http://localhost:${this.port}/health`);
      console.log(`💬 Chat Features: Discord-like servers, channels, DMs, voice, friends`);
      console.log(`🛡️  Fraud Detection: Real-time scam detection integrated into chat`);
    });
  }

  async gracefulShutdown() {
    console.log('🔄 Starting graceful shutdown...');

    // Close server
    this.server.close(() => {
      console.log('✅ HTTP server closed');
    });

    // Close WebSocket connections
    this.io.close(() => {
      console.log('✅ WebSocket server closed');
    });

    // Close database connection
    try {
      await database.disconnect();
    } catch (error) {
      console.error('❌ Error closing database:', error);
    }

    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  }
}

// Create and initialize server
const serverInstance = new Server();
serverInstance.initialize().catch((error) => {
  console.error('❌ Server initialization failed:', error);
  process.exit(1);
});

export default serverInstance;
