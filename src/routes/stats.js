import { Router } from 'express';
import FirebaseService from '../services/firebase.service.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/stats/dashboard - Get dashboard statistics
router.get('/dashboard', optionalAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Get all data
    const [appointments, doctors, patients] = await Promise.all([
      FirebaseService.getAll('appointments'),
      FirebaseService.getAll('doctors'),
      FirebaseService.getAll('patients')
    ]);

    const todayAppointments = appointments.filter(a => a.bookedOn === today);

    // Calculate stats
    const stats = {
      totalAppointments: todayAppointments.length,
      inClinic: todayAppointments.filter(a => a.visitType === 'clinic').length,
      homeVisits: todayAppointments.filter(a => a.visitType === 'home').length,
      videoConsults: todayAppointments.filter(a => a.visitType === 'video').length,
      waiting: todayAppointments.filter(a => a.status === 'waiting').length,
      completed: todayAppointments.filter(a => a.status === 'done').length,
      cancelled: todayAppointments.filter(a => a.status === 'cancelled').length,
      totalDoctors: doctors.length,
      activeDoctors: doctors.filter(d => d.active).length,
      totalPatients: patients.length,
      newPatientsToday: patients.filter(p =>
        p.createdAt?.startsWith(today)
      ).length
    };

    res.json(stats);
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET /api/stats/weekly-volume - Get weekly volume data
router.get('/weekly-volume', optionalAuth, async (req, res) => {
  try {
    const appointments = await FirebaseService.getAll('appointments');

    // Get last 7 days
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyData = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = days[date.getDay()];

      const dayAppointments = appointments.filter(a => a.bookedOn === dateStr);

      weeklyData.push({
        day: dayName,
        date: dateStr,
        clinic: dayAppointments.filter(a => a.visitType === 'clinic').length,
        home: dayAppointments.filter(a => a.visitType === 'home').length,
        video: dayAppointments.filter(a => a.visitType === 'video').length,
        total: dayAppointments.length
      });
    }

    res.json(weeklyData);
  } catch (error) {
    console.error('Get weekly volume error:', error);
    res.status(500).json({ error: 'Failed to fetch weekly volume' });
  }
});

// GET /api/stats/doctor-performance - Get doctor performance stats
router.get('/doctor-performance', optionalAuth, async (req, res) => {
  try {
    const [doctors, appointments, reviews] = await Promise.all([
      FirebaseService.getAll('doctors'),
      FirebaseService.getAll('appointments'),
      FirebaseService.getAll('reviews')
    ]);

    const performance = doctors.map(doctor => {
      const doctorAppointments = appointments.filter(a => a.doctorId === doctor.id);
      const doctorReviews = reviews.filter(r => r.doctorId === doctor.id);

      const today = new Date().toISOString().split('T')[0];
      const todayAppointments = doctorAppointments.filter(a => a.bookedOn === today);

      // Calculate revenue (sum of paid appointments)
      const revenue = doctorAppointments
        .filter(a => a.payment === 'paid')
        .reduce((sum, a) => sum + (a.amount || 0), 0);

      // Calculate average wait time (mock for now)
      const avgWait = Math.floor(Math.random() * 15) + 5;

      return {
        id: doctor.id,
        name: doctor.name,
        specialty: doctor.specialty,
        todayPatients: todayAppointments.length,
        totalPatients: doctorAppointments.length,
        revenue,
        rating: doctor.rating || 0,
        reviewsCount: doctorReviews.length,
        avgWait,
        satisfaction: doctor.rating ? Math.round(doctor.rating * 20) : 0
      };
    });

    // Sort by revenue
    performance.sort((a, b) => b.revenue - a.revenue);

    res.json(performance);
  } catch (error) {
    console.error('Get doctor performance error:', error);
    res.status(500).json({ error: 'Failed to fetch doctor performance' });
  }
});

// GET /api/stats/visit-segregation - Get visit type segregation
router.get('/visit-segregation', optionalAuth, async (req, res) => {
  try {
    const appointments = await FirebaseService.getAll('appointments');
    const today = new Date().toISOString().split('T')[0];
    const todayAppointments = appointments.filter(a => a.bookedOn === today);

    const segregation = {
      clinic: {
        count: todayAppointments.filter(a => a.visitType === 'clinic').length,
        revenue: todayAppointments
          .filter(a => a.visitType === 'clinic' && a.payment === 'paid')
          .reduce((sum, a) => sum + (a.amount || 0), 0)
      },
      home: {
        count: todayAppointments.filter(a => a.visitType === 'home').length,
        revenue: todayAppointments
          .filter(a => a.visitType === 'home' && a.payment === 'paid')
          .reduce((sum, a) => sum + (a.amount || 0), 0)
      },
      video: {
        count: todayAppointments.filter(a => a.visitType === 'video').length,
        revenue: todayAppointments
          .filter(a => a.visitType === 'video' && a.payment === 'paid')
          .reduce((sum, a) => sum + (a.amount || 0), 0)
      }
    };

    const total = segregation.clinic.count + segregation.home.count + segregation.video.count;

    res.json({
      ...segregation,
      total,
      percentages: {
        clinic: total > 0 ? Math.round((segregation.clinic.count / total) * 100) : 0,
        home: total > 0 ? Math.round((segregation.home.count / total) * 100) : 0,
        video: total > 0 ? Math.round((segregation.video.count / total) * 100) : 0
      }
    });
  } catch (error) {
    console.error('Get visit segregation error:', error);
    res.status(500).json({ error: 'Failed to fetch visit segregation' });
  }
});

// GET /api/stats/symptoms-report - Get top symptoms
router.get('/symptoms-report', optionalAuth, async (req, res) => {
  try {
    const appointments = await FirebaseService.getAll('appointments');

    // Count symptoms
    const symptomCounts = {};
    appointments.forEach(a => {
      if (a.symptoms && Array.isArray(a.symptoms)) {
        a.symptoms.forEach(s => {
          symptomCounts[s] = (symptomCounts[s] || 0) + 1;
        });
      }
    });

    // Convert to array and sort
    const symptoms = Object.entries(symptomCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json(symptoms);
  } catch (error) {
    console.error('Get symptoms report error:', error);
    res.status(500).json({ error: 'Failed to fetch symptoms report' });
  }
});

// GET /api/stats/revenue - Get revenue statistics
router.get('/revenue', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { period } = req.query; // 'today', 'week', 'month'
    const appointments = await FirebaseService.getAll('appointments');

    const now = new Date();
    let startDate;

    switch (period) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      default: // today
        startDate = new Date(now.toISOString().split('T')[0]);
    }

    const filteredAppointments = appointments.filter(a => {
      const appointmentDate = new Date(a.bookedOn);
      return appointmentDate >= startDate;
    });

    const totalRevenue = filteredAppointments
      .filter(a => a.payment === 'paid')
      .reduce((sum, a) => sum + (a.amount || 0), 0);

    const pendingRevenue = filteredAppointments
      .filter(a => a.payment === 'pending')
      .reduce((sum, a) => sum + (a.amount || 0), 0);

    res.json({
      period: period || 'today',
      totalRevenue,
      pendingRevenue,
      totalAppointments: filteredAppointments.length,
      paidAppointments: filteredAppointments.filter(a => a.payment === 'paid').length
    });
  } catch (error) {
    console.error('Get revenue error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue' });
  }
});

export default router;
