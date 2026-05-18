import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

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

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// CRITICAL: Set server timeouts to prevent socket hang-up on Render
// Default Node.js keepAliveTimeout is 5s which can cause issues with load balancers
server.keepAliveTimeout = 120000; // 120 seconds (Render's timeout is 30s, but be safe)
server.headersTimeout = 125000;   // Slightly higher than keepAliveTimeout

// ==========================================
// WebSocket Server for Real-time Updates
// ==========================================
const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[WS] Client connected. Total:', clients.size);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('[WS] Received:', data);

      // Handle different message types
      if (data.type === 'subscribe') {
        ws.channel = data.channel; // e.g., 'tokens', 'appointments'
      }
    } catch (e) {
      console.log('[WS] Invalid message');
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('[WS] Client disconnected. Total:', clients.size);
  });

  // Send welcome message
  ws.send(JSON.stringify({ type: 'connected', message: 'Connected to Pulse OPD' }));
});

// Broadcast to all clients
export function broadcast(channel, data) {
  const message = JSON.stringify({ channel, data, timestamp: new Date().toISOString() });
  clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      if (!client.channel || client.channel === channel) {
        client.send(message);
      }
    }
  });
}

// Expose broadcast function globally for routes to use
app.set('broadcast', broadcast);

// ==========================================
// Middleware
// ==========================================

// Manual CORS handling for maximum compatibility
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://hospital-token-frontend.vercel.app',
    'http://localhost:5173',
    'http://localhost:8080'
  ];

  const origin = req.headers.origin;
  console.log('[CORS] Request from origin:', origin);

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (origin) {
    console.log('[CORS] WARNING: Origin not in allowed list:', origin);
    // Still set for debugging - remove in production
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Cache-Control, Pragma');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    console.log('[CORS] Preflight request handled');
    return res.status(204).end();
  }

  next();
});

app.use(express.json());

// Ensure responses are properly flushed (fix for Render proxy buffering)
app.use((req, res, next) => {
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    websocket: `ws://localhost:${PORT}/ws`,
    clients: clients.size
  });
});

// POST test endpoint to debug login-like requests
app.post('/api/test-post', (req, res) => {
  console.log('[Test] POST received, body:', req.body);
  const jsonResponse = JSON.stringify({ success: true, received: req.body });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(jsonResponse));
  res.setHeader('Connection', 'close');
  res.status(200).end(jsonResponse);
  console.log('[Test] Response sent');
});

// Deep health check - tests Firebase connection
app.get('/api/health/db', async (req, res) => {
  try {
    const { db } = await import('./config/firebase.js');
    const startTime = Date.now();

    // Test with timeout
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
    console.error('[Health] Database check failed:', error.message);
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/receptionists', receptionistRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/symptoms', symptomRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/device', deviceRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

server.listen(PORT, () => {
  console.log(`
  ========================================
  Pulse OPD Backend Server
  ========================================
  HTTP Port: ${PORT}
  WebSocket: ws://localhost:${PORT}/ws
  Time: ${new Date().toISOString()}

  API Endpoints:
  - GET  /api/health
  - POST /api/auth/login
  - POST /api/auth/register
  - GET  /api/appointments
  - GET  /api/doctors
  - GET  /api/tokens
  - GET  /api/stats

  Device Endpoints:
  - POST /api/device/register
  - POST /api/device/next
  - GET  /api/device/current
  - GET  /api/device/queue
  ========================================
  `);
});

export default app;
