import express from 'express';
import FirebaseService from '../services/firebase.service.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// GET /api/settings - Get application settings (public)
router.get('/', async (req, res) => {
  try {
    const settings = await FirebaseService.getSettings();

    // Return default settings if none exist
    const defaultSettings = {
      appName: 'Pulse OPD',
      appSubtitle: 'Hospital Token Management',
      hospitalName: '',
      hospitalAddress: '',
      hospitalPhone: '',
      hospitalEmail: '',
      ...settings
    };

    res.json(defaultSettings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/settings - Update application settings (admin only)
router.patch('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const updates = req.body;

    // Validate required fields
    if (updates.appName && updates.appName.trim().length === 0) {
      return res.status(400).json({ error: 'App name cannot be empty' });
    }

    const updatedSettings = await FirebaseService.updateSettings(updates);

    res.json({
      message: 'Settings updated successfully',
      settings: updatedSettings
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
