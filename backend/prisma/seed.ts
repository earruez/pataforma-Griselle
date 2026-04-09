import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Seeding database...');

  // ── Organization ──────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-airlines' },
    create: { name: 'Demo Airlines', slug: 'demo-airlines', country: 'MX', subscriptionPlan: 'PROFESSIONAL', subscriptionStatus: 'ACTIVE' },
    update: {},
  });
  console.log(`✅  Organization: ${org.name} (${org.id})`);

  // ── Admin user ────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin1234!', 12);
  const admin = await prisma.user.upsert({
    where: { email_organizationId: { email: 'admin@demo-airlines.com', organizationId: org.id } },
    create: { organizationId: org.id, email: 'admin@demo-airlines.com', name: 'Admin User', passwordHash, role: 'ADMIN' },
    update: {},
  });
  console.log(`✅  Admin: ${admin.email}`);

  // ── Inspector user ────────────────────────────────────────────────────────
  const inspector = await prisma.user.upsert({
    where: { email_organizationId: { email: 'inspector@demo-airlines.com', organizationId: org.id } },
    create: {
      organizationId: org.id,
      email: 'inspector@demo-airlines.com',
      name: 'Senior Inspector',
      passwordHash: await bcrypt.hash('Inspector1234!', 12),
      role: 'INSPECTOR',
      licenseNumber: 'PART-66-B1-00123',
    },
    update: {},
  });
  console.log(`✅  Inspector: ${inspector.email} (${inspector.licenseNumber})`);

  // ── Aircraft ──────────────────────────────────────────────────────────────
  const aircraft = await prisma.aircraft.upsert({
    where: { registration_organizationId: { registration: 'XA-GRI', organizationId: org.id } },
    create: {
      organizationId: org.id,
      registration: 'XA-GRI',
      model: 'Boeing 737-800',
      manufacturer: 'Boeing',
      serialNumber: 'MSN-40123',
      engineCount: 2,
      engineModel: 'CFM56-7B24',
      totalFlightHours: 12450.5,
      totalCycles: 8320,
      status: 'OPERATIONAL',
      coaExpiryDate: new Date('2026-12-31'),
      insuranceExpiryDate: new Date('2026-11-30'),
    },
    update: {},
  });
  console.log(`✅  Aircraft: ${aircraft.registration} — ${aircraft.totalFlightHours}h / ${aircraft.totalCycles} cycles`);

  // ── Component ─────────────────────────────────────────────────────────────
  const engine = await prisma.component.upsert({
    where: { serialNumber_organizationId: { serialNumber: 'CFM-SN-78451', organizationId: org.id } },
    create: {
      organizationId: org.id,
      aircraftId: aircraft.id,
      partNumber: '338-001-801-0',
      serialNumber: 'CFM-SN-78451',
      description: 'CFM56-7B24 Engine #1',
      manufacturer: 'CFM International',
      position: 'Engine 1 (LH)',
      totalHoursSinceNew: 12450.5,
      totalCyclesSinceNew: 8320,
      hoursSinceOverhaul: 3200.0,
      cyclesSinceOverhaul: 2100,
      tboHours: 20000,
      tboCycles: 15000,
      tboCalendarDays: 3650,
      status: 'INSTALLED',
      installationDate: new Date('2022-03-15'),
      installationAircraftHours: 9250.5,
      installationAircraftCycles: 6220,
    },
    update: {},
  });
  console.log(`✅  Component: ${engine.description} (P/N ${engine.partNumber}, S/N ${engine.serialNumber})`);

  // ── Maintenance Task: 100h inspection ────────────────────────────────────
  const task100h = await prisma.maintenanceTask.upsert({
    where: { code_organizationId: { code: '100H-INSP', organizationId: org.id } },
    create: {
      organizationId: org.id,
      code: '100H-INSP',
      title: '100-Hour Periodic Inspection',
      description: 'Full airframe inspection as per AMM Chapter 05-20.',
      intervalType: 'FLIGHT_HOURS',
      intervalHours: 100,
      toleranceHours: 10,
      referenceNumber: 'AMM 05-20-00',
      referenceType: 'AMM',
      isMandatory: true,
      estimatedManHours: 8,
      requiresInspection: true,
      applicableModel: 'Boeing 737-800',
    },
    update: {},
  });
  console.log(`✅  Task: ${task100h.code} — every ${task100h.intervalHours}h`);

  // ── Airworthiness Directive ────────────────────────────────────────────────
  const adTask = await prisma.maintenanceTask.upsert({
    where: { code_organizationId: { code: 'AD-2024-15-01', organizationId: org.id } },
    create: {
      organizationId: org.id,
      code: 'AD-2024-15-01',
      title: 'CFM56-7B Engine Fan Blade Inspection',
      description: 'Repetitive inspection of fan blade leading edge for cracks per AD 2024-15-01.',
      intervalType: 'CYCLES',
      intervalCycles: 500,
      toleranceCycles: 25,
      referenceNumber: '2024-15-01',
      referenceType: 'AD',
      isMandatory: true,
      estimatedManHours: 4,
      requiresInspection: true,
      applicablePartNumber: '338-001-801-0',
    },
    update: {},
  });
  console.log(`✅  Task: ${adTask.code} (AD) — every ${adTask.intervalCycles} cycles`);

  // ── Aircraft ↔ Task links ─────────────────────────────────────────────────
  await prisma.aircraftTask.upsert({
    where: { aircraftId_taskId: { aircraftId: aircraft.id, taskId: task100h.id } },
    create: { aircraftId: aircraft.id, taskId: task100h.id },
    update: {},
  });

  // ── Component ↔ AD Task link ──────────────────────────────────────────────
  await prisma.componentTask.upsert({
    where: { componentId_taskId: { componentId: engine.id, taskId: adTask.id } },
    create: { componentId: engine.id, taskId: adTask.id },
    update: {},
  });
  console.log(`✅  Task links created`);

  // ── Compliance record ─────────────────────────────────────────────────────
  await prisma.compliance.create({
    data: {
      organizationId: org.id,
      aircraftId: aircraft.id,
      taskId: task100h.id,
      performedById: admin.id,
      inspectedById: inspector.id,
      performedAt: new Date('2024-10-01T08:00:00Z'),
      aircraftHoursAtCompliance: 12400.0,
      aircraftCyclesAtCompliance: 8290,
      nextDueHours: 12500.0,     // 12400 + 100
      nextDueCycles: null,
      nextDueDate: null,
      workOrderNumber: 'WO-2024-00481',
      status: 'COMPLETED',
      notes: 'No defects found. All items serviceable.',
    },
  });
  console.log(`✅  Compliance record created (next due at 12,500h)`);

  console.log('\n🎉  Seed complete!');
  console.log(`\n  Login: admin@demo-airlines.com / Admin1234!`);
  console.log(`  Organization ID: ${org.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
