import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import jwt from 'jsonwebtoken';

// Security
import { helmetConfig, corsOptions, apiLimiter, validateEnv } from './config/security.js';

// Validate environment variables on startup
try {
  validateEnv();
  console.log('✓ Environment variables validated');
} catch (error) {
  console.error('✗ Environment validation failed:', error.message);
  process.exit(1);
}

// Routes
import authRoutes from './routes/auth.js';
import appointmentRoutes from './routes/appointments.js';
import doctorRoutes from './routes/doctors.js';
import patientRoutes from './routes/patients.js';
import tokenRoutes from './routes/tokens.js';
import receptionistRoutes from './routes/receptionists.js';
import serviceRoutes from './routes/services.js';
import symptomRoutes from './routes/symptoms.js';
import reviewRoutes from './routes/reviews.js';
import statsRoutes from './routes/stats.js';
import deviceRoutes from './routes/device.js';
import departmentRoutes from './routes/departments.js';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// CRITICAL: Set server timeouts to prevent socket hang-up
server.keepAliveTimeout = 120000; // 120 seconds
server.headersTimeout = 125000;   // Slightly higher than keepAliveTimeout

// ==========================================
// Secure WebSocket Server
// ==========================================
const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 100 * 1024, // 100KB max message size
  clientTracking: true,
});

const clients = new Map(); // Store client metadata
const MAX_CONNECTIONS_PER_IP = 5;
const ipConnections = new Map();

// Authenticate WebSocket connection
function authenticateWsConnection(token) {
  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'pulse-opd-secret-key';
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    return null;
  }
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;

  // Check connection limit per IP
  const currentConnections = ipConnections.get(ip) || 0;
  if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
    console.log('[WS] Connection limit reached for IP:', ip);
    ws.close(1008, 'Connection limit reached');
    return;
  }

  // Parse connection details
  const url = new URL(req.url, `ws://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const publicAccess = url.searchParams.get('public') === 'true';

  // Authenticate connection
  const user = authenticateWsConnection(token);

  // Allow public read-only access for display boards
  if (!user && !publicAccess) {
    console.log('[WS] Unauthorized connection attempt');
    ws.close(1008, 'Authentication required. Add ?public=true for display board access');
    return;
  }

  // Track connection
  ipConnections.set(ip, currentConnections + 1);
  const clientData = {
    user: user || { role: 'public', name: 'Public Display' },
    channels: new Set(),
    ip,
    isPublic: !user,
  };
  clients.set(ws, clientData);

  const identifier = user ? user.email : `Public:${ip}`;
  console.log(`[WS] ${identifier} connected (${clientData.isPublic ? 'PUBLIC' : 'AUTH'}). Total: ${clients.size}`);

  ws.on('message', (message) => {
    try {
      // Limit message size
      if (message.length > 10000) {
        ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
        return;
      }

      const data = JSON.parse(message);

      // Handle different message types
      if (data.type === 'subscribe' && data.channel) {
        const clientData = clients.get(ws);
        if (clientData) {
          // Public users can only subscribe to read-only channels
          const publicAllowedChannels = ['tokens', 'display', 'queue'];

          if (clientData.isPublic && !publicAllowedChannels.includes(data.channel)) {
            ws.send(JSON.stringify({
              type: 'error',
              message: `Public access limited to: ${publicAllowedChannels.join(', ')}`
            }));
            return;
          }

          clientData.channels.add(data.channel);
          ws.send(JSON.stringify({
            type: 'subscribed',
            channel: data.channel,
            isPublic: clientData.isPublic
          }));
        }
      } else if (data.type === 'unsubscribe' && data.channel) {
        const clientData = clients.get(ws);
        if (clientData) {
          clientData.channels.delete(data.channel);
          ws.send(JSON.stringify({ type: 'unsubscribed', channel: data.channel }));
        }
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    const clientData = clients.get(ws);
    if (clientData) {
      const connections = ipConnections.get(clientData.ip) || 1;
      ipConnections.set(clientData.ip, Math.max(0, connections - 1));
      clients.delete(ws);
      const identifier = clientData.user.email || `Public:${clientData.ip}`;
      console.log(`[WS] ${identifier} disconnected. Total: ${clients.size}`);
    }
  });

  ws.on('error', (error) => {
    console.error('[WS] Error:', error.message);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to Pulse OPD',
    user: clientData.user,
    isPublic: clientData.isPublic,
    allowedChannels: clientData.isPublic ? ['tokens', 'display', 'queue'] : 'all'
  }));
});

// Broadcast to all clients
export function broadcast(channel, data) {
  const message = JSON.stringify({ channel, data, timestamp: new Date().toISOString() });
  clients.forEach((clientData, ws) => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      if (clientData.channels.size === 0 || clientData.channels.has(channel)) {
        try {
          ws.send(message);
        } catch (error) {
          console.error('[WS] Broadcast error:', error.message);
        }
      }
    }
  });
}

app.set('broadcast', broadcast);

// ==========================================
// Security Middleware
// ==========================================

// Security headers (helmet)
app.use(helmetConfig);

// CORS with strict origin validation
app.use(cors(corsOptions));

// Request size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global rate limiting
app.use('/api/', apiLimiter);

// Disable X-Powered-By header
app.disable('x-powered-by');

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} | ${req.method} ${req.path} | IP: ${req.ip}`);
  next();
});

// ==========================================
// Public Routes (No Auth Required)
// ==========================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    websocket: clients.size,
  });
});

// Deep health check - tests Firebase connection
app.get('/api/health/db', async (req, res) => {
  try {
    const { db } = await import('./config/firebase.js');
    const startTime = Date.now();

    const testPromise = db.ref('.info/connected').once('value');
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database connection timeout')), 5000)
    );

    await Promise.race([testPromise, timeoutPromise]);
    const duration = Date.now() - startTime;

    res.json({
      status: 'ok',
      database: 'connected',
      latency: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

// ==========================================
// API Routes
// ==========================================

app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/receptionists', receptionistRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/symptoms', symptomRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/device', deviceRoutes);

// ==========================================
// Error Handlers
// ==========================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  // Log error (but don't expose stack trace in production)
  console.error('[Error]', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS policy violation',
      message: 'Origin not allowed',
    });
  }

  // Validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.details || err.message,
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Authentication token expired' });
  }

  // Generic error response (don't leak internal details)
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ==========================================
// Start Server
// ==========================================

server.listen(PORT, () => {
  console.log(`
  ========================================
  🏥 Pulse OPD Backend Server (SECURE)
  ========================================
  Environment: ${process.env.NODE_ENV || 'development'}
  HTTP Port: ${PORT}
  WebSocket: ws://localhost:${PORT}/ws
  Time: ${new Date().toISOString()}

  Security Features:
  ✓ Helmet security headers
  ✓ CORS with origin validation
  ✓ Rate limiting enabled
  ✓ Request size limits
  ✓ WebSocket authentication
  ✓ Input validation ready

  API Endpoints:
  - POST /api/auth/login
  - POST /api/auth/register
  - GET  /api/appointments
  - GET  /api/doctors
  - GET  /api/tokens
  - GET  /api/stats
  ========================================
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received. Closing server gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
