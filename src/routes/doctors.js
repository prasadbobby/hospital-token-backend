import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import FirebaseService from '../services/firebase.service.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/doctors - Get all doctors
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { specialty, active } = req.query;

    let doctors = await FirebaseService.getAll('doctors');

    // Apply filters
    if (specialty) {
      doctors = doctors.filter(d => d.specialty === specialty);
    }
    if (active !== undefined) {
      doctors = doctors.filter(d => d.active === (active === 'true'));
    }

    // Sort by name
    doctors.sort((a, b) => a.name?.localeCompare(b.name) || 0);

    res.json(doctors);
  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

// GET /api/doctors/:id - Get single doctor
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const doctor = await FirebaseService.getById('doctors', req.params.id);

    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    res.json(doctor);
  } catch (error) {
    console.error('Get doctor error:', error);
    res.status(500).json({ error: 'Failed to fetch doctor' });
  }
});

// POST /api/doctors - Create new doctor (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const {
      name, email, specialty, phone, experience,
      qualifications, awards, clinicDetails,
      tokenLimit, slotDuration
    } = req.body;

    if (!name || !specialty) {
      return res.status(400).json({ error: 'Name and specialty are required' });
    }

    const doctorId = uuidv4();
    const doctor = await FirebaseService.createWithId('doctors', doctorId, {
      name,
      email: email || '',
      specialty,
      phone: phone || '',
      experience: experience || 0,
      qualifications: qualifications || [],
      awards: awards || [],
      clinicDetails: clinicDetails || {},
      rating: 0,
      reviewsCount: 0,
      todayPatients: 0,
      avgWait: 0,
      revenue: 0,
      tokenLimit: tokenLimit || 40,
      slotDuration: slotDuration || 15,
      active: true
    });

    res.status(201).json(doctor);
  } catch (error) {
    console.error('Create doctor error:', error);
    res.status(500).json({ error: 'Failed to create doctor' });
  }
});

// PUT /api/doctors/:id - Update doctor
router.put('/:id', authenticate, authorize('admin', 'doctor'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // If doctor, can only update own profile
    if (req.user.role === 'doctor' && req.user.id !== id) {
      return res.status(403).json({ error: 'Can only update own profile' });
    }

    const existing = await FirebaseService.getById('doctors', id);
    if (!existing) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Don't allow updating certain fields
    delete updates.id;
    delete updates.rating;
    delete updates.reviewsCount;

    const doctor = await FirebaseService.update('doctors', id, updates);

    res.json(doctor);
  } catch (error) {
    console.error('Update doctor error:', error);
    res.status(500).json({ error: 'Failed to update doctor' });
  }
});

// GET /api/doctors/:id/schedule - Get doctor's schedule settings
router.get('/:id/schedule', optionalAuth, async (req, res) => {
  try {
    const schedule = await FirebaseService.getById('schedules', req.params.id);

    if (!schedule) {
      // Return default schedule
      return res.json({
        doctorId: req.params.id,
        tokenLimit: 40,
        slotDuration: 15,
        weeklySchedule: {
          Mon: { start: '10:00', end: '18:00', active: true },
          Tue: { start: '10:00', end: '18:00', active: true },
          Wed: { start: '10:00', end: '18:00', active: true },
          Thu: { start: '10:00', end: '18:00', active: true },
          Fri: { start: '10:00', end: '18:00', active: true },
          Sat: { start: '10:00', end: '18:00', active: true },
          Sun: { start: '10:00', end: '18:00', active: false }
        }
      });
    }

    res.json(schedule);
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// PUT /api/doctors/:id/schedule - Update doctor's schedule
router.put('/:id/schedule', authenticate, authorize('admin', 'doctor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { tokenLimit, slotDuration, weeklySchedule } = req.body;

    // If doctor, can only update own schedule
    if (req.user.role === 'doctor' && req.user.id !== id) {
      return res.status(403).json({ error: 'Can only update own schedule' });
    }

    const schedule = await FirebaseService.createWithId('schedules', id, {
      doctorId: id,
      tokenLimit: tokenLimit || 40,
      slotDuration: slotDuration || 15,
      weeklySchedule: weeklySchedule || {}
    });

    // Also update doctor's tokenLimit and slotDuration
    await FirebaseService.update('doctors', id, {
      tokenLimit: tokenLimit || 40,
      slotDuration: slotDuration || 15
    });

    res.json(schedule);
  } catch (error) {
    console.error('Update schedule error:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// GET /api/doctors/:id/availability - Get doctor's availability for next 21 days
router.get('/:id/availability', optionalAuth, async (req, res) => {
  try {
    let availability = await FirebaseService.getByField('availability', 'doctorId', req.params.id);

    // Generate dates for next 21 days if no availability set
    if (availability.length === 0) {
      const dates = [];
      for (let i = 0; i < 21; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const dayOfWeek = date.getDay();

        dates.push({
          date: dateStr,
          dayOfWeek,
          clinic: dayOfWeek !== 0,
          home: dayOfWeek !== 0 && dayOfWeek !== 6,
          video: true,
          slots: []
        });
      }
      return res.json(dates);
    }

    res.json(availability);
  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// PUT /api/doctors/:id/availability - Update doctor's availability
router.put('/:id/availability', authenticate, authorize('admin', 'doctor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { date, clinic, home, video, slots } = req.body;

    // If doctor, can only update own availability
    if (req.user.role === 'doctor' && req.user.id !== id) {
      return res.status(403).json({ error: 'Can only update own availability' });
    }

    const availabilityId = `${id}-${date}`;
    const availability = await FirebaseService.createWithId('availability', availabilityId, {
      doctorId: id,
      date,
      clinic: clinic !== undefined ? clinic : true,
      home: home !== undefined ? home : true,
      video: video !== undefined ? video : true,
      slots: slots || []
    });

    res.json(availability);
  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

// GET /api/doctors/:id/slots - Get available slots for a date
router.get('/:id/slots', optionalAuth, async (req, res) => {
  try {
    const { date, visitType } = req.query;
    const doctorId = req.params.id;

    // Get doctor's schedule
    const doctor = await FirebaseService.getById('doctors', doctorId);
    const schedule = await FirebaseService.getById('schedules', doctorId);

    const tokenLimit = schedule?.tokenLimit || doctor?.tokenLimit || 40;
    const slotDuration = schedule?.slotDuration || doctor?.slotDuration || 15;

    // Get existing appointments for this date
    const appointments = await FirebaseService.getAll('appointments');
    const bookedSlots = appointments
      .filter(a => a.doctorId === doctorId && a.bookedOn === date && a.status !== 'cancelled')
      .map(a => a.slot);

    // Generate available slots
    const slots = [];
    const startHour = 10; // 10 AM
    const endHour = 18; // 6 PM

    for (let hour = startHour; hour < endHour; hour++) {
      for (let min = 0; min < 60; min += slotDuration) {
        if (slots.length >= tokenLimit) break;

        const slot = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        const isBooked = bookedSlots.includes(slot);

        slots.push({
          time: slot,
          available: !isBooked,
          token: `T-${(slots.length + 1).toString().padStart(3, '0')}`
        });
      }
    }

    res.json(slots);
  } catch (error) {
    console.error('Get slots error:', error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
});

// DELETE /api/doctors/:id - Delete doctor (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await FirebaseService.delete('doctors', req.params.id);
    res.json({ message: 'Doctor deleted successfully' });
  } catch (error) {
    console.error('Delete doctor error:', error);
    res.status(500).json({ error: 'Failed to delete doctor' });
  }
});

export default router;
