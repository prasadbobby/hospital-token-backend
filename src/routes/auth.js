import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import FirebaseService from '../services/firebase.service.js';
import { generateToken, authenticate } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, phone, specialty } = req.body;

    // Validate required fields
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Email, password, name, and role are required' });
    }

    // Validate role
    const validRoles = ['admin', 'doctor', 'receptionist'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, doctor, or receptionist' });
    }

    // Check if user exists
    const existingUsers = await FirebaseService.getByField('users', 'email', email.toLowerCase());
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = uuidv4();
    const user = await FirebaseService.createWithId('users', userId, {
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      role,
      phone: phone || '',
      specialty: specialty || '',
      active: true
    });

    // If doctor, create doctor profile
    if (role === 'doctor') {
      await FirebaseService.createWithId('doctors', userId, {
        userId,
        name,
        email: email.toLowerCase(),
        specialty: specialty || 'General Medicine',
        phone: phone || '',
        experience: 0,
        rating: 0,
        reviewsCount: 0,
        todayPatients: 0,
        avgWait: 0,
        revenue: 0,
        tokenLimit: 40,
        slotDuration: 15,
        active: true
      });
    }

    // If receptionist, create receptionist profile
    if (role === 'receptionist') {
      await FirebaseService.createWithId('receptionists', userId, {
        userId,
        name,
        email: email.toLowerCase(),
        phone: phone || '',
        shifts: 'Mon-Fri 9am-5pm',
        assignedDoctors: [],
        active: true
      });
    }

    // Generate token
    const token = generateToken({ id: userId, email: user.email, role, name });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: userId,
        email: user.email,
        name,
        role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    console.log('[Auth] Login request received');
    const { email, password } = req.body;

    // Quick test mode - add ?test=1 to skip DB and return immediately
    if (req.query.test === '1') {
      console.log('[Auth] TEST MODE - returning immediate response');
      return res.json({ test: true, message: 'Quick response works!' });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    console.log('[Auth] Finding user...');
    const users = await FirebaseService.getByField('users', 'email', email.toLowerCase());

    if (users.length === 0) {
      console.log('[Auth] User not found');
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];
    console.log('[Auth] User found:', user.email);

    // Check if user is active
    if (!user.active) {
      console.log('[Auth] User deactivated');
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    // Verify password
    console.log('[Auth] Verifying password...');
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('[Auth] Invalid password');
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    console.log('[Auth] Password valid');

    // Generate token
    console.log('[Auth] Generating token...');
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    });
    console.log('[Auth] Token generated');

    // Skip lastLogin update for now - send response immediately
    // FirebaseService.update('users', user.id, { lastLogin: new Date().toISOString() });

    console.log('[Auth] Sending response immediately...');

    // Debug: Listen to response events
    res.on('finish', () => console.log('[Auth] Response FINISH event'));
    res.on('close', () => console.log('[Auth] Response CLOSE event'));

    const responseData = {
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    };

    console.log('[Auth] Response data size:', JSON.stringify(responseData).length);
    res.status(200).json(responseData);
    console.log('[Auth] res.json() called, headersSent:', res.headersSent);
    return;
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me - Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await FirebaseService.getById('users', req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get role-specific profile
    let profile = null;
    if (user.role === 'doctor') {
      profile = await FirebaseService.getById('doctors', req.user.id);
    } else if (user.role === 'receptionist') {
      profile = await FirebaseService.getById('receptionists', req.user.id);
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone
      },
      profile
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const user = await FirebaseService.getById('users', req.user.id);

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await FirebaseService.update('users', req.user.id, { password: hashedPassword });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
