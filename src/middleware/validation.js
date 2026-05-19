import Joi from 'joi';

// Validation schemas
export const schemas = {
  // Auth schemas
  register: Joi.object({
    email: Joi.string().email().required().max(255),
    password: Joi.string().min(8).max(128).required()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .message('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    name: Joi.string().min(2).max(100).required(),
    role: Joi.string().valid('admin', 'doctor', 'receptionist').required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{9,14}$/).optional(),
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  // Patient schemas
  createPatient: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    age: Joi.number().integer().min(0).max(150).required(),
    gender: Joi.string().valid('Male', 'Female', 'Other').required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{9,14}$/).required(),
    email: Joi.string().email().optional().allow(''),
    address: Joi.string().max(500).optional().allow(''),
    bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-').optional(),
    allergies: Joi.string().max(500).optional().allow(''),
    medicalHistory: Joi.string().max(1000).optional().allow(''),
  }),

  updatePatient: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    age: Joi.number().integer().min(0).max(150).optional(),
    gender: Joi.string().valid('Male', 'Female', 'Other').optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{9,14}$/).optional(),
    email: Joi.string().email().optional().allow(''),
    address: Joi.string().max(500).optional().allow(''),
    bloodGroup: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-').optional(),
    allergies: Joi.string().max(500).optional().allow(''),
    medicalHistory: Joi.string().max(1000).optional().allow(''),
    active: Joi.boolean().optional(),
  }),

  // Appointment schemas
  createAppointment: Joi.object({
    patient: Joi.string().min(2).max(100).required(),
    patientId: Joi.string().max(50).optional(),
    age: Joi.number().integer().min(0).max(150).required(),
    gender: Joi.string().valid('Male', 'Female', 'Other').required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{9,14}$/).required(),
    doctor: Joi.string().min(2).max(100).required(),
    doctorId: Joi.string().required(),
    bookedOn: Joi.date().min('now').required(),
    slot: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
    visitType: Joi.string().valid('clinic', 'home', 'video').required(),
    symptoms: Joi.array().items(Joi.string().max(100)).min(1).max(10).required(),
    notes: Joi.string().max(1000).optional().allow(''),
    amount: Joi.number().min(0).max(100000).optional(),
    priority: Joi.boolean().optional(),
  }),

  updateAppointmentStatus: Joi.object({
    status: Joi.string().valid('waiting', 'in-consult', 'completed', 'cancelled', 'no-show', 'on-hold').required(),
    notes: Joi.string().max(1000).optional().allow(''),
  }),

  // Doctor schemas
  updateDoctor: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    specialty: Joi.string().max(100).optional(),
    experience: Joi.number().integer().min(0).max(70).optional(),
    registration: Joi.string().max(50).optional(),
    languages: Joi.string().max(200).optional(),
    bio: Joi.string().max(1000).optional(),
    clinicName: Joi.string().max(200).optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{9,14}$/).optional(),
    address: Joi.string().max(500).optional(),
  }),

  updateSchedule: Joi.object({
    dailyTokenLimit: Joi.number().integer().min(1).max(200).required(),
    slotDuration: Joi.number().integer().min(5).max(120).required(),
    workingDays: Joi.array().items(Joi.string().valid('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')).min(1).required(),
    startTime: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
    endTime: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  }),

  updateAvailability: Joi.object({
    clinic: Joi.boolean().required(),
    home: Joi.boolean().required(),
    video: Joi.boolean().required(),
    blockedDates: Joi.array().items(Joi.number().integer()).optional(),
    timeFrom: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
    timeTo: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  }),

  // Review schemas
  createReview: Joi.object({
    doctorId: Joi.string().required(),
    patientName: Joi.string().min(2).max(100).required(),
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().max(1000).required(),
  }),

  // Service schemas
  createService: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    mode: Joi.string().valid('Clinic', 'Home', 'Video').required(),
    price: Joi.number().min(0).max(100000).required(),
    cancellation: Joi.number().min(0).max(100000).required(),
    active: Joi.boolean().optional(),
  }),
};

// Validation middleware factory
export const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all errors
      stripUnknown: true, // Remove unknown fields
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }

    // Replace req.body with sanitized value
    req.body = value;
    next();
  };
};

// Query parameter validation
export const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        error: 'Invalid query parameters',
        details: errors,
      });
    }

    req.query = value;
    next();
  };
};

// Validate MongoDB/Firebase ID format
export const validateId = (req, res, next) => {
  const id = req.params.id;

  if (!id || id.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  next();
};
