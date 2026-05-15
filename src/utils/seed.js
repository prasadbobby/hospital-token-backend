import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/firebase.js';

// Sample data
const doctors = [
  { name: "Dr. Anjali Rao", specialty: "Cardiology", experience: 12, email: "anjali@pulse.health" },
  { name: "Dr. Rohit Menon", specialty: "General Medicine", experience: 8, email: "rohit@pulse.health" },
  { name: "Dr. Neha Kulkarni", specialty: "Dermatology", experience: 10, email: "neha@pulse.health" },
  { name: "Dr. Vivek Shah", specialty: "Orthopaedics", experience: 15, email: "vivek@pulse.health" },
  { name: "Dr. Sara Iqbal", specialty: "Paediatrics", experience: 6, email: "sara@pulse.health" },
  { name: "Dr. Karan Bhalla", specialty: "ENT", experience: 9, email: "karan@pulse.health" },
];

const symptoms = [
  { name: "Fever", category: "General" },
  { name: "Cough", category: "Respiratory" },
  { name: "Headache", category: "General" },
  { name: "Fatigue", category: "General" },
  { name: "Chest pain", category: "Cardiac" },
  { name: "Back pain", category: "Ortho" },
  { name: "Skin rash", category: "Skin" },
  { name: "Sore throat", category: "Respiratory" },
  { name: "Dizziness", category: "General" },
  { name: "Joint pain", category: "Ortho" },
  { name: "Stomach ache", category: "GI" },
  { name: "Cold", category: "Respiratory" },
];

const services = [
  { name: "In-clinic Consultation", price: 500, mode: "Clinic", cancellation: 50 },
  { name: "Home Visit", price: 1200, mode: "Home", cancellation: 200 },
  { name: "Video Consultation", price: 350, mode: "Video", cancellation: 0 },
  { name: "Follow-up Visit", price: 200, mode: "Clinic", cancellation: 0 },
  { name: "Second Opinion", price: 800, mode: "Video", cancellation: 100 },
];

const receptionists = [
  { name: "Pooja Nair", email: "pooja@pulse.health", shifts: "Mon-Sat 9am-5pm" },
  { name: "Manav Joshi", email: "manav@pulse.health", shifts: "Tue-Sun 11am-8pm" },
  { name: "Reema Kapoor", email: "reema@pulse.health", shifts: "Mon-Fri 8am-4pm" },
];

const patientNames = [
  "Aarav Mehta", "Priya Sharma", "Rohan Kapoor", "Ananya Iyer", "Vikram Singh",
  "Diya Patel", "Arjun Reddy", "Isha Verma", "Kabir Joshi", "Meera Nair",
];

async function seed() {
  if (!db) {
    console.error('Firebase not initialized. Make sure service-account.json exists.');
    process.exit(1);
  }

  console.log('Starting database seed...\n');

  try {
    // Create admin user
    console.log('Creating admin user...');
    const adminId = uuidv4();
    const adminPassword = await bcrypt.hash('admin123', 10);
    await db.ref(`users/${adminId}`).set({
      email: 'admin@pulse.health',
      password: adminPassword,
      name: 'System Admin',
      role: 'admin',
      active: true,
      createdAt: new Date().toISOString()
    });
    console.log('  Admin: admin@pulse.health / admin123');

    // Create doctors
    console.log('\nCreating doctors...');
    const doctorIds = [];
    for (const doc of doctors) {
      const id = uuidv4();
      doctorIds.push({ id, name: doc.name });
      const password = await bcrypt.hash('doctor123', 10);

      // Create user account
      await db.ref(`users/${id}`).set({
        email: doc.email,
        password,
        name: doc.name,
        role: 'doctor',
        active: true,
        createdAt: new Date().toISOString()
      });

      // Create doctor profile
      await db.ref(`doctors/${id}`).set({
        userId: id,
        name: doc.name,
        email: doc.email,
        specialty: doc.specialty,
        experience: doc.experience,
        rating: (4 + Math.random()).toFixed(1),
        reviewsCount: Math.floor(Math.random() * 200) + 50,
        todayPatients: 0,
        avgWait: Math.floor(Math.random() * 15) + 5,
        revenue: 0,
        tokenLimit: 40,
        slotDuration: 15,
        active: true,
        createdAt: new Date().toISOString()
      });

      console.log(`  ${doc.name}: ${doc.email} / doctor123`);
    }

    // Create receptionists
    console.log('\nCreating receptionists...');
    for (const rec of receptionists) {
      const id = uuidv4();
      const password = await bcrypt.hash('reception123', 10);

      await db.ref(`users/${id}`).set({
        email: rec.email,
        password,
        name: rec.name,
        role: 'receptionist',
        active: true,
        createdAt: new Date().toISOString()
      });

      await db.ref(`receptionists/${id}`).set({
        userId: id,
        name: rec.name,
        email: rec.email,
        shifts: rec.shifts,
        assignedDoctors: doctorIds.slice(0, 2).map(d => d.name),
        active: true,
        createdAt: new Date().toISOString()
      });

      console.log(`  ${rec.name}: ${rec.email} / reception123`);
    }

    // Create symptoms
    console.log('\nCreating symptoms...');
    for (const sym of symptoms) {
      const id = uuidv4();
      await db.ref(`symptoms/${id}`).set({
        name: sym.name,
        category: sym.category,
        searches: Math.floor(Math.random() * 500) + 100,
        trend: ['up', 'down', 'flat'][Math.floor(Math.random() * 3)],
        createdAt: new Date().toISOString()
      });
    }
    console.log(`  Created ${symptoms.length} symptoms`);

    // Create services
    console.log('\nCreating services...');
    for (const svc of services) {
      const id = uuidv4();
      await db.ref(`services/${id}`).set({
        name: svc.name,
        price: svc.price,
        mode: svc.mode,
        cancellation: svc.cancellation,
        active: true,
        createdAt: new Date().toISOString()
      });
    }
    console.log(`  Created ${services.length} services`);

    // Create sample patients
    console.log('\nCreating sample patients...');
    const patientIds = [];
    for (let i = 0; i < patientNames.length; i++) {
      const id = uuidv4();
      patientIds.push(id);
      await db.ref(`patients/${id}`).set({
        uhid: `UHID-${(i + 1).toString().padStart(6, '0')}`,
        name: patientNames[i],
        phone: `+91 9${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`,
        age: 20 + Math.floor(Math.random() * 50),
        gender: i % 2 === 0 ? 'F' : 'M',
        visits: Math.floor(Math.random() * 10),
        createdAt: new Date().toISOString()
      });
    }
    console.log(`  Created ${patientNames.length} patients`);

    // Create sample appointments for today
    console.log('\nCreating sample appointments...');
    const today = new Date().toISOString().split('T')[0];
    const visitTypes = ['clinic', 'home', 'video'];
    const statuses = ['waiting', 'waiting', 'waiting', 'scheduled'];

    for (let i = 0; i < 15; i++) {
      const id = uuidv4();
      const doctor = doctorIds[i % doctorIds.length];
      const hour = 10 + Math.floor(i / 3);
      const minute = (i % 3) * 20;

      await db.ref(`appointments/${id}`).set({
        token: `T-${(i + 1).toString().padStart(3, '0')}`,
        patient: patientNames[i % patientNames.length],
        patientId: patientIds[i % patientIds.length],
        age: 25 + (i * 3) % 40,
        gender: i % 2 === 0 ? 'F' : 'M',
        phone: `+91 9${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`,
        doctorId: doctor.id,
        doctor: doctor.name,
        specialty: doctors.find(d => d.name === doctor.name)?.specialty || 'General',
        visitType: visitTypes[i % 3],
        slot: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
        bookedOn: today,
        symptoms: [symptoms[i % symptoms.length].name, symptoms[(i + 3) % symptoms.length].name],
        status: statuses[i % statuses.length],
        payment: i % 3 === 0 ? 'paid' : 'pending',
        amount: 300 + (i % 5) * 100,
        createdAt: new Date().toISOString()
      });
    }
    console.log('  Created 15 appointments');

    // Create sample reviews
    console.log('\nCreating sample reviews...');
    const reviewTexts = [
      "Excellent doctor, very thorough examination.",
      "Good consultation, explained everything clearly.",
      "Very patient and understanding. Highly recommend.",
      "Professional and knowledgeable.",
      "The wait was a bit long but worth it."
    ];

    for (let i = 0; i < 10; i++) {
      const id = uuidv4();
      const doctor = doctorIds[i % doctorIds.length];
      await db.ref(`reviews/${id}`).set({
        doctorId: doctor.id,
        doctor: doctor.name,
        patient: patientNames[i % patientNames.length],
        rating: 4 + Math.floor(Math.random() * 2),
        text: reviewTexts[i % reviewTexts.length],
        date: new Date(Date.now() - i * 86400000 * 3).toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      });
    }
    console.log('  Created 10 reviews');

    console.log('\n========================================');
    console.log('Database seeded successfully!');
    console.log('========================================');
    console.log('\nLogin Credentials:');
    console.log('  Admin:        admin@pulse.health / admin123');
    console.log('  Doctors:      [name]@pulse.health / doctor123');
    console.log('  Receptionists: [name]@pulse.health / reception123');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seed();
