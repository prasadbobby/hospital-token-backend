import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import FirebaseService from '../services/firebase.service.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/reviews - Get all reviews
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { doctorId, rating, limit } = req.query;

    let reviews = await FirebaseService.getAll('reviews');

    if (doctorId) {
      reviews = reviews.filter(r => r.doctorId === doctorId);
    }
    if (rating) {
      reviews = reviews.filter(r => r.rating === parseInt(rating));
    }

    // Sort by date (newest first)
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (limit) {
      reviews = reviews.slice(0, parseInt(limit));
    }

    res.json(reviews);
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// GET /api/reviews/doctor/:doctorId - Get reviews for a doctor
router.get('/doctor/:doctorId', optionalAuth, async (req, res) => {
  try {
    const { doctorId } = req.params;

    let reviews = await FirebaseService.getByField('reviews', 'doctorId', doctorId);

    // Sort by date (newest first)
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Calculate rating distribution
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(r => {
      if (r.rating >= 1 && r.rating <= 5) {
        distribution[r.rating]++;
      }
    });

    // Calculate average rating
    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    res.json({
      reviews,
      stats: {
        total: reviews.length,
        average: Math.round(avgRating * 10) / 10,
        distribution
      }
    });
  } catch (error) {
    console.error('Get doctor reviews error:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// GET /api/reviews/:id - Get single review
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const review = await FirebaseService.getById('reviews', req.params.id);

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.json(review);
  } catch (error) {
    console.error('Get review error:', error);
    res.status(500).json({ error: 'Failed to fetch review' });
  }
});

// POST /api/reviews - Create new review
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { doctorId, doctor, patient, rating, text, appointmentId } = req.body;

    if (!doctorId || !rating) {
      return res.status(400).json({ error: 'Doctor ID and rating are required' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const reviewId = uuidv4();
    const review = await FirebaseService.createWithId('reviews', reviewId, {
      doctorId,
      doctor: doctor || '',
      patient: patient || 'Anonymous',
      rating,
      text: text || '',
      appointmentId: appointmentId || '',
      date: new Date().toISOString().split('T')[0]
    });

    // Update doctor's rating
    const doctorReviews = await FirebaseService.getByField('reviews', 'doctorId', doctorId);
    const avgRating = doctorReviews.reduce((sum, r) => sum + r.rating, 0) / doctorReviews.length;

    await FirebaseService.update('doctors', doctorId, {
      rating: Math.round(avgRating * 10) / 10,
      reviewsCount: doctorReviews.length
    });

    res.status(201).json(review);
  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({ error: 'Failed to create review' });
  }
});

// DELETE /api/reviews/:id - Delete review (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const review = await FirebaseService.getById('reviews', req.params.id);

    if (review) {
      await FirebaseService.delete('reviews', req.params.id);

      // Recalculate doctor's rating
      const doctorReviews = await FirebaseService.getByField('reviews', 'doctorId', review.doctorId);
      const avgRating = doctorReviews.length > 0
        ? doctorReviews.reduce((sum, r) => sum + r.rating, 0) / doctorReviews.length
        : 0;

      await FirebaseService.update('doctors', review.doctorId, {
        rating: Math.round(avgRating * 10) / 10,
        reviewsCount: doctorReviews.length
      });
    }

    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

export default router;
