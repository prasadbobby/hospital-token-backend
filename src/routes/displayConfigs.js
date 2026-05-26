import express from 'express';
import { db } from '../config/firebase.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all display screens (public access for display boards)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const ref = db.ref('displayConfigs');
    const snapshot = await ref.once('value');
    let screens = [];

    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        screens.push({
          id: child.key,
          ...child.val(),
        });
      });
    }

    // Sort by screen number
    screens.sort((a, b) => a.screenNumber - b.screenNumber);

    res.json(screens);
  } catch (error) {
    console.error('Error fetching display configs:', error);
    res.status(500).json({ error: 'Failed to fetch display configurations' });
  }
});

// Get display screen by ID (public access for display boards)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const snapshot = await db.ref(`displayConfigs/${id}`).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Display configuration not found' });
    }

    res.json({
      id: snapshot.key,
      ...snapshot.val(),
    });
  } catch (error) {
    console.error('Error fetching display config:', error);
    res.status(500).json({ error: 'Failed to fetch display configuration' });
  }
});

// Get display screen by screen number (public access for display boards)
router.get('/screen/:screenNumber', optionalAuth, async (req, res) => {
  try {
    const { screenNumber } = req.params;
    const ref = db.ref('displayConfigs');
    const snapshot = await ref.orderByChild('screenNumber').equalTo(parseInt(screenNumber)).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Screen configuration not found' });
    }

    let screen = null;
    snapshot.forEach((child) => {
      screen = {
        id: child.key,
        ...child.val(),
      };
    });

    res.json(screen);
  } catch (error) {
    console.error('Error fetching screen config:', error);
    res.status(500).json({ error: 'Failed to fetch screen configuration' });
  }
});

// Create display screen (Admin only)
router.post('/', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { name, screenNumber, departments, columns, showStats, showNextPatients, theme } = req.body;

    // Validation
    if (!name || screenNumber === undefined) {
      return res.status(400).json({ error: 'Name and screen number are required' });
    }

    // Check if screen number already exists
    const existingRef = db.ref('displayConfigs');
    const existingSnapshot = await existingRef.orderByChild('screenNumber').equalTo(screenNumber).once('value');
    if (existingSnapshot.exists()) {
      return res.status(400).json({ error: 'Screen number already exists' });
    }

    const newScreen = {
      name: name.trim(),
      screenNumber: parseInt(screenNumber),
      departments: departments || [], // Array of department IDs
      columns: columns || 3, // Grid columns (1-4)
      showStats: showStats !== false, // Show statistics in cards
      showNextPatients: showNextPatients !== false, // Show next patients list
      theme: theme || 'default', // Display theme
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: req.user.email,
    };

    const ref = await db.ref('displayConfigs').push(newScreen);

    res.status(201).json({
      id: ref.key,
      ...newScreen,
    });
  } catch (error) {
    console.error('Error creating display config:', error);
    res.status(500).json({ error: 'Failed to create display configuration' });
  }
});

// Update display screen (Admin only)
router.put('/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, screenNumber, departments, columns, showStats, showNextPatients, theme, active } = req.body;

    const snapshot = await db.ref(`displayConfigs/${id}`).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Display configuration not found' });
    }

    const currentConfig = snapshot.val();

    // If changing screen number, check uniqueness
    if (screenNumber !== undefined && screenNumber !== currentConfig.screenNumber) {
      const existingRef = db.ref('displayConfigs');
      const existingSnapshot = await existingRef.orderByChild('screenNumber').equalTo(screenNumber).once('value');
      if (existingSnapshot.exists()) {
        return res.status(400).json({ error: 'Screen number already exists' });
      }
    }

    const updates = {
      ...(name && { name: name.trim() }),
      ...(screenNumber !== undefined && { screenNumber: parseInt(screenNumber) }),
      ...(departments !== undefined && { departments }),
      ...(columns !== undefined && { columns: parseInt(columns) }),
      ...(showStats !== undefined && { showStats }),
      ...(showNextPatients !== undefined && { showNextPatients }),
      ...(theme !== undefined && { theme }),
      ...(active !== undefined && { active }),
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.email,
    };

    await db.ref(`displayConfigs/${id}`).update(updates);

    const updated = await db.ref(`displayConfigs/${id}`).once('value');
    res.json({
      id: updated.key,
      ...updated.val(),
    });
  } catch (error) {
    console.error('Error updating display config:', error);
    res.status(500).json({ error: 'Failed to update display configuration' });
  }
});

// Toggle display screen active status (Admin only)
router.patch('/:id/toggle', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const snapshot = await db.ref(`displayConfigs/${id}`).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Display configuration not found' });
    }

    const currentActive = snapshot.val().active;
    await db.ref(`displayConfigs/${id}`).update({
      active: !currentActive,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.email,
    });

    const updated = await db.ref(`displayConfigs/${id}`).once('value');
    res.json({
      id: updated.key,
      ...updated.val(),
    });
  } catch (error) {
    console.error('Error toggling display config:', error);
    res.status(500).json({ error: 'Failed to toggle display configuration' });
  }
});

// Delete display screen (Admin only)
router.delete('/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const snapshot = await db.ref(`displayConfigs/${id}`).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Display configuration not found' });
    }

    await db.ref(`displayConfigs/${id}`).remove();
    res.json({ message: 'Display configuration deleted successfully' });
  } catch (error) {
    console.error('Error deleting display config:', error);
    res.status(500).json({ error: 'Failed to delete display configuration' });
  }
});

// Get multi-department display data (public access for display boards)
// This returns queue data for multiple departments at once
router.get('/data/multi', optionalAuth, async (req, res) => {
  try {
    const { departmentIds, screenNumber } = req.query;

    let deptIds = [];

    // Get department IDs from query or from screen config
    if (departmentIds) {
      deptIds = departmentIds.split(',');
    } else if (screenNumber) {
      const screenRef = db.ref('displayConfigs');
      const screenSnapshot = await screenRef.orderByChild('screenNumber').equalTo(parseInt(screenNumber)).once('value');
      if (screenSnapshot.exists()) {
        screenSnapshot.forEach((child) => {
          deptIds = child.val().departments || [];
        });
      }
    }

    // Get all departments data
    const departmentsSnapshot = await db.ref('departments').once('value');
    const departments = {};
    if (departmentsSnapshot.exists()) {
      departmentsSnapshot.forEach((child) => {
        departments[child.key] = { id: child.key, ...child.val() };
      });
    }

    // Get today's date for filtering
    const today = new Date().toISOString().split('T')[0];

    // Get all appointments for today
    const appointmentsSnapshot = await db.ref('appointments').once('value');
    const appointments = [];
    if (appointmentsSnapshot.exists()) {
      appointmentsSnapshot.forEach((child) => {
        const apt = child.val();
        if (apt.date === today || apt.createdAt?.startsWith(today)) {
          appointments.push({ id: child.key, ...apt });
        }
      });
    }

    // Build display data for each department
    const displayData = [];

    // If no specific departments, use all active departments
    if (deptIds.length === 0) {
      deptIds = Object.keys(departments).filter(id => departments[id].active);
    }

    for (const deptId of deptIds) {
      const dept = departments[deptId];
      if (!dept) continue;

      // Filter appointments for this department
      const deptAppointments = appointments.filter(apt =>
        apt.departmentId === deptId ||
        apt.department === dept.name ||
        apt.departmentName === dept.name
      );

      // Get current patient (in-consult)
      const current = deptAppointments.find(apt => apt.status === 'in-consult');

      // Get waiting queue - sorted by registration time (first registered = first in queue)
      const waiting = deptAppointments
        .filter(apt => apt.status === 'waiting')
        .sort((a, b) => {
          // Priority patients first
          if (a.priority && !b.priority) return -1;
          if (!a.priority && b.priority) return 1;
          // Then by registration time (earlier = first)
          const aTime = new Date(a.createdAt || a.checkedInAt || 0).getTime();
          const bTime = new Date(b.createdAt || b.checkedInAt || 0).getTime();
          return aTime - bTime;
        });

      // Get held patients
      const held = deptAppointments.filter(apt => apt.status === 'on-hold');

      // Get completed today
      const completed = deptAppointments.filter(apt => apt.status === 'done');

      // Calculate stats
      const stats = {
        total: deptAppointments.length,
        waiting: waiting.length,
        completed: completed.length,
        held: held.length,
        avgWaitTime: calculateAvgWaitTime(completed),
      };

      displayData.push({
        department: {
          id: deptId,
          name: dept.name,
          prefix: dept.prefix,
        },
        current: current ? {
          id: current.id,
          token: current.token,
          tokenNumber: current.tokenNumber,
          patient: current.patient || current.patientName,
          doctor: current.doctor || current.doctorName,
          counter: current.counter || 1,
        } : null,
        waiting: waiting.slice(0, 5).map(apt => ({
          id: apt.id,
          token: apt.token,
          tokenNumber: apt.tokenNumber,
          patient: apt.patient || apt.patientName,
          priority: apt.priority,
        })),
        held: held.map(apt => ({
          id: apt.id,
          token: apt.token,
          patient: apt.patient || apt.patientName,
          holdReason: apt.holdReason,
        })),
        stats,
      });
    }

    res.json({
      timestamp: new Date().toISOString(),
      departments: displayData,
    });
  } catch (error) {
    console.error('Error fetching multi-department display data:', error);
    res.status(500).json({ error: 'Failed to fetch display data' });
  }
});

// Helper function to calculate average wait time
function calculateAvgWaitTime(completedAppointments) {
  if (completedAppointments.length === 0) return 0;

  const waitTimes = completedAppointments
    .filter(apt => apt.checkedInAt && apt.calledAt)
    .map(apt => {
      const checkedIn = new Date(apt.checkedInAt);
      const called = new Date(apt.calledAt);
      return (called - checkedIn) / 1000 / 60; // minutes
    });

  if (waitTimes.length === 0) return 0;
  return Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length);
}

export default router;
