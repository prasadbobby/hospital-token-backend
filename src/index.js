import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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
app.use(cors({
  origin: ['https://hospital-token-frontend.vercel.app', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control', 'Pragma'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 0 // Disable preflight caching temporarily
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

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
