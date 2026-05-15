import { db } from '../config/firebase.js';
import bcrypt from 'bcryptjs';

async function seedDatabase() {
  console.log('[Seed] Starting database seeding...\n');

  // 1. Seed Doctors
  console.log('[Seed] Adding doctors...');
  const doctors = [
    { name: "Dr. Anjali Rao", specialty: "Cardiology", experience: 12, email: "anjali@pulse.health" },
    { name: "Dr. Rohit Menon", specialty: "General Medicine", experience: 8, email: "rohit@pulse.health" },
    { name: "Dr. Neha Kulkarni", specialty: "Dermatology", experience: 10, email: "neha@pulse.health" },
    { name: "Dr. Suresh Kumar", specialty: "Orthopedics", experience: 15, email: "suresh@pulse.health" },
    { name: "Dr. Priya Sharma", specialty: "Pediatrics", experience: 7, email: "priya@pulse.health" },
  ];

  for (const doc of doctors) {
    const ref = db.ref('doctors').push();
    await ref.set({
      ...doc,
      rating: 4.5,
      reviewsCount: Math.floor(Math.random() * 100) + 20,
      todayPatients: 0,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    console.log(`  ✓ Added: ${doc.name}`);
  }

  // 2. Seed Admin User
  console.log('\n[Seed] Adding admin user...');
  const adminPassword = await bcrypt.hash('admin123', 10);
  const adminRef = db.ref('users').push();
  await adminRef.set({
    email: 'admin@pulse.health',
    password: adminPassword,
    name: 'System Admin',
    role: 'admin',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  console.log('  ✓ Added: admin@pulse.health (password: admin123)');

  // 3. Seed Receptionist
  console.log('\n[Seed] Adding receptionist...');
  const receptionistPassword = await bcrypt.hash('reception123', 10);
  const receptionistRef = db.ref('users').push();
  await receptionistRef.set({
    email: 'reception@pulse.health',
    password: receptionistPassword,
    name: 'Front Desk',
    role: 'receptionist',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  console.log('  ✓ Added: reception@pulse.health (password: reception123)');

  // 4. Seed Doctor User (linked to first doctor)
  console.log('\n[Seed] Adding doctor user...');
  const doctorPassword = await bcrypt.hash('doctor123', 10);
  const doctorUserRef = db.ref('users').push();
  await doctorUserRef.set({
    email: 'anjali@pulse.health',
    password: doctorPassword,
    name: 'Dr. Anjali Rao',
    role: 'doctor',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  console.log('  ✓ Added: anjali@pulse.health (password: doctor123)');

  // 5. Seed Symptoms
  console.log('\n[Seed] Adding symptoms...');
  const symptoms = [
    { name: 'Fever', category: 'General' },
    { name: 'Cough', category: 'Respiratory' },
    { name: 'Headache', category: 'Neurological' },
    { name: 'Fatigue', category: 'General' },
    { name: 'Chest Pain', category: 'Cardiac' },
    { name: 'Back Pain', category: 'Musculoskeletal' },
    { name: 'Skin Rash', category: 'Dermatological' },
    { name: 'Joint Pain', category: 'Musculoskeletal' },
    { name: 'Stomach Pain', category: 'Gastrointestinal' },
    { name: 'Dizziness', category: 'Neurological' },
  ];

  for (const symptom of symptoms) {
    const ref = db.ref('symptoms').push();
    await ref.set({
      ...symptom,
      searches: Math.floor(Math.random() * 200) + 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    console.log(`  ✓ Added: ${symptom.name}`);
  }

  // 6. Seed Services
  console.log('\n[Seed] Adding services...');
  const services = [
    { name: "In-clinic Consultation", price: 500, mode: "Clinic", duration: 30 },
    { name: "Home Visit", price: 1200, mode: "Home", duration: 60 },
    { name: "Video Consultation", price: 350, mode: "Video", duration: 20 },
    { name: "Emergency Consultation", price: 1500, mode: "Emergency", duration: 45 },
    { name: "Follow-up Visit", price: 300, mode: "Clinic", duration: 15 },
  ];

  for (const service of services) {
    const ref = db.ref('services').push();
    await ref.set({
      ...service,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    console.log(`  ✓ Added: ${service.name}`);
  }

  // 7. Initialize token counter for today
  console.log('\n[Seed] Initializing token counter...');
  const today = new Date().toISOString().split('T')[0];
  await db.ref(`tokenCounters/${today}`).set({
    regular: 0,
    emergency: 0,
    createdAt: new Date().toISOString()
  });
  console.log(`  ✓ Token counter initialized for ${today}`);

  console.log('\n============================================');
  console.log('  DATABASE SEEDED SUCCESSFULLY!');
  console.log('============================================');
  console.log('\nLogin Credentials:');
  console.log('  Admin:        admin@pulse.health / admin123');
  console.log('  Receptionist: reception@pulse.health / reception123');
  console.log('  Doctor:       anjali@pulse.health / doctor123');
  console.log('============================================\n');

  process.exit(0);
}

seedDatabase().catch((error) => {
  console.error('[Seed] Error:', error);
  process.exit(1);
});
