/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Griselle — Script de Migración desde Access/CSV
 *  Archivo: prisma/migrate_data.ts
 *
 *  Uso:
 *    npx tsx prisma/migrate_data.ts [--csv-dir ./data] [--dry-run]
 *
 *  Archivos CSV esperados (en --csv-dir, por defecto ./data/):
 *    AERONAVES.csv  —  Matrícula, Fabricante, Modelo, N_Serie, Horas, Ciclos,
 *                      Estado, VtoCDN, VtoSeguro, FechaMat, FechaFab
 *    TAREAS.csv     —  Codigo, Titulo, Descripcion, Tipo, IntHoras, IntCiclos,
 *                      IntDias, TolHoras, RefNumero, RefTipo, Obligatoria,
 *                      ManHoras, RequiereInsp, ModeloAplica
 *    OT.csv         —  MAT, CodigoTarea, FechaCumplimiento, HorasAeronave,
 *                      CiclosAeronave, ProxVtoHoras, ProxVtoCiclos,
 *                      ProxVtoFecha, NumOT, Estado, Diferimiento, VtoDiferimiento
 * ═══════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { PrismaClient, Prisma } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const csvDirArg = args.find(a => a.startsWith('--csv-dir='))?.split('=')[1]
               ?? args[args.indexOf('--csv-dir') + 1]
               ?? path.join(__dirname, '..', 'data');
const DRY_RUN = args.includes('--dry-run');
const CSV_DIR = path.resolve(csvDirArg);

const ORG_ID = process.env.DEFAULT_ORG_ID ?? '62dac606-0611-4ac1-9cc5-17744be7d16e';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

// ─── Tipos de los registros CSV ───────────────────────────────────────────────
interface CsvAeronave  { [key: string]: string }
interface CsvTarea     { [key: string]: string }
interface CsvOT        { [key: string]: string }

// ─── Contadores de resultado ──────────────────────────────────────────────────
interface MigStats {
  aircraft:    { ok: number; skip: number; error: number };
  tasks:       { ok: number; skip: number; error: number };
  compliance:  { ok: number; skip: number; error: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lee un archivo CSV completo y devuelve array de objetos. */
function readCsv(filePath: string): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      resolve([]); // archivo opcional → vacío
      return;
    }
    const rows: Record<string, string>[] = [];
    fs.createReadStream(filePath, { encoding: 'utf-8' })
      .pipe(csv({ separator: ',', mapHeaders: ({ header }) => header.trim() }))
      .on('data', (row) => {
        // Limpiar todos los valores: quitar espacios y BOM
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          clean[k.replace(/^\uFEFF/, '').trim()] = String(v ?? '').trim();
        }
        rows.push(clean);
      })
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

/** Primer campo presente en el objeto, case-insensitive. */
function get(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    // exact match first
    if (key in row) return row[key];
    // case-insensitive fallback
    const found = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
    if (found) return row[found];
  }
  return '';
}

/** Convierte un string a número flotante; devuelve null si no es parseable. */
function toFloat(val: string): number | null {
  const n = parseFloat(val.replace(',', '.').replace(/\s/g, ''));
  return isNaN(n) ? null : n;
}

/** Convierte un string a entero; devuelve null si no es parseable. */
function toInt(val: string): number | null {
  const n = parseInt(val.replace(/\s/g, ''), 10);
  return isNaN(n) ? null : n;
}

function parseCalendarLimit(raw: string): { months: number | null; days: number | null } {
  if (!raw) return { months: null, days: null };
  const value = raw.trim().toUpperCase();
  const num = toFloat(value.replace(/[^0-9.,-]/g, ''));
  if (num == null) return { months: null, days: null };

  if (/\bM\b|MONTH|MESE|MES/.test(value)) {
    return { months: Math.round(num), days: null };
  }
  if (/\bD\b|DAY|DIA|DIAS/.test(value)) {
    return { months: null, days: Math.round(num) };
  }

  // If unit is not explicit, keep it as days to avoid aggressive month assumptions.
  return { months: null, days: Math.round(num) };
}

/**
 * Parsea fechas en múltiples formatos comunes de Access/Excel:
 *   DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, MM/DD/YYYY, D/M/YY
 * Devuelve un objeto Date válido o null.
 */
function parseDate(val: string): Date | null {
  if (!val || val === '' || val === '0' || val.toLowerCase() === 'null') return null;

  const s = val.trim();

  // ISO 8601: 2024-12-31
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY o DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? (parseInt(y) > 50 ? 1900 + parseInt(y) : 2000 + parseInt(y)) : parseInt(y);
    const date = new Date(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    return isNaN(date.getTime()) ? null : date;
  }

  // Fallback al parser nativo
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/** Normaliza matrícula: mayúsculas, sin espacios dobles, guiones limpios. */
function cleanReg(val: string): string {
  return val.toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-').slice(0, 20);
}

/**
 * Mapea strings de estado del CSV al enum AircraftStatus de Prisma.
 * Acepta variantes en español e inglés.
 */
function mapAircraftStatus(val: string): 'OPERATIONAL' | 'AOG' | 'IN_MAINTENANCE' | 'GROUNDED' | 'DECOMMISSIONED' {
  const v = val.toUpperCase().trim().replace(/\s+/g, '_');
  const map: Record<string, 'OPERATIONAL' | 'AOG' | 'IN_MAINTENANCE' | 'GROUNDED' | 'DECOMMISSIONED'> = {
    OPERACIONAL:    'OPERATIONAL',
    OPERATIONAL:    'OPERATIONAL',
    ACTIVO:         'OPERATIONAL',
    ACTIVA:         'OPERATIONAL',
    AOG:            'AOG',
    EN_MANTENIMIENTO: 'IN_MAINTENANCE',
    IN_MAINTENANCE: 'IN_MAINTENANCE',
    MANTENIMIENTO:  'IN_MAINTENANCE',
    EN_TIERRA:      'GROUNDED',
    GROUNDED:       'GROUNDED',
    TIERRA:         'GROUNDED',
    RETIRADA:       'DECOMMISSIONED',
    RETIRADO:       'DECOMMISSIONED',
    DECOMMISSIONED: 'DECOMMISSIONED',
    BAJA:           'DECOMMISSIONED',
  };
  return map[v] ?? 'OPERATIONAL';
}

/**
 * Mapea el tipo de intervalo de tarea al enum TaskIntervalType.
 */
function mapIntervalType(val: string): 'FLIGHT_HOURS' | 'CYCLES' | 'CALENDAR_DAYS' | 'FLIGHT_HOURS_OR_CALENDAR' | 'CYCLES_OR_CALENDAR' | 'ON_CONDITION' {
  const v = val.toUpperCase().trim().replace(/\s+/g, '_');
  const map: Record<string, 'FLIGHT_HOURS' | 'CYCLES' | 'CALENDAR_DAYS' | 'FLIGHT_HOURS_OR_CALENDAR' | 'CYCLES_OR_CALENDAR' | 'ON_CONDITION'> = {
    HORAS:                  'FLIGHT_HOURS',
    FLIGHT_HOURS:           'FLIGHT_HOURS',
    HRS:                    'FLIGHT_HOURS',
    H:                      'FLIGHT_HOURS',
    CICLOS:                 'CYCLES',
    CYCLES:                 'CYCLES',
    CYC:                    'CYCLES',
    CALENDARIO:             'CALENDAR_DAYS',
    CALENDAR_DAYS:          'CALENDAR_DAYS',
    DIAS:                   'CALENDAR_DAYS',
    HORAS_O_CALENDARIO:     'FLIGHT_HOURS_OR_CALENDAR',
    FLIGHT_HOURS_OR_CALENDAR: 'FLIGHT_HOURS_OR_CALENDAR',
    CICLOS_O_CALENDARIO:    'CYCLES_OR_CALENDAR',
    CYCLES_OR_CALENDAR:     'CYCLES_OR_CALENDAR',
    CONDICION:              'ON_CONDITION',
    ON_CONDITION:           'ON_CONDITION',
    OC:                     'ON_CONDITION',
  };
  return map[v] ?? 'FLIGHT_HOURS';
}

/**
 * Mapea el tipo de referencia al enum ReferenceType.
 */
function mapRefType(val: string): 'AMM' | 'AD' | 'SB' | 'CMR' | 'CDCCL' | 'MPD' | 'ETOPS' | 'INTERNAL' {
  const v = val.toUpperCase().trim();
  const known = ['AMM','AD','SB','CMR','CDCCL','MPD','ETOPS','INTERNAL'] as const;
  return known.includes(v as typeof known[number]) ? (v as typeof known[number]) : 'AMM';
}

/**
 * Mapea el estado de cumplimiento al enum ComplianceStatus.
 */
function mapComplianceStatus(val: string): 'COMPLETED' | 'DEFERRED' | 'OVERDUE' | 'CANCELLED' {
  const v = val.toUpperCase().trim();
  const map: Record<string, 'COMPLETED' | 'DEFERRED' | 'OVERDUE' | 'CANCELLED'> = {
    COMPLETADA: 'COMPLETED',
    COMPLETADO: 'COMPLETED',
    COMPLETED:  'COMPLETED',
    OK:         'COMPLETED',
    DIFERIDA:   'DEFERRED',
    DIFERIDO:   'DEFERRED',
    DEFERRED:   'DEFERRED',
    VENCIDA:    'OVERDUE',
    VENCIDO:    'OVERDUE',
    OVERDUE:    'OVERDUE',
    CANCELADA:  'CANCELLED',
    CANCELLED:  'CANCELLED',
  };
  return map[v] ?? 'COMPLETED';
}

// ─── Migración de AERONAVES ───────────────────────────────────────────────────
async function migrateAircraft(rows: CsvAeronave[]): Promise<{
  ok: number; skip: number; error: number;
  idMap: Map<string, string>; // registration → aircraft.id
}> {
  let ok = 0, skip = 0, error = 0;
  const idMap = new Map<string, string>();

  for (const row of rows) {
    const registration = cleanReg(get(row, 'MAT', 'MATRICULA', 'Matricula', 'registration'));
    if (!registration) { skip++; continue; }

    // Campos con sus aliases del CSV
    const manufacturer = get(row, 'FABRICANTE', 'Fabricante', 'manufacturer') || 'Desconocido';
    const model        = get(row, 'MODELO', 'Modelo', 'model') || 'Desconocido';
    const serialNumber = get(row, 'N_SERIE', 'N/SERIE', 'NSerie', 'serialNumber', 'SN', 'S_N') || `SN-${registration}`;
    const engineCount  = toInt(get(row, 'MOTORES', 'EngineCount', 'NumMotores')) ?? 2;
    const engineModel  = get(row, 'MODELO_MOTOR', 'ModeloMotor', 'EngineModel') || null;
    const totalFlightHours = toFloat(get(row, 'HORAS', 'HorasTotales', 'TotalHoras', 'totalFlightHours')) ?? 0;
    const totalCycles  = toInt(get(row, 'CICLOS', 'CiclosTotales', 'TotalCiclos', 'totalCycles')) ?? 0;
    const status       = mapAircraftStatus(get(row, 'ESTADO', 'Estado', 'status') || 'OPERACIONAL');
    const coaExpiryDate        = parseDate(get(row, 'VTO_CDN', 'VtoCDN', 'VtoCertificado', 'coaExpiryDate'));
    const insuranceExpiryDate  = parseDate(get(row, 'VTO_SEGURO', 'VtoSeguro', 'insuranceExpiryDate'));
    const registrationDate     = parseDate(get(row, 'FECHA_MAT', 'FechaMat', 'FechaMatricula', 'registrationDate'));
    const manufactureDate      = parseDate(get(row, 'FECHA_FAB', 'FechaFab', 'FechaFabricacion', 'manufactureDate'));

    try {
      const ac = await prisma.aircraft.upsert({
        where: { registration_organizationId: { registration, organizationId: ORG_ID } },
        create: {
          organizationId: ORG_ID,
          registration,
          manufacturer,
          model,
          serialNumber,
          engineCount,
          engineModel: engineModel || undefined,
          totalFlightHours: new Prisma.Decimal(totalFlightHours),
          totalCycles,
          status,
          coaExpiryDate: coaExpiryDate ?? undefined,
          insuranceExpiryDate: insuranceExpiryDate ?? undefined,
          registrationDate: registrationDate ?? undefined,
          manufactureDate: manufactureDate ?? undefined,
        },
        update: {
          manufacturer,
          model,
          serialNumber,
          totalFlightHours: new Prisma.Decimal(totalFlightHours),
          totalCycles,
          status,
          coaExpiryDate: coaExpiryDate ?? undefined,
          insuranceExpiryDate: insuranceExpiryDate ?? undefined,
        },
      });
      idMap.set(registration, ac.id);
      ok++;
    } catch (err) {
      console.error(`  ✗ AERONAVE [${registration}]: ${(err as Error).message}`);
      error++;
    }
  }

  return { ok, skip, error, idMap };
}

// ─── Migración de TAREAS ──────────────────────────────────────────────────────
async function migrateTasks(rows: CsvTarea[]): Promise<{
  ok: number; skip: number; error: number;
  idMap: Map<string, string>; // code → task.id
}> {
  let ok = 0, skip = 0, error = 0;
  const idMap = new Map<string, string>();

  for (const row of rows) {
    const code = get(row, 'CODIGO', 'Codigo', 'CODE', 'code').trim().toUpperCase();
    if (!code) { skip++; continue; }

    const title       = get(row, 'TITULO', 'Titulo', 'TITLE', 'title') || code;
    const description = get(row, 'DESCRIPCION', 'Descripcion', 'description') || title;
    const mappedIntervalType = mapIntervalType(get(row, 'TIPO', 'Tipo', 'intervalType', 'INTERVALO') || 'HORAS');
    const csvLimit1 = toFloat(get(row, 'LIMIT_1', 'LIMIT 1', 'Limit 1', 'Limit1', 'LIM1'));
    const csvLimit2 = parseCalendarLimit(get(row, 'LIMIT_2', 'LIMIT 2', 'Limit 2', 'Limit2', 'LIM2'));

    const intervalHours   = toFloat(get(row, 'INT_HORAS', 'IntHoras', 'intervalHours', 'INTHORAS')) ?? csvLimit1;
    const intervalCycles  = toInt(get(row, 'INT_CICLOS', 'IntCiclos', 'intervalCycles', 'INTCICLOS'));
    const intervalDays    = toInt(get(row, 'INT_DIAS', 'IntDias', 'intervalCalendarDays', 'INTDIAS')) ?? csvLimit2.days;
    const intervalMonths  = toInt(get(row, 'INT_MESES', 'IntMeses', 'intervalCalendarMonths', 'INTMESES', 'intervaloMeses')) ?? csvLimit2.months;

    const hasLimit1 = intervalHours != null;
    const hasLimit2 = intervalDays != null || intervalMonths != null;
    const intervalType = hasLimit1 && hasLimit2
      ? 'FLIGHT_HOURS_OR_CALENDAR'
      : hasLimit1
        ? 'FLIGHT_HOURS'
        : hasLimit2
          ? 'CALENDAR_DAYS'
          : mappedIntervalType;
    const toleranceHours  = toFloat(get(row, 'TOL_HORAS', 'TolHoras', 'toleranceHours'));
    const refNumber       = get(row, 'REF_NUMERO', 'RefNumero', 'referenceNumber', 'REFNUMERO') || undefined;
    const refType         = mapRefType(get(row, 'REF_TIPO', 'RefTipo', 'referenceType', 'REFTIPO') || 'AMM');
    const isMandatory     = ['SI','YES','TRUE','1','S'].includes(
      get(row, 'OBLIGATORIA', 'obligatoria', 'isMandatory').toUpperCase()
    );
    const estManHours     = toFloat(get(row, 'MAN_HORAS', 'ManHoras', 'estimatedManHours'));
    const requiresInsp    = ['SI','YES','TRUE','1','S'].includes(
      get(row, 'REQUIERE_INSP', 'RequiereInsp', 'requiresInspection').toUpperCase()
    );
    const applicableModel = get(row, 'MODELO_APLICA', 'ModeloAplica', 'applicableModel') || undefined;

    try {
      const task = await prisma.maintenanceTask.upsert({
        where: { code_organizationId: { code, organizationId: ORG_ID } },
        create: {
          organizationId: ORG_ID,
          code,
          title,
          description,
          intervalType,
          intervalHours:       intervalHours   ? new Prisma.Decimal(intervalHours)  : undefined,
          intervalCycles:      intervalCycles  ?? undefined,
          intervalCalendarDays: intervalDays   ?? undefined,
          intervalCalendarMonths: intervalMonths ?? undefined,
          toleranceHours:      toleranceHours  ? new Prisma.Decimal(toleranceHours) : undefined,
          referenceNumber:     refNumber,
          referenceType:       refType,
          isMandatory,
          estimatedManHours:   estManHours ? new Prisma.Decimal(estManHours) : undefined,
          requiresInspection:  requiresInsp,
          applicableModel:     applicableModel,
        },
        update: {
          title,
          description,
          intervalType,
          intervalHours:       intervalHours   ? new Prisma.Decimal(intervalHours)  : undefined,
          intervalCycles:      intervalCycles  ?? undefined,
          intervalCalendarDays: intervalDays   ?? undefined,
          intervalCalendarMonths: intervalMonths ?? undefined,
          referenceNumber:     refNumber,
          isMandatory,
        },
      });
      idMap.set(code, task.id);
      ok++;
    } catch (err) {
      console.error(`  ✗ TAREA [${code}]: ${(err as Error).message}`);
      error++;
    }
  }

  return { ok, skip, error, idMap };
}

// ─── Migración de OT (Cumplimientos) ─────────────────────────────────────────
async function migrateOT(
  rows: CsvOT[],
  aircraftMap: Map<string, string>,
  taskMap: Map<string, string>,
  adminUserId: string,
): Promise<{ ok: number; skip: number; error: number }> {

  let ok = 0, skip = 0, error = 0;
  const batchErrors: Array<{ row: number; msg: string }> = [];

  // Procesar en lotes de 50 dentro de una transacción por lote
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    // Pre-validar el lote: filtrar filas problemáticas antes de la transacción
    const validOps: Prisma.ComplianceCreateManyInput[] = [];

    for (const [j, row] of batch.entries()) {
      const rowNum = i + j + 2; // +2 para números de línea CSV (header = 1)

      const registration = cleanReg(get(row, 'MAT', 'MATRICULA', 'Matricula'));
      const taskCode     = get(row, 'CODIGO_TAREA', 'CodigoTarea', 'TAREA', 'Tarea', 'task', 'CODIGO').trim().toUpperCase();

      if (!registration || !taskCode) {
        skip++;
        continue;
      }

      const aircraftId = aircraftMap.get(registration);
      const taskId     = taskMap.get(taskCode);

      if (!aircraftId) {
        batchErrors.push({ row: rowNum, msg: `Aeronave no encontrada: "${registration}"` });
        skip++;
        continue;
      }
      if (!taskId) {
        batchErrors.push({ row: rowNum, msg: `Tarea no encontrada: "${taskCode}"` });
        skip++;
        continue;
      }

      const performedAt = parseDate(get(row, 'FECHA_CUMPLIMIENTO', 'FechaCumplimiento', 'FECHA', 'performedAt'));
      if (!performedAt) {
        batchErrors.push({ row: rowNum, msg: `Fecha inválida en MAT=${registration}` });
        skip++;
        continue;
      }

      const aircraftHours = toFloat(get(row, 'HORAS_AERONAVE', 'HorasAeronave', 'HORAS', 'aircraftHoursAtCompliance')) ?? 0;
      const aircraftCycles = toInt(get(row, 'CICLOS_AERONAVE', 'CiclosAeronave', 'CICLOS', 'aircraftCyclesAtCompliance')) ?? 0;
      const nextDueHours  = toFloat(get(row, 'PROX_VTO_HORAS', 'ProxVtoHoras', 'nextDueHours'));
      const nextDueCycles = toInt(get(row, 'PROX_VTO_CICLOS', 'ProxVtoCiclos', 'nextDueCycles'));
      const nextDueDate   = parseDate(get(row, 'PROX_VTO_FECHA', 'ProxVtoFecha', 'nextDueDate'));
      const workOrderNumber = get(row, 'NUM_OT', 'NumOT', 'OT', 'workOrderNumber') || undefined;
      const statusRaw     = get(row, 'ESTADO', 'Estado', 'status') || 'COMPLETADA';
      const status        = mapComplianceStatus(statusRaw);
      const deferralRef   = get(row, 'DIFERIMIENTO', 'deferralReference') || undefined;
      const deferralExp   = parseDate(get(row, 'VTO_DIFERIMIENTO', 'VtoDiferimiento', 'deferralExpiresAt'));

      validOps.push({
        organizationId:            ORG_ID,
        aircraftId,
        taskId,
        performedById:             adminUserId,
        performedAt,
        aircraftHoursAtCompliance: new Prisma.Decimal(aircraftHours),
        aircraftCyclesAtCompliance: aircraftCycles,
        nextDueHours:              nextDueHours  ? new Prisma.Decimal(nextDueHours)  : undefined,
        nextDueCycles:             nextDueCycles ?? undefined,
        nextDueDate:               nextDueDate   ?? undefined,
        workOrderNumber:           workOrderNumber ?? undefined,
        status,
        deferralReference:         deferralRef   ?? undefined,
        deferralExpiresAt:         deferralExp   ?? undefined,
      });
    }

    if (validOps.length === 0) continue;

    try {
      // Usar $transaction para que el lote sea atómico
      const result = await prisma.$transaction(async (tx) => {
        return tx.compliance.createMany({
          data: validOps,
          skipDuplicates: true,
        });
      });
      ok += result.count;
    } catch (err) {
      console.error(`  ✗ Lote filas ${i + 2}–${i + batch.length + 1}: ${(err as Error).message}`);
      error += validOps.length;
    }
  }

  // Imprimir advertencias de filas saltadas
  if (batchErrors.length > 0) {
    console.warn(`\n  ⚠  Filas con datos faltantes o inválidos:`);
    batchErrors.slice(0, 20).forEach(e => console.warn(`     Fila ${e.row}: ${e.msg}`));
    if (batchErrors.length > 20) console.warn(`     … y ${batchErrors.length - 20} más.`);
  }

  return { ok, skip, error };
}

// ─── Punto de entrada principal ───────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║      Griselle — Migración de datos desde Access/CSV   ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`  Directorio CSV : ${CSV_DIR}`);
  console.log(`  Organización   : ${ORG_ID}`);
  console.log(`  Modo           : ${DRY_RUN ? '🔍 DRY-RUN (sin escritura)' : '✍  ESCRITURA EN BASE DE DATOS'}`);
  console.log('');

  // Verificar que el directorio existe
  if (!fs.existsSync(CSV_DIR)) {
    console.error(`❌ Directorio CSV no encontrado: ${CSV_DIR}`);
    console.error(`   Crea la carpeta 'data/' en la raíz del backend y coloca los archivos CSV.`);
    process.exit(1);
  }

  // Verificar organización
  const org = await prisma.organization.findUnique({ where: { id: ORG_ID } });
  if (!org) {
    console.error(`❌ Organización con ID ${ORG_ID} no encontrada en la BD.`);
    process.exit(1);
  }
  console.log(`✅ Organización: ${org.name} (${org.slug})`);

  // Obtener usuario admin para createdBy (usamos el primero que exista)
  const adminUser = await prisma.user.findFirst({
    where: { organizationId: ORG_ID, role: 'ADMIN', isActive: true },
  });
  if (!adminUser) {
    console.error('❌ No hay usuario ADMIN activo para la organización. Ejecuta el seed primero.');
    process.exit(1);
  }
  console.log(`✅ Usuario admin: ${adminUser.email}`);
  console.log('');

  // ── Leer CSVs ──────────────────────────────────────────────────────────────
  const [rowsAeronaves, rowsTareas, rowsOT] = await Promise.all([
    readCsv(path.join(CSV_DIR, 'AERONAVES.csv')),
    readCsv(path.join(CSV_DIR, 'TAREAS.csv')),
    readCsv(path.join(CSV_DIR, 'OT.csv')),
  ]);

  console.log(`📂 Archivos leídos:`);
  console.log(`   AERONAVES.csv : ${rowsAeronaves.length} filas`);
  console.log(`   TAREAS.csv    : ${rowsTareas.length} filas`);
  console.log(`   OT.csv        : ${rowsOT.length} filas`);
  console.log('');

  if (DRY_RUN) {
    console.log('🔍 DRY-RUN activo: los datos NO se escribirán.');
    console.log('   Ejecuta sin --dry-run para migrar.');
    console.log('');
    // Mostrar preview de la primera fila de cada CSV
    if (rowsAeronaves[0]) console.log('   Columnas AERONAVES:', Object.keys(rowsAeronaves[0]).join(', '));
    if (rowsTareas[0])    console.log('   Columnas TAREAS   :', Object.keys(rowsTareas[0]).join(', '));
    if (rowsOT[0])        console.log('   Columnas OT       :', Object.keys(rowsOT[0]).join(', '));
    return;
  }

  const stats: MigStats = {
    aircraft:   { ok: 0, skip: 0, error: 0 },
    tasks:      { ok: 0, skip: 0, error: 0 },
    compliance: { ok: 0, skip: 0, error: 0 },
  };

  // ── 1. Aeronaves ────────────────────────────────────────────────────────────
  if (rowsAeronaves.length > 0) {
    console.log('▶  Migrando AERONAVES…');
    const result = await migrateAircraft(rowsAeronaves);
    stats.aircraft = { ok: result.ok, skip: result.skip, error: result.error };
    console.log(`   ✅ ${result.ok} creadas/actualizadas  ⏭  ${result.skip} saltadas  ✗ ${result.error} errores\n`);

    // ── 2. Tareas ─────────────────────────────────────────────────────────────
    if (rowsTareas.length > 0) {
      console.log('▶  Migrando TAREAS DE MANTENIMIENTO…');
      const taskResult = await migrateTasks(rowsTareas);
      stats.tasks = { ok: taskResult.ok, skip: taskResult.skip, error: taskResult.error };
      console.log(`   ✅ ${taskResult.ok} creadas/actualizadas  ⏭  ${taskResult.skip} saltadas  ✗ ${taskResult.error} errores\n`);

      // ── 3. OT / Cumplimientos ──────────────────────────────────────────────
      if (rowsOT.length > 0) {
        console.log('▶  Migrando ÓRDENES DE TRABAJO / CUMPLIMIENTOS…');
        // Recargar mapas frescos desde la BD por si ya existían registros previos
        const dbAircraft = await prisma.aircraft.findMany({
          where: { organizationId: ORG_ID },
          select: { id: true, registration: true },
        });
        const dbTasks = await prisma.maintenanceTask.findMany({
          where: { organizationId: ORG_ID },
          select: { id: true, code: true },
        });
        const acMap   = new Map(dbAircraft.map(a => [a.registration, a.id]));
        const taskMap = new Map(dbTasks.map(t => [t.code, t.id]));

        const otResult = await migrateOT(rowsOT, acMap, taskMap, adminUser.id);
        stats.compliance = otResult;
        console.log(`   ✅ ${otResult.ok} creados  ⏭  ${otResult.skip} saltados  ✗ ${otResult.error} errores\n`);
      }
    }

    // ── Resumen final ──────────────────────────────────────────────────────────
    console.log('══════════════════════════════════════════════════════════');
    console.log('  RESUMEN DE MIGRACIÓN');
    console.log('══════════════════════════════════════════════════════════');
    const pad = (n: number) => String(n).padStart(4);
    console.log(`  Aeronaves    : ${pad(stats.aircraft.ok)} ok  ${pad(stats.aircraft.skip)} skip  ${pad(stats.aircraft.error)} err`);
    console.log(`  Tareas       : ${pad(stats.tasks.ok)} ok  ${pad(stats.tasks.skip)} skip  ${pad(stats.tasks.error)} err`);
    console.log(`  Cumplimientos: ${pad(stats.compliance.ok)} ok  ${pad(stats.compliance.skip)} skip  ${pad(stats.compliance.error)} err`);
    console.log('══════════════════════════════════════════════════════════');

    const hasErrors = stats.aircraft.error + stats.tasks.error + stats.compliance.error > 0;
    if (hasErrors) {
      console.log('\n⚠  La migración terminó con algunos errores. Revisa los mensajes anteriores.');
    } else {
      console.log('\n🎉  Migración completada exitosamente.');
    }
  } else {
    console.log('ℹ  No se encontraron archivos CSV con datos. Verifica el directorio:', CSV_DIR);
  }
}

main()
  .catch((e) => {
    console.error('\n❌ Error fatal durante la migración:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
