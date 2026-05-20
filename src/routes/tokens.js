import { Router } from 'express';
import FirebaseService from '../services/firebase.service.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/tokens/queue - Get current token queue
router.get('/queue', optionalAuth, async (req, res) => {
  try {
    const { doctorId, departmentId } = req.query;
    const today = new Date().toISOString().split('T')[0];

    let appointments = await FirebaseService.getAll('appointments');

    // Filter to today's waiting appointments (exclude on-hold)
    appointments = appointments.filter(a =>
      a.bookedOn === today &&
      (a.status === 'waiting' || a.status === 'in-consult')
    );

    // Filter by doctor if specified
    if (doctorId) {
      appointments = appointments.filter(a => a.doctorId === doctorId);
    }

    // Filter by department if specified
    if (departmentId) {
      appointments = appointments.filter(a => a.departmentId === departmentId);
    }

    // Sort: priority patients first, then by slot time
    appointments.sort((a, b) => {
      if (a.priority && !b.priority) return -1;
      if (!a.priority && b.priority) return 1;
      return a.slot?.localeCompare(b.slot) || 0;
    });

    // Add position and wait time
    const queue = appointments.map((a, i) => ({
      ...a,
      position: i + 1,
      waitMin: i * 10 // Estimated wait time
    }));

    res.json(queue);
  } catch (error) {
    console.error('Get queue error:', error);
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

// GET /api/tokens/current - Get current serving token
router.get('/current', optionalAuth, async (req, res) => {
  try {
    const { doctorId, departmentId } = req.query;
    const today = new Date().toISOString().split('T')[0];

    let appointments = await FirebaseService.getAll('appointments');

    // Find in-consult appointment
    let current = appointments.find(a =>
      a.bookedOn === today &&
      a.status === 'in-consult' &&
      (!doctorId || a.doctorId === doctorId) &&
      (!departmentId || a.departmentId === departmentId)
    );

    if (!current) {
      return res.json({ token: 'NO TOKEN', patient: '', doctor: '', departmentId: '' });
    }

    res.json({
      token: current.token,
      patient: current.patient,
      doctor: current.doctor,
      departmentId: current.departmentId || '',
      id: current.id
    });
  } catch (error) {
    console.error('Get current token error:', error);
    res.status(500).json({ error: 'Failed to fetch current token' });
  }
});

// POST /api/tokens/next - Call next patient
router.post('/next', optionalAuth, async (req, res) => {
  try {
    const { doctorId, departmentId } = req.body;
    const today = new Date().toISOString().split('T')[0];

    let appointments = await FirebaseService.getAll('appointments');

    // Mark current in-consult as done
    const currentInConsult = appointments.find(a =>
      a.bookedOn === today &&
      a.status === 'in-consult' &&
      (!doctorId || a.doctorId === doctorId) &&
      (!departmentId || a.departmentId === departmentId)
    );

    if (currentInConsult) {
      await FirebaseService.update('appointments', currentInConsult.id, { status: 'done' });
    }

    // Get next waiting patient
    const waiting = appointments
      .filter(a =>
        a.bookedOn === today &&
        a.status === 'waiting' &&
        (!doctorId || a.doctorId === doctorId) &&
        (!departmentId || a.departmentId === departmentId)
      )
      .sort((a, b) => a.slot?.localeCompare(b.slot) || 0);

    if (waiting.length === 0) {
      return res.json({ token: 'NO TOKEN', patient: '', message: 'No more patients in queue' });
    }

    const next = waiting[0];

    // Update status to in-consult
    await FirebaseService.update('appointments', next.id, { status: 'in-consult' });

    res.json({
      token: next.token,
      patient: next.patient,
      doctor: next.doctor,
      id: next.id,
      message: 'Next patient called'
    });
  } catch (error) {
    console.error('Call next error:', error);
    res.status(500).json({ error: 'Failed to call next patient' });
  }
});

// POST /api/tokens/skip - Skip current patient
router.post('/skip', optionalAuth, async (req, res) => {
  try {
    const { appointmentId, reason } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ error: 'Appointment ID is required' });
    }

    // Update status back to waiting with a later position
    await FirebaseService.update('appointments', appointmentId, {
      status: 'waiting',
      skipped: true,
      skipReason: reason || 'Patient not present'
    });

    res.json({ message: 'Patient skipped' });
  } catch (error) {
    console.error('Skip patient error:', error);
    res.status(500).json({ error: 'Failed to skip patient' });
  }
});

// POST /api/tokens/hold - Hold a patient (they stepped out)
router.post('/hold', optionalAuth, async (req, res) => {
  try {
    const { appointmentId, reason } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ error: 'Appointment ID is required' });
    }

    // Update status to on-hold
    await FirebaseService.update('appointments', appointmentId, {
      status: 'on-hold',
      onHold: true,
      holdReason: reason || 'Patient stepped out',
      heldAt: new Date().toISOString()
    });

    res.json({ message: 'Patient put on hold' });
  } catch (error) {
    console.error('Hold patient error:', error);
    res.status(500).json({ error: 'Failed to hold patient' });
  }
});

// POST /api/tokens/unhold - Unhold a patient (bring back to queue)
router.post('/unhold', optionalAuth, async (req, res) => {
  try {
    const { appointmentId } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ error: 'Appointment ID is required' });
    }

    // Update status back to waiting with priority slot
    await FirebaseService.update('appointments', appointmentId, {
      status: 'waiting',
      onHold: false,
      holdReason: null,
      heldAt: null,
      priority: true, // Mark as priority so they go to front of queue
      unheldAt: new Date().toISOString()
    });

    res.json({ message: 'Patient returned to queue' });
  } catch (error) {
    console.error('Unhold patient error:', error);
    res.status(500).json({ error: 'Failed to unhold patient' });
  }
});

// POST /api/tokens/extra - Generate extra token
router.post('/extra', optionalAuth, async (req, res) => {
  try {
    const { patient, doctorId, doctor, reason, departmentId, department } = req.body;

    if (!patient) {
      return res.status(400).json({ error: 'Patient name is required' });
    }

    const today = new Date().toISOString().split('T')[0];

    // Get department prefix
    let departmentPrefix = 'E'; // Default for extra tokens without department
    let deptName = department || '';

    if (departmentId) {
      try {
        const dept = await FirebaseService.getById('departments', departmentId);
        if (dept && dept.prefix) {
          departmentPrefix = `${dept.prefix}E`; // CARE, ORTE, etc.
          deptName = dept.name || deptName;
        }
      } catch (error) {
        console.warn('Could not fetch department, using default E prefix');
      }
    }

    // Get department-specific count for extra tokens
    const appointments = await FirebaseService.getAll('appointments');
    const departmentExtraCount = appointments.filter(a => {
      if (a.bookedOn !== today || !a.isExtra) return false;

      // Match by departmentPrefix or token prefix
      if (a.departmentPrefix === departmentPrefix) return true;
      if (a.token && a.token.startsWith(`${departmentPrefix}-`)) return true;

      return false;
    }).length;

    const token = `${departmentPrefix}-${(departmentExtraCount + 1).toString().padStart(3, '0')}`;

    const appointment = await FirebaseService.create('appointments', {
      token,
      patient,
      doctorId: doctorId || '',
      doctor: doctor || '',
      departmentId: departmentId || '',
      department: deptName,
      departmentPrefix,
      bookedOn: today,
      slot: new Date().toTimeString().slice(0, 5),
      status: 'waiting',
      visitType: 'clinic',
      isExtra: true,
      extraReason: reason || 'Walk-in patient',
      payment: 'pending',
      amount: 500
    });

    res.status(201).json(appointment);
  } catch (error) {
    console.error('Generate extra token error:', error);
    res.status(500).json({ error: 'Failed to generate extra token' });
  }
});

// GET /api/tokens/stats - Get queue statistics
router.get('/stats', optionalAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    let appointments = await FirebaseService.getAll('appointments');
    const todayAppointments = appointments.filter(a => a.bookedOn === today);

    const stats = {
      inQueue: todayAppointments.filter(a => a.status === 'waiting').length,
      inConsult: todayAppointments.filter(a => a.status === 'in-consult').length,
      done: todayAppointments.filter(a => a.status === 'done').length,
      cancelled: todayAppointments.filter(a => a.status === 'cancelled').length,
      total: todayAppointments.length,
      extraTokens: todayAppointments.filter(a => a.isExtra).length,
      avgWait: 11, // Calculate based on actual data
      countersOpen: 3 // This would come from counter management
    };

    res.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/tokens/held - Get patients on hold
router.get('/held', optionalAuth, async (req, res) => {
  try {
    const { doctorId, departmentId } = req.query;
    const today = new Date().toISOString().split('T')[0];

    let appointments = await FirebaseService.getAll('appointments');

    // Filter to today's on-hold appointments
    let held = appointments.filter(a =>
      a.bookedOn === today &&
      a.status === 'on-hold'
    );

    // Filter by doctor if specified
    if (doctorId) {
      held = held.filter(a => a.doctorId === doctorId);
    }

    // Filter by department if specified
    if (departmentId) {
      held = held.filter(a => a.departmentId === departmentId);
    }

    // Sort by hold time
    held.sort((a, b) => a.heldAt?.localeCompare(b.heldAt) || 0);

    res.json(held);
  } catch (error) {
    console.error('Get held patients error:', error);
    res.status(500).json({ error: 'Failed to fetch held patients' });
  }
});

// GET /api/tokens/display - Get data for display board
router.get('/display', async (req, res) => {
  try {
    const { departmentId } = req.query;
    const today = new Date().toISOString().split('T')[0];

    let appointments = await FirebaseService.getAll('appointments');

    // Filter by department if specified
    if (departmentId) {
      appointments = appointments.filter(a => a.departmentId === departmentId);
    }

    // Current patient being served
    const current = appointments.find(a =>
      a.bookedOn === today && a.status === 'in-consult'
    );

    // Waiting patients (exclude on-hold)
    const waiting = appointments
      .filter(a => a.bookedOn === today && a.status === 'waiting')
      .sort((a, b) => {
        if (a.priority && !b.priority) return -1;
        if (!a.priority && b.priority) return 1;
        return a.slot?.localeCompare(b.slot) || 0;
      })
      .slice(0, 10)
      .map((a, i) => ({
        token: a.token,
        patient: a.patient,
        doctor: a.doctor,
        departmentId: a.departmentId || '',
        waitMin: (i + 1) * 10,
        priority: a.priority || false
      }));

    res.json({
      current: current ? {
        token: current.token,
        patient: current.patient,
        doctor: current.doctor,
        departmentId: current.departmentId || ''
      } : { token: 'NO TOKEN', patient: '', doctor: '', departmentId: '' },
      waiting
    });
  } catch (error) {
    console.error('Get display data error:', error);
    res.status(500).json({ error: 'Failed to fetch display data' });
  }
});

// POST /api/tokens/migrate-departments - Fix appointments missing departmentId
router.post('/migrate-departments', optionalAuth, async (req, res) => {
  try {
    // Fetch all departments to build prefix → ID map
    const departments = await FirebaseService.getAll('departments');
    const prefixMap = {};
    departments.forEach(dept => {
      if (dept.prefix) {
        prefixMap[dept.prefix] = dept.id;
      }
    });

    // Fetch all appointments
    let appointments = await FirebaseService.getAll('appointments');

    // Find appointments with token prefix but missing departmentId
    const toMigrate = appointments.filter(a => {
      if (a.departmentId) return false; // Already has departmentId
      if (!a.token) return false; // No token

      // Check if token matches department prefix pattern (e.g., CAR-001, ORT-002)
      const tokenPrefix = a.token.split('-')[0];
      return prefixMap[tokenPrefix]; // Has a matching department
    });

    if (toMigrate.length === 0) {
      return res.json({
        message: 'No appointments need migration',
        migrated: 0
      });
    }

    // Update each appointment
    const updates = [];
    for (const appointment of toMigrate) {
      const tokenPrefix = appointment.token.split('-')[0];
      const departmentId = prefixMap[tokenPrefix];

      if (departmentId) {
        const department = departments.find(d => d.id === departmentId);
        updates.push(
          FirebaseService.update('appointments', appointment.id, {
            departmentId,
            department: department?.name || '',
            departmentPrefix: tokenPrefix
          })
        );
      }
    }

    await Promise.all(updates);

    res.json({
      message: 'Appointments migrated successfully',
      migrated: updates.length,
      appointments: toMigrate.map(a => ({
        id: a.id,
        token: a.token,
        patient: a.patient
      }))
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Failed to migrate appointments' });
  }
});

export default router;
