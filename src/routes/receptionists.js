import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import FirebaseService from '../services/firebase.service.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/receptionists - Get all receptionists
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { active } = req.query;

    let receptionists = await FirebaseService.getAll('receptionists');

    if (active !== undefined) {
      receptionists = receptionists.filter(r => r.active === (active === 'true'));
    }

    // Sort by name
    receptionists.sort((a, b) => a.name?.localeCompare(b.name) || 0);

    res.json(receptionists);
  } catch (error) {
    console.error('Get receptionists error:', error);
    res.status(500).json({ error: 'Failed to fetch receptionists' });
  }
});

// GET /api/receptionists/:id - Get single receptionist
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const receptionist = await FirebaseService.getById('receptionists', req.params.id);

    if (!receptionist) {
      return res.status(404).json({ error: 'Receptionist not found' });
    }

    res.json(receptionist);
  } catch (error) {
    console.error('Get receptionist error:', error);
    res.status(500).json({ error: 'Failed to fetch receptionist' });
  }
});

// POST /api/receptionists - Create new receptionist (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, email, phone, shifts, assignedDoctors } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const receptionistId = uuidv4();
    const receptionist = await FirebaseService.createWithId('receptionists', receptionistId, {
      name,
      email,
      phone: phone || '',
      shifts: shifts || 'Mon-Fri 9am-5pm',
      assignedDoctors: assignedDoctors || [],
      active: true
    });

    res.status(201).json(receptionist);
  } catch (error) {
    console.error('Create receptionist error:', error);
    res.status(500).json({ error: 'Failed to create receptionist' });
  }
});

// PUT /api/receptionists/:id - Update receptionist
router.put('/:id', authenticate, authorize(['admin', 'receptionist']), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // If receptionist, can only update own profile (limited fields)
    if (req.user.role === 'receptionist' && req.user.id !== id) {
      return res.status(403).json({ error: 'Can only update own profile' });
    }

    const existing = await FirebaseService.getById('receptionists', id);
    if (!existing) {
      return res.status(404).json({ error: 'Receptionist not found' });
    }

    delete updates.id;
    delete updates.role; // Don't allow role change via this endpoint
    delete updates.password; // Don't allow password change via this endpoint

    // If shift is provided, also update shifts for backward compatibility
    if (updates.shift) {
      updates.shifts = updates.shift;
    }

    const receptionist = await FirebaseService.update('receptionists', id, updates);

    res.json(receptionist);
  } catch (error) {
    console.error('Update receptionist error:', error);
    res.status(500).json({ error: 'Failed to update receptionist' });
  }
});

// PATCH /api/receptionists/:id/toggle - Toggle active status (admin only)
router.patch('/:id/toggle', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await FirebaseService.getById('receptionists', id);
    if (!existing) {
      return res.status(404).json({ error: 'Receptionist not found' });
    }

    const receptionist = await FirebaseService.update('receptionists', id, {
      active: !existing.active
    });

    res.json(receptionist);
  } catch (error) {
    console.error('Toggle receptionist error:', error);
    res.status(500).json({ error: 'Failed to toggle receptionist status' });
  }
});

// PUT /api/receptionists/:id/assign - Assign doctors to receptionist
router.put('/:id/assign', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { doctorIds, doctorNames } = req.body;

    const receptionist = await FirebaseService.update('receptionists', id, {
      assignedDoctors: doctorNames || [],
      assignedDoctorIds: doctorIds || []
    });

    res.json(receptionist);
  } catch (error) {
    console.error('Assign doctors error:', error);
    res.status(500).json({ error: 'Failed to assign doctors' });
  }
});

// DELETE /api/receptionists/:id - Delete receptionist (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Delete receptionist profile
    await FirebaseService.delete('receptionists', id);

    // Also delete the corresponding user account
    try {
      await FirebaseService.delete('users', id);
    } catch (userError) {
      console.warn('Could not delete user account:', userError);
      // Continue even if user deletion fails
    }

    res.json({ message: 'Receptionist deleted successfully' });
  } catch (error) {
    console.error('Delete receptionist error:', error);
    res.status(500).json({ error: 'Failed to delete receptionist' });
  }
});

export default router;
