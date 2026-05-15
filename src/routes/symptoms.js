import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import FirebaseService from '../services/firebase.service.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/symptoms - Get all symptoms
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, search } = req.query;

    let symptoms = await FirebaseService.getAll('symptoms');

    if (category) {
      symptoms = symptoms.filter(s => s.category === category);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      symptoms = symptoms.filter(s => s.name?.toLowerCase().includes(searchLower));
    }

    // Sort by searches (popularity)
    symptoms.sort((a, b) => (b.searches || 0) - (a.searches || 0));

    res.json(symptoms);
  } catch (error) {
    console.error('Get symptoms error:', error);
    res.status(500).json({ error: 'Failed to fetch symptoms' });
  }
});

// GET /api/symptoms/categories - Get all categories
router.get('/categories', optionalAuth, async (req, res) => {
  try {
    const symptoms = await FirebaseService.getAll('symptoms');
    const categories = [...new Set(symptoms.map(s => s.category).filter(Boolean))];
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/symptoms/:id - Get single symptom
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const symptom = await FirebaseService.getById('symptoms', req.params.id);

    if (!symptom) {
      return res.status(404).json({ error: 'Symptom not found' });
    }

    res.json(symptom);
  } catch (error) {
    console.error('Get symptom error:', error);
    res.status(500).json({ error: 'Failed to fetch symptom' });
  }
});

// POST /api/symptoms - Create new symptom (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, category, relatedSpecialties } = req.body;

    if (!name || !category) {
      return res.status(400).json({ error: 'Name and category are required' });
    }

    const symptomId = uuidv4();
    const symptom = await FirebaseService.createWithId('symptoms', symptomId, {
      name,
      category,
      relatedSpecialties: relatedSpecialties || [],
      searches: 0,
      trend: 'flat'
    });

    res.status(201).json(symptom);
  } catch (error) {
    console.error('Create symptom error:', error);
    res.status(500).json({ error: 'Failed to create symptom' });
  }
});

// PUT /api/symptoms/:id - Update symptom (admin only)
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const existing = await FirebaseService.getById('symptoms', id);
    if (!existing) {
      return res.status(404).json({ error: 'Symptom not found' });
    }

    delete updates.id;

    const symptom = await FirebaseService.update('symptoms', id, updates);

    res.json(symptom);
  } catch (error) {
    console.error('Update symptom error:', error);
    res.status(500).json({ error: 'Failed to update symptom' });
  }
});

// POST /api/symptoms/:id/increment - Increment search count
router.post('/:id/increment', optionalAuth, async (req, res) => {
  try {
    const newCount = await FirebaseService.increment('symptoms', req.params.id, 'searches', 1);
    res.json({ searches: newCount });
  } catch (error) {
    console.error('Increment symptom error:', error);
    res.status(500).json({ error: 'Failed to increment searches' });
  }
});

// DELETE /api/symptoms/:id - Delete symptom (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await FirebaseService.delete('symptoms', req.params.id);
    res.json({ message: 'Symptom deleted successfully' });
  } catch (error) {
    console.error('Delete symptom error:', error);
    res.status(500).json({ error: 'Failed to delete symptom' });
  }
});

export default router;
