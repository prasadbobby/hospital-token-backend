import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import FirebaseService from '../services/firebase.service.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = Router();

// Helper to generate token number
const generateToken = async (department = 'GEN') => {
  const today = new Date().toISOString().split('T')[0];
  const key = `${department}-${today}`;

  // Get today's count for this department
  const appointments = await FirebaseService.getAll('appointments');
  const todayAppointments = appointments.filter(a =>
    a.bookedOn === today && (a.department === department || !a.department)
  );

  const count = todayAppointments.length + 1;
  return `T-${count.toString().padStart(3, '0')}`;
};

// GET /api/appointments - Get all appointments
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { status, visitType, doctor, date, search } = req.query;

    let appointments = await FirebaseService.getAll('appointments');

    // Apply filters
    if (status) {
      appointments = appointments.filter(a => a.status === status);
    }
    if (visitType) {
      appointments = appointments.filter(a => a.visitType === visitType);
    }
    if (doctor) {
      appointments = appointments.filter(a => a.doctorId === doctor || a.doctor === doctor);
    }
    if (date) {
      appointments = appointments.filter(a => a.bookedOn === date);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      appointments = appointments.filter(a =>
        a.patient?.toLowerCase().includes(searchLower) ||
        a.token?.toLowerCase().includes(searchLower) ||
        a.phone?.includes(search)
      );
    }

    // Sort by slot time
    appointments.sort((a, b) => {
      if (a.bookedOn !== b.bookedOn) {
        return b.bookedOn.localeCompare(a.bookedOn);
      }
      return a.slot?.localeCompare(b.slot) || 0;
    });

    res.json(appointments);
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// GET /api/appointments/today - Get today's appointments
router.get('/today', optionalAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const appointments = await FirebaseService.getAll('appointments');

    const todayAppointments = appointments.filter(a => a.bookedOn === today);

    // Sort by slot time
    todayAppointments.sort((a, b) => a.slot?.localeCompare(b.slot) || 0);

    res.json(todayAppointments);
  } catch (error) {
    console.error('Get today appointments error:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// GET /api/appointments/:id - Get single appointment
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const appointment = await FirebaseService.getById('appointments', req.params.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json(appointment);
  } catch (error) {
    console.error('Get appointment error:', error);
    res.status(500).json({ error: 'Failed to fetch appointment' });
  }
});

// POST /api/appointments - Create new appointment
router.post('/', optionalAuth, async (req, res) => {
  try {
    const {
      patient, age, gender, phone, email,
      doctorId, doctor, specialty,
      visitType, slot, bookedOn,
      symptoms, notes, amount
    } = req.body;

    // Validate required fields
    if (!patient || !doctor || !slot) {
      return res.status(400).json({ error: 'Patient name, doctor, and slot are required' });
    }

    // Generate token
    const token = await generateToken();

    const appointmentId = uuidv4();
    const appointment = await FirebaseService.createWithId('appointments', appointmentId, {
      token,
      patient,
      age: age || 0,
      gender: gender || 'M',
      phone: phone || '',
      email: email || '',
      doctorId: doctorId || '',
      doctor,
      specialty: specialty || '',
      visitType: visitType || 'clinic',
      slot,
      bookedOn: bookedOn || new Date().toISOString().split('T')[0],
      symptoms: symptoms || [],
      notes: notes || '',
      status: 'waiting',
      payment: 'pending',
      amount: amount || 500,
      position: 0,
      waitMin: 0
    });

    // Update doctor's today patients count
    if (doctorId) {
      await FirebaseService.increment('doctors', doctorId, 'todayPatients', 1);
    }

    res.status(201).json(appointment);
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// PUT /api/appointments/:id - Update appointment
router.put('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const existing = await FirebaseService.getById('appointments', id);
    if (!existing) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Don't allow updating token
    delete updates.token;
    delete updates.id;

    const appointment = await FirebaseService.update('appointments', id, updates);

    res.json(appointment);
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// PATCH /api/appointments/:id/status - Update appointment status
router.patch('/:id/status', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['waiting', 'in-consult', 'done', 'cancelled', 'scheduled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const appointment = await FirebaseService.update('appointments', id, { status });

    res.json(appointment);
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// DELETE /api/appointments/:id - Delete appointment
router.delete('/:id', authenticate, authorize('admin', 'receptionist'), async (req, res) => {
  try {
    await FirebaseService.delete('appointments', req.params.id);
    res.json({ message: 'Appointment deleted successfully' });
  } catch (error) {
    console.error('Delete appointment error:', error);
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
});

export default router;
