import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import FirebaseService from '../services/firebase.service.js';
import { generateToken, authenticate } from '../middleware/auth.js';
import EmailService from '../services/email.service.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, phone, specialty, shift, experience, qualifications, sendActivationEmail = false } = req.body;

    // Validate required fields
    if (!email || !name || !role) {
      return res.status(400).json({ error: 'Email, name, and role are required' });
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

    // For admin role, password is required
    if (role === 'admin' && !password) {
      return res.status(400).json({ error: 'Password is required for admin accounts' });
    }

    // Create user
    const userId = uuidv4();
    let hashedPassword = null;
    let activationToken = null;
    let activationTokenExpiry = null;
    let activated = true; // Default to activated

    // If password provided, hash it and account is activated
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
      activated = true;
    } else {
      // No password - generate activation token
      activationToken = crypto.randomBytes(32).toString('hex');
      activationTokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours
      activated = false;
    }

    const user = await FirebaseService.createWithId('users', userId, {
      email: email.toLowerCase(),
      password: hashedPassword || 'PENDING_ACTIVATION',
      name,
      role,
      phone: phone || '',
      specialty: specialty || '',
      active: true,
      activated,
      activationToken,
      activationTokenExpiry,
      createdAt: new Date().toISOString()
    });

    // If doctor, create doctor profile
    if (role === 'doctor') {
      await FirebaseService.createWithId('doctors', userId, {
        userId,
        name,
        email: email.toLowerCase(),
        specialty: specialty || 'General Medicine',
        phone: phone || '',
        experience: parseInt(experience) || 0,
        qualifications: qualifications || '',
        rating: 0,
        reviewsCount: 0,
        todayPatients: 0,
        avgWait: 0,
        revenue: 0,
        tokenLimit: 40,
        slotDuration: 15,
        active: true,
        activated
      });
    }

    // If receptionist, create receptionist profile
    if (role === 'receptionist') {
      await FirebaseService.createWithId('receptionists', userId, {
        userId,
        name,
        email: email.toLowerCase(),
        phone: phone || '',
        shift: shift || 'Morning',
        shifts: shift || 'Mon-Fri 9am-5pm',
        assignedDoctors: [],
        active: true,
        activated
      });
    }

    // Send activation email if token was generated
    if (activationToken && (role === 'doctor' || role === 'receptionist')) {
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
        await EmailService.sendActivationEmail(
          email.toLowerCase(),
          name,
          role,
          activationToken,
          frontendUrl
        );
        console.log(`Activation email sent to ${email}`);
      } catch (emailError) {
        console.error('Failed to send activation email:', emailError);
        // Don't fail the registration if email fails
      }
    }

    // Generate token only if activated
    const token = activated ? generateToken({ id: userId, email: user.email, role, name }) : null;

    const responseMessage = activated
      ? 'User registered successfully'
      : 'User created successfully. Activation email sent.';

    res.status(201).json({
      message: responseMessage,
      token,
      user: {
        id: userId,
        email: user.email,
        name,
        role,
        activated
      },
      requiresActivation: !activated
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

    // Check if account is activated
    if (user.activated === false) {
      console.log('[Auth] Account not activated');
      return res.status(401).json({ error: 'Account not activated. Please check your email for activation instructions.' });
    }

    // Verify password
    console.log('[Auth] Verifying password...');
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('[Auth] Invalid password');
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    console.log('[Auth] Password valid');

    // Fetch permissions for receptionists
    let permissions = undefined;
    if (user.role === 'receptionist') {
      console.log('[Auth] Fetching receptionist permissions for user:', user.id, user.email);
      const receptionist = await FirebaseService.getById('receptionists', user.id);
      console.log('[Auth] Receptionist data:', receptionist);
      if (receptionist?.permissions) {
        permissions = receptionist.permissions;
        console.log('[Auth] Receptionist permissions loaded:', permissions);
      } else {
        console.log('[Auth] NO PERMISSIONS FOUND for receptionist');
      }
    }

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
        role: user.role,
        ...(permissions && { permissions })
      }
    };

    console.log('[Auth] ==========================================');
    console.log('[Auth] FINAL RESPONSE DATA:', JSON.stringify(responseData, null, 2));
    console.log('[Auth] ==========================================');
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
    let permissions = undefined;
    if (user.role === 'doctor') {
      profile = await FirebaseService.getById('doctors', req.user.id);
    } else if (user.role === 'receptionist') {
      profile = await FirebaseService.getById('receptionists', req.user.id);
      if (profile?.permissions) {
        permissions = profile.permissions;
      }
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        ...(permissions && { permissions })
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

// POST /api/auth/setup-password - Activate account with password
router.post('/setup-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Activation token and password are required' });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Find user by activation token
    const allUsers = await FirebaseService.getAll('users');
    const user = allUsers.find(u => u.activationToken === token);

    if (!user) {
      return res.status(404).json({ error: 'Invalid activation token' });
    }

    // Check if token has expired
    if (user.activationTokenExpiry && new Date(user.activationTokenExpiry) < new Date()) {
      return res.status(400).json({ error: 'Activation token has expired. Please contact your administrator.' });
    }

    // Check if already activated
    if (user.activated) {
      return res.status(400).json({ error: 'Account is already activated' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user - activate account and set password
    await FirebaseService.update('users', user.id, {
      password: hashedPassword,
      activated: true,
      activationToken: null,
      activationTokenExpiry: null,
      activatedAt: new Date().toISOString()
    });

    // Update corresponding doctor or receptionist profile
    if (user.role === 'doctor') {
      const doctor = await FirebaseService.getById('doctors', user.id);
      if (doctor) {
        await FirebaseService.update('doctors', user.id, { activated: true });
      }
    } else if (user.role === 'receptionist') {
      const receptionist = await FirebaseService.getById('receptionists', user.id);
      if (receptionist) {
        await FirebaseService.update('receptionists', user.id, { activated: true });
      }
    }

    // Generate JWT token for auto-login
    const jwtToken = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    });

    res.json({
      message: 'Account activated successfully',
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Setup password error:', error);
    res.status(500).json({ error: 'Failed to activate account' });
  }
});

// GET /api/auth/verify-activation-token - Verify activation token validity
router.get('/verify-activation-token', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Activation token is required' });
    }

    // Find user by activation token
    const allUsers = await FirebaseService.getAll('users');
    const user = allUsers.find(u => u.activationToken === token);

    if (!user) {
      return res.status(404).json({ error: 'Invalid activation token', valid: false });
    }

    // Check if token has expired
    if (user.activationTokenExpiry && new Date(user.activationTokenExpiry) < new Date()) {
      return res.status(400).json({ error: 'Activation token has expired', valid: false });
    }

    // Check if already activated
    if (user.activated) {
      return res.status(400).json({ error: 'Account is already activated', valid: false });
    }

    res.json({
      valid: true,
      user: {
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Verify activation token error:', error);
    res.status(500).json({ error: 'Failed to verify token', valid: false });
  }
});

// POST /api/auth/resend-activation - Resend activation email
router.post('/resend-activation', authenticate, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Get user
    const user = await FirebaseService.getById('users', userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already activated
    if (user.activated) {
      return res.status(400).json({ error: 'Account is already activated' });
    }

    // Only allow for doctors and receptionists
    if (user.role !== 'doctor' && user.role !== 'receptionist') {
      return res.status(400).json({ error: 'Activation emails are only for doctors and receptionists' });
    }

    // Generate new activation token
    const activationToken = crypto.randomBytes(32).toString('hex');
    const activationTokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours

    // Update user with new token
    await FirebaseService.update('users', userId, {
      activationToken,
      activationTokenExpiry
    });

    // Send activation email
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
      await EmailService.sendActivationEmail(
        user.email,
        user.name,
        user.role,
        activationToken,
        frontendUrl
      );
      console.log(`Activation email resent to ${user.email}`);
    } catch (emailError) {
      console.error('Failed to send activation email:', emailError);
      return res.status(500).json({ error: 'Failed to send activation email' });
    }

    res.json({
      message: 'Activation email sent successfully',
      email: user.email
    });
  } catch (error) {
    console.error('Resend activation error:', error);
    res.status(500).json({ error: 'Failed to resend activation email' });
  }
});

export default router;
