import { Router } from 'express';
import FirebaseService from '../services/firebase.service.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/search - Unified search across patients, appointments, and doctors
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.json({ patients: [], appointments: [], doctors: [] });
    }

    const query = q.toLowerCase();
    const maxResults = Math.min(parseInt(limit) || 10, 20);

    // Search in parallel
    const [patients, appointments, doctors] = await Promise.all([
      FirebaseService.getAll('patients'),
      FirebaseService.getAll('appointments'),
      FirebaseService.getAll('doctors'),
    ]);

    // Filter patients
    const matchedPatients = patients
      .filter(p =>
        p.name?.toLowerCase().includes(query) ||
        p.phone?.includes(q) ||
        p.uhid?.toLowerCase().includes(query) ||
        p.email?.toLowerCase().includes(query)
      )
      .slice(0, maxResults)
      .map(p => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        uhid: p.uhid,
        age: p.age,
        gender: p.gender,
      }));

    // Filter appointments (today and recent)
    const today = new Date().toISOString().split('T')[0];
    const matchedAppointments = appointments
      .filter(a =>
        a.patient?.toLowerCase().includes(query) ||
        a.token?.toLowerCase().includes(query) ||
        a.phone?.includes(q)
      )
      .sort((a, b) => {
        // Prioritize today's appointments
        if (a.bookedOn === today && b.bookedOn !== today) return -1;
        if (b.bookedOn === today && a.bookedOn !== today) return 1;
        return b.bookedOn?.localeCompare(a.bookedOn) || 0;
      })
      .slice(0, maxResults)
      .map(a => ({
        id: a.id,
        patient: a.patient,
        token: a.token,
        doctor: a.doctor,
        specialty: a.specialty,
        status: a.status,
        bookedOn: a.bookedOn,
        slot: a.slot,
        visitType: a.visitType,
      }));

    // Filter doctors
    const matchedDoctors = doctors
      .filter(d =>
        d.name?.toLowerCase().includes(query) ||
        d.specialty?.toLowerCase().includes(query) ||
        d.email?.toLowerCase().includes(query)
      )
      .slice(0, maxResults)
      .map(d => ({
        id: d.id,
        name: d.name,
        specialty: d.specialty,
        active: d.active,
        availabilityStatus: d.availabilityStatus,
      }));

    res.json({
      patients: matchedPatients,
      appointments: matchedAppointments,
      doctors: matchedDoctors,
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
