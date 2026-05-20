import express from 'express';
import { db } from '../config/firebase.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get all departments
router.get('/', authenticate, async (req, res) => {
  try {
    const { active } = req.query;

    const ref = db.ref('departments');
    const snapshot = await ref.once('value');
    let departments = [];

    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        departments.push({
          id: child.key,
          ...child.val(),
        });
      });
    }

    // Filter by active status if specified
    if (active !== undefined) {
      const isActive = active === 'true';
      departments = departments.filter(d => d.active === isActive);
    }

    // Sort by name
    departments.sort((a, b) => a.name.localeCompare(b.name));

    res.json(departments);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// Get department by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const snapshot = await db.ref(`departments/${id}`).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Department not found' });
    }

    res.json({
      id: snapshot.key,
      ...snapshot.val(),
    });
  } catch (error) {
    console.error('Error fetching department:', error);
    res.status(500).json({ error: 'Failed to fetch department' });
  }
});

// Create department (Admin only)
router.post('/', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { name, prefix, price, description } = req.body;

    // Validation
    if (!name || !prefix) {
      return res.status(400).json({ error: 'Name and prefix are required' });
    }

    // Check if prefix already exists
    const allDepts = await db.ref('departments').once('value');
    if (allDepts.exists()) {
      let prefixExists = false;
      allDepts.forEach((child) => {
        if (child.val().prefix === prefix.toUpperCase()) {
          prefixExists = true;
        }
      });
      if (prefixExists) {
        return res.status(400).json({ error: 'Department prefix already exists' });
      }
    }

    const newDepartment = {
      name: name.trim(),
      prefix: prefix.toUpperCase().trim(),
      price: price || 300,
      description: description || '',
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: req.user.email,
    };

    const ref = await db.ref('departments').push(newDepartment);

    res.status(201).json({
      id: ref.key,
      ...newDepartment,
    });
  } catch (error) {
    console.error('Error creating department:', error);
    res.status(500).json({ error: 'Failed to create department' });
  }
});

// Update department (Admin only)
router.put('/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, prefix, price, description, active } = req.body;

    const snapshot = await db.ref(`departments/${id}`).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Department not found' });
    }

    // If changing prefix, check uniqueness
    if (prefix) {
      const allDepts = await db.ref('departments').once('value');
      if (allDepts.exists()) {
        let prefixExists = false;
        allDepts.forEach((child) => {
          if (child.key !== id && child.val().prefix === prefix.toUpperCase()) {
            prefixExists = true;
          }
        });
        if (prefixExists) {
          return res.status(400).json({ error: 'Department prefix already exists' });
        }
      }
    }

    const updates = {
      ...(name && { name: name.trim() }),
      ...(prefix && { prefix: prefix.toUpperCase().trim() }),
      ...(price !== undefined && { price }),
      ...(description !== undefined && { description }),
      ...(active !== undefined && { active }),
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.email,
    };

    await db.ref(`departments/${id}`).update(updates);

    const updated = await db.ref(`departments/${id}`).once('value');
    res.json({
      id: updated.key,
      ...updated.val(),
    });
  } catch (error) {
    console.error('Error updating department:', error);
    res.status(500).json({ error: 'Failed to update department' });
  }
});

// Toggle department active status (Admin only)
router.patch('/:id/toggle', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const snapshot = await db.ref(`departments/${id}`).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const currentActive = snapshot.val().active;
    await db.ref(`departments/${id}`).update({
      active: !currentActive,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.email,
    });

    const updated = await db.ref(`departments/${id}`).once('value');
    res.json({
      id: updated.key,
      ...updated.val(),
    });
  } catch (error) {
    console.error('Error toggling department:', error);
    res.status(500).json({ error: 'Failed to toggle department' });
  }
});

// Delete department (Admin only)
router.delete('/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const snapshot = await db.ref(`departments/${id}`).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Department not found' });
    }

    // Check if department is being used in appointments
    const appointmentsRef = db.ref('appointments');
    const appointmentsSnapshot = await appointmentsRef
      .orderByChild('department')
      .equalTo(id)
      .limitToFirst(1)
      .once('value');

    if (appointmentsSnapshot.exists()) {
      return res.status(400).json({
        error: 'Cannot delete department that has appointments. Deactivate it instead.',
      });
    }

    await db.ref(`departments/${id}`).remove();
    res.json({ message: 'Department deleted successfully' });
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

export default router;
