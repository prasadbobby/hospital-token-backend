import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import FirebaseService from '../services/firebase.service.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/services - Get all services
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { active, mode } = req.query;

    let services = await FirebaseService.getAll('services');

    if (active !== undefined) {
      services = services.filter(s => s.active === (active === 'true'));
    }
    if (mode) {
      services = services.filter(s => s.mode?.toLowerCase() === mode.toLowerCase());
    }

    // Sort by name
    services.sort((a, b) => a.name?.localeCompare(b.name) || 0);

    res.json(services);
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// GET /api/services/:id - Get single service
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const service = await FirebaseService.getById('services', req.params.id);

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json(service);
  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({ error: 'Failed to fetch service' });
  }
});

// POST /api/services - Create new service (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, price, mode, cancellation, description } = req.body;

    if (!name || !price || !mode) {
      return res.status(400).json({ error: 'Name, price, and mode are required' });
    }

    const serviceId = uuidv4();
    const service = await FirebaseService.createWithId('services', serviceId, {
      name,
      price,
      mode,
      cancellation: cancellation || 0,
      description: description || '',
      active: true
    });

    res.status(201).json(service);
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

// PUT /api/services/:id - Update service (admin only)
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const existing = await FirebaseService.getById('services', id);
    if (!existing) {
      return res.status(404).json({ error: 'Service not found' });
    }

    delete updates.id;

    const service = await FirebaseService.update('services', id, updates);

    res.json(service);
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// PATCH /api/services/:id/toggle - Toggle service active status
router.patch('/:id/toggle', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await FirebaseService.getById('services', id);
    if (!existing) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const service = await FirebaseService.update('services', id, {
      active: !existing.active
    });

    res.json(service);
  } catch (error) {
    console.error('Toggle service error:', error);
    res.status(500).json({ error: 'Failed to toggle service status' });
  }
});

// DELETE /api/services/:id - Delete service (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await FirebaseService.delete('services', req.params.id);
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

export default router;
