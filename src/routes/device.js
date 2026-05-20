import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import FirebaseService from '../services/firebase.service.js';

const router = Router();

// Helper to generate token number
const generateToken = async (department = 'GEN') => {
  const today = new Date().toISOString().split('T')[0];

  // Get today's count
  const appointments = await FirebaseService.getAll('appointments');
  const todayAppointments = appointments.filter(a => a.bookedOn === today);
  const count = todayAppointments.length + 1;

  return `T-${count.toString().padStart(3, '0')}`;
};

// POST /api/device/register - Register patient from device/kiosk
router.post('/register', async (req, res) => {
  try {
    const { name, age, mobile, department, doctor, doctorId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Patient name is required' });
    }

    const token = await generateToken(department);
    const appointmentId = uuidv4();

    const appointment = await FirebaseService.createWithId('appointments', appointmentId, {
      token,
      patient: name,
      age: age || 0,
      gender: 'M',
      phone: mobile || '',
      department: department || 'GEN',
      doctorId: doctorId || '',
      doctor: doctor || 'Dr. On Duty',
      specialty: department || 'General',
      visitType: 'clinic',
      slot: new Date().toTimeString().slice(0, 5),
      bookedOn: new Date().toISOString().split('T')[0],
      symptoms: [],
      status: 'waiting',
      payment: 'pending',
      amount: 500,
      source: 'device'
    });

    // Broadcast to connected clients
    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      broadcast('tokens', {
        type: 'patient_registered',
        appointment: { id: appointmentId, ...appointment }
      });
    }

    console.log(`[DEVICE] Patient registered: ${name} - ${token}`);

    res.status(201).json({
      success: true,
      token,
      appointment: { id: appointmentId, ...appointment },
      message: `Patient registered with token ${token}`
    });
  } catch (error) {
    console.error('Device register error:', error);
    res.status(500).json({ error: 'Failed to register patient' });
  }
});

// POST /api/device/next - Call next patient (from doctor's device)
router.post('/next', async (req, res) => {
  try {
    const { doctorId } = req.body;
    const today = new Date().toISOString().split('T')[0];

    let appointments = await FirebaseService.getAll('appointments');

    // Mark current in-consult as done
    const currentInConsult = appointments.find(a =>
      a.bookedOn === today &&
      a.status === 'in-consult' &&
      (!doctorId || a.doctorId === doctorId)
    );

    if (currentInConsult) {
      await FirebaseService.update('appointments', currentInConsult.id, { status: 'done' });
    }

    // Get next waiting patient
    const waiting = appointments
      .filter(a =>
        a.bookedOn === today &&
        a.status === 'waiting' &&
        (!doctorId || a.doctorId === doctorId)
      )
      .sort((a, b) => a.slot?.localeCompare(b.slot) || 0);

    if (waiting.length === 0) {
      return res.json({
        success: false,
        token: 'NO TOKEN',
        patient: '',
        message: 'No more patients in queue'
      });
    }

    const next = waiting[0];

    // Update status to in-consult
    await FirebaseService.update('appointments', next.id, { status: 'in-consult' });

    // Broadcast to connected clients
    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      broadcast('tokens', {
        type: 'next_patient',
        current: {
          token: next.token,
          patient: next.patient,
          doctor: next.doctor,
          departmentId: next.departmentId || '',
          department: next.department || ''
        }
      });
    }

    console.log(`[DEVICE] Next patient called: ${next.patient} - ${next.token}`);

    res.json({
      success: true,
      token: next.token,
      patient: next.patient,
      doctor: next.doctor,
      id: next.id,
      message: 'Next patient called'
    });
  } catch (error) {
    console.error('Device next error:', error);
    res.status(500).json({ error: 'Failed to call next patient' });
  }
});

// GET /api/device/current - Get current serving token
router.get('/current', async (req, res) => {
  try {
    const { doctorId } = req.query;
    const today = new Date().toISOString().split('T')[0];

    let appointments = await FirebaseService.getAll('appointments');

    // Find in-consult appointment
    let current = appointments.find(a =>
      a.bookedOn === today &&
      a.status === 'in-consult' &&
      (!doctorId || a.doctorId === doctorId)
    );

    if (!current) {
      return res.json({
        token: 'NO TOKEN',
        patient: '',
        doctor: ''
      });
    }

    res.json({
      token: current.token,
      patient: current.patient,
      doctor: current.doctor,
      id: current.id
    });
  } catch (error) {
    console.error('Device current error:', error);
    res.status(500).json({ error: 'Failed to get current token' });
  }
});

// GET /api/device/queue - Get waiting queue
router.get('/queue', async (req, res) => {
  try {
    const { doctorId, limit } = req.query;
    const today = new Date().toISOString().split('T')[0];

    let appointments = await FirebaseService.getAll('appointments');

    // Filter to today's waiting appointments
    let queue = appointments
      .filter(a =>
        a.bookedOn === today &&
        a.status === 'waiting' &&
        (!doctorId || a.doctorId === doctorId)
      )
      .sort((a, b) => a.slot?.localeCompare(b.slot) || 0);

    if (limit) {
      queue = queue.slice(0, parseInt(limit));
    }

    // Map to simpler format for devices
    const result = queue.map((a, i) => ({
      token: a.token,
      patient: a.patient,
      doctor: a.doctor,
      position: i + 1,
      waitMin: (i + 1) * 10
    }));

    res.json(result);
  } catch (error) {
    console.error('Device queue error:', error);
    res.status(500).json({ error: 'Failed to get queue' });
  }
});

// GET /api/device/display - Get data for display board
router.get('/display', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    let appointments = await FirebaseService.getAll('appointments');

    // Current patient being served
    const current = appointments.find(a =>
      a.bookedOn === today && a.status === 'in-consult'
    );

    // Waiting patients
    const waiting = appointments
      .filter(a => a.bookedOn === today && a.status === 'waiting')
      .sort((a, b) => a.slot?.localeCompare(b.slot) || 0)
      .slice(0, 10)
      .map((a, i) => ({
        token: a.token,
        patient: a.patient,
        doctor: a.doctor
      }));

    res.json({
      current: current ? {
        token: current.token,
        patient: current.patient,
        doctor: current.doctor
      } : { token: 'NO TOKEN', patient: '', doctor: '' },
      waiting,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Device display error:', error);
    res.status(500).json({ error: 'Failed to get display data' });
  }
});

// POST /api/device/skip - Skip current patient
router.post('/skip', async (req, res) => {
  try {
    const { appointmentId, reason } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ error: 'Appointment ID is required' });
    }

    // Update status back to waiting
    await FirebaseService.update('appointments', appointmentId, {
      status: 'waiting',
      skipped: true,
      skipReason: reason || 'Patient not present'
    });

    // Broadcast
    const broadcast = req.app.get('broadcast');
    if (broadcast) {
      broadcast('tokens', { type: 'patient_skipped', appointmentId });
    }

    res.json({ success: true, message: 'Patient skipped' });
  } catch (error) {
    console.error('Device skip error:', error);
    res.status(500).json({ error: 'Failed to skip patient' });
  }
});

// GET /api/device/health - Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'device-api'
  });
});

export default router;
