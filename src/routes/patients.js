import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import FirebaseService from '../services/firebase.service.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/patients - Get all patients
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { search } = req.query;

    let patients = await FirebaseService.getAll('patients');

    if (search) {
      const searchLower = search.toLowerCase();
      patients = patients.filter(p =>
        p.name?.toLowerCase().includes(searchLower) ||
        p.phone?.includes(search) ||
        p.uhid?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by name
    patients.sort((a, b) => a.name?.localeCompare(b.name) || 0);

    res.json(patients);
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// GET /api/patients/:id - Get single patient
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const patient = await FirebaseService.getById('patients', req.params.id);

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Get patient's appointment history
    const appointments = await FirebaseService.getByField('appointments', 'patientId', req.params.id);

    res.json({ ...patient, appointments });
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
});

// GET /api/patients/search/:query - Search patients
router.get('/search/:query', optionalAuth, async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();

    let patients = await FirebaseService.getAll('patients');

    patients = patients.filter(p =>
      p.name?.toLowerCase().includes(query) ||
      p.phone?.includes(query) ||
      p.uhid?.toLowerCase().includes(query) ||
      p.email?.toLowerCase().includes(query)
    );

    res.json(patients.slice(0, 10)); // Limit to 10 results
  } catch (error) {
    console.error('Search patients error:', error);
    res.status(500).json({ error: 'Failed to search patients' });
  }
});

// POST /api/patients - Create new patient
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { name, phone, email, age, gender, address, bloodGroup } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    // Check if patient with phone exists
    const existing = await FirebaseService.getByField('patients', 'phone', phone);
    if (existing.length > 0) {
      return res.status(400).json({
        error: 'Patient with this phone number already exists',
        patient: existing[0]
      });
    }

    // Generate UHID
    const patients = await FirebaseService.getAll('patients');
    const uhid = `UHID-${(patients.length + 1).toString().padStart(6, '0')}`;

    const patientId = uuidv4();
    const patient = await FirebaseService.createWithId('patients', patientId, {
      uhid,
      name,
      phone,
      email: email || '',
      age: age || 0,
      gender: gender || 'M',
      address: address || '',
      bloodGroup: bloodGroup || '',
      visits: 0
    });

    res.status(201).json(patient);
  } catch (error) {
    console.error('Create patient error:', error);
    res.status(500).json({ error: 'Failed to create patient' });
  }
});

// PUT /api/patients/:id - Update patient
router.put('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const existing = await FirebaseService.getById('patients', id);
    if (!existing) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Don't allow updating UHID
    delete updates.uhid;
    delete updates.id;

    const patient = await FirebaseService.update('patients', id, updates);

    res.json(patient);
  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

// DELETE /api/patients/:id - Delete patient (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await FirebaseService.delete('patients', req.params.id);
    res.json({ message: 'Patient deleted successfully' });
  } catch (error) {
    console.error('Delete patient error:', error);
    res.status(500).json({ error: 'Failed to delete patient' });
  }
});

export default router;
