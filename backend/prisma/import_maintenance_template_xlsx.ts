import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { PrismaClient, Prisma, ReferenceType, TaskIntervalType } from '@prisma/client';

const prisma = new PrismaClient();

const args = process.argv.slice(2);

function argValue(name: string, fallback?: string): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return fallback;
}

const filesArg = argValue('--files');
const manufacturer = argValue('--manufacturer', 'EUROCOPTER')!;
const model = argValue('--model', 'AS350B3')!;
const version = argValue('--version', '1.0')!;
const orgSlug = argValue('--org-slug', 'demo-airlines')!;
const inspectOnly = args.includes('--inspect-only');
const replace = args.includes('--replace');
const forcedReferenceTypeArg = argValue('--reference-type')?.toUpperCase();
const forcedReferenceType: ReferenceType | undefined =
  forcedReferenceTypeArg && ['AMM', 'AD', 'SB', 'CMR', 'CDCCL', 'MPD', 'ETOPS', 'INTERNAL'].includes(forcedReferenceTypeArg)
    ? (forcedReferenceTypeArg as ReferenceType)
    : undefined;

if (!filesArg) {
  console.error('Uso: npm run import:template:xlsx -- --files <archivo1.xlsx,archivo2.xlsx> [--manufacturer EUROCOPTER] [--model AS350B3] [--org-slug demo-airlines] [--inspect-only] [--replace]');
  process.exit(1);
}

const files = filesArg.split(',').map((item) => path.resolve(item.trim())).filter(Boolean);

type ParsedRow = {
  code: string;
  title: string;
  description: string;
  chapter?: string;
  section?: string;
  intervalType: TaskIntervalType;
  intervalHours?: number;
  intervalCycles?: number;
  intervalCalendarDays?: number;
  intervalCalendarMonths?: number;
  referenceNumber?: string;
  referenceType: ReferenceType;
  isMandatory: boolean;
  estimatedManHours?: number;
  requiresInspection: boolean;
  applicableModel?: string;
};

const HEADER_ALIASES: Record<string, string[]> = {
  code: ['task number', 'task code', 'code', 'item', 'number', 'no.', 'nro', 'idinsp'],
  title: ['task title', 'task / requirement', 'requirement', 'task description', 'operation', 'texto69', 'actividad', 'descripcion'],
  description: ['description', 'details', 'remarks'],
  chapter: ['chapter', 'ata', 'chap', 'chapter/section'],
  section: ['chapter section subject', 'section', 'zone', 'system', 'source'],
  ataTitle: ['ata title'],
  maintenanceMode: ['maintenance mode'],
  frequency: ['frequency'],
  intervalHours: ['hour', 'hours', 'fh', 'flight hours', 'interval hours', 'cyprox', 'hsprox'],
  intervalCycles: ['cycles', 'cycle', 'landing', 'landings'],
  intervalCalendarDays: ['days', 'day', 'calendar days'],
  intervalCalendarMonths: ['months', 'month', 'calendar months'],
  referenceNumber: ['reference', 'document', 'manual ref', 'ref number', 'msa ref', 'ata', 'fecha'],
  refManual: ['ref manual'],
  documentation: ['documentation'],
  estimatedManHours: ['man-hours', 'manhours', 'mh', 'labor'],
  limit1: ['limit 1'],
  unit1: ['unit 1'],
  limit2: ['limit 2'],
  unit2: ['unit 2'],
  limit3: ['limit 3'],
  unit3: ['unit 3'],
  mpn: ['mpn'],
  pn: ['pn'],
};

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeRow(row: unknown[] = []): string[] {
  return Array.from({ length: row.length }, (_, index) => normalize(row[index]));
}

function toNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const num = Number(String(value).replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(num) ? num : undefined;
}

function inferReferenceType(value: string): ReferenceType {
  const upper = value.toUpperCase().trim();
  if (/(^|\W)AD(\W|$)/.test(upper)) return 'AD';
  if (/(^|\W)SB(\W|$)/.test(upper)) return 'SB';
  if (/(^|\W)CMR(\W|$)/.test(upper)) return 'CMR';
  if (upper.includes('CDCCL')) return 'CDCCL';
  if (/(^|\W)MPD(\W|$)/.test(upper)) return 'MPD';
  if (upper.includes('ETOPS')) return 'ETOPS';
  if (upper.includes('INTERNAL')) return 'INTERNAL';
  return 'AMM';
}

function inferIntervalType(row: Partial<ParsedRow>): TaskIntervalType {
  const hasHours = row.intervalHours != null;
  const hasCycles = row.intervalCycles != null;
  const hasDays = row.intervalCalendarDays != null || row.intervalCalendarMonths != null;
  if (hasHours && hasDays) return 'FLIGHT_HOURS_OR_CALENDAR';
  if (hasCycles && hasDays) return 'CYCLES_OR_CALENDAR';
  if (hasHours) return 'FLIGHT_HOURS';
  if (hasCycles) return 'CYCLES';
  if (hasDays) return 'CALENDAR_DAYS';
  return 'ON_CONDITION';
}

function mapUnitToInterval(limit: number | undefined, unitRaw: string | undefined): Partial<ParsedRow> {
  if (limit == null) return {};
  const unit = normalize(unitRaw).toUpperCase();

  if (['FH', 'HR', 'HRS', 'OPH'].includes(unit)) {
    return { intervalHours: limit };
  }
  if (['FC', 'HC', 'SC', 'CYC', 'CYCLE', 'CYCLES'].includes(unit)) {
    return { intervalCycles: Math.round(limit) };
  }
  if (['D', 'DAY', 'DAYS'].includes(unit)) {
    return { intervalCalendarDays: Math.round(limit) };
  }
  if (['M', 'MON', 'MONTH', 'MONTHS'].includes(unit)) {
    return { intervalCalendarMonths: Math.round(limit) };
  }

  return {};
}

function detectHeaderRow(rows: unknown[][]): number {
  let bestIndex = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const row = normalizeRow(rows[i]);
    const score = Object.values(HEADER_ALIASES).reduce((sum, aliases) => {
      return sum + (row.some((cell) => aliases.some((alias) => cell.includes(alias))) ? 1 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestScore >= 2 ? bestIndex : -1;
}

function mapColumns(header: string[]): Partial<Record<keyof typeof HEADER_ALIASES, number>> {
  const result: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  (Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>).forEach((key) => {
    let index = header.findIndex((cell) => HEADER_ALIASES[key].some((alias) => (cell ?? '') === alias));
    if (index < 0) {
      index = header.findIndex((cell) => HEADER_ALIASES[key].some((alias) => (cell ?? '').includes(alias)));
    }
    if (index >= 0) result[key] = index;
  });
  return result;
}

function parseRows(sheetName: string, rows: unknown[][]): ParsedRow[] {
  const headerIndex = detectHeaderRow(rows);
  if (headerIndex < 0) return [];

  const header = normalizeRow(rows[headerIndex]);
  const columns = mapColumns(header);
  const parsed: ParsedRow[] = [];
  const seenCodes = new Set<string>();

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const normalizedCurrentRow = normalizeRow(row);
    if (normalizedCurrentRow.every((cell) => cell === '')) continue;

    const rawCode = columns.code != null ? String(row[columns.code] ?? '').trim() : '';
    const rawTitle = columns.title != null ? String(row[columns.title] ?? '').trim() : '';
    const rawDescription = columns.description != null ? String(row[columns.description] ?? '').trim() : '';
    const rawAtaTitle = columns.ataTitle != null ? String(row[columns.ataTitle] ?? '').trim() : '';
    const baseCode = (rawCode || `${sheetName}-${i}`).slice(0, 90);
    let code = baseCode;
    if (seenCodes.has(code)) {
      code = `${baseCode}-${i}`.slice(0, 100);
    }
    seenCodes.add(code);
    const title = rawTitle || rawCode;
    if (!title) continue;

    const limit1 = columns.limit1 != null ? toNumber(row[columns.limit1]) : undefined;
    const limit2 = columns.limit2 != null ? toNumber(row[columns.limit2]) : undefined;
    const limit3 = columns.limit3 != null ? toNumber(row[columns.limit3]) : undefined;
    const unit1 = columns.unit1 != null ? String(row[columns.unit1] ?? '').trim() : undefined;
    const unit2 = columns.unit2 != null ? String(row[columns.unit2] ?? '').trim() : undefined;
    const unit3 = columns.unit3 != null ? String(row[columns.unit3] ?? '').trim() : undefined;
    const interval1 = mapUnitToInterval(limit1, unit1);
    const interval2 = mapUnitToInterval(limit2, unit2);
    const interval3 = mapUnitToInterval(limit3, unit3);
    const directIntervalHours = columns.intervalHours != null ? toNumber(row[columns.intervalHours]) : undefined;
    const directIntervalCycles = columns.intervalCycles != null ? toNumber(row[columns.intervalCycles]) : undefined;
    const directIntervalDays = columns.intervalCalendarDays != null ? toNumber(row[columns.intervalCalendarDays]) : undefined;
    const directIntervalMonths = columns.intervalCalendarMonths != null ? toNumber(row[columns.intervalCalendarMonths]) : undefined;
    const intervalData = {
      ...interval1,
      ...interval2,
      ...interval3,
      intervalHours: directIntervalHours ?? interval1.intervalHours ?? interval2.intervalHours ?? interval3.intervalHours,
      intervalCycles: directIntervalCycles != null
        ? Math.round(directIntervalCycles)
        : (interval1.intervalCycles ?? interval2.intervalCycles ?? interval3.intervalCycles),
      intervalCalendarDays: directIntervalDays != null
        ? Math.round(directIntervalDays)
        : (interval1.intervalCalendarDays ?? interval2.intervalCalendarDays ?? interval3.intervalCalendarDays),
      intervalCalendarMonths: directIntervalMonths != null
        ? Math.round(directIntervalMonths)
        : (interval1.intervalCalendarMonths ?? interval2.intervalCalendarMonths ?? interval3.intervalCalendarMonths),
    };

    const mpn = columns.mpn != null ? String(row[columns.mpn] ?? '').trim() : '';
    const pn = columns.pn != null ? String(row[columns.pn] ?? '').trim() : '';
    const maintenanceMode = columns.maintenanceMode != null ? String(row[columns.maintenanceMode] ?? '').trim() : '';
    const frequency = columns.frequency != null ? String(row[columns.frequency] ?? '').trim() : '';
    const refManual = columns.refManual != null ? String(row[columns.refManual] ?? '').trim() : '';
    const documentation = columns.documentation != null ? String(row[columns.documentation] ?? '').trim() : '';

    const entry: Partial<ParsedRow> = {
      code: code.slice(0, 100),
      title: title.slice(0, 255),
      description: [rawDescription, rawAtaTitle ? `ATA: ${rawAtaTitle}` : '', mpn ? `MPN: ${mpn}` : '', pn ? `PN: ${pn}` : '', maintenanceMode ? `Mode: ${maintenanceMode}` : '', frequency ? `Frequency: ${frequency}` : '']
        .filter(Boolean)
        .join('\n')
        .slice(0, 10000),
      chapter: columns.chapter != null ? String(row[columns.chapter] ?? '').trim().slice(0, 20) || undefined : undefined,
      section: columns.section != null ? String(row[columns.section] ?? '').trim().slice(0, 50) || sheetName : sheetName,
      intervalHours: intervalData.intervalHours,
      intervalCycles: intervalData.intervalCycles,
      intervalCalendarDays: intervalData.intervalCalendarDays,
      intervalCalendarMonths: intervalData.intervalCalendarMonths,
      referenceNumber: [refManual, documentation, columns.referenceNumber != null ? String(row[columns.referenceNumber] ?? '').trim() : ''].find(Boolean)?.slice(0, 100) || undefined,
      estimatedManHours: columns.estimatedManHours != null ? toNumber(row[columns.estimatedManHours]) : undefined,
      isMandatory: /ad|cmr|mandatory|sll/i.test(`${rawCode} ${rawTitle} ${maintenanceMode}`),
      requiresInspection: /inspect|inspection|insp/i.test(`${rawCode} ${rawTitle}`),
      applicableModel: model,
    };

    const referenceBase = `${refManual} ${documentation} ${columns.referenceNumber != null ? String(row[columns.referenceNumber] ?? '').trim() : ''}`;
    const parsedRow: ParsedRow = {
      code: entry.code!,
      title: entry.title!,
      description: entry.description!,
      chapter: entry.chapter,
      section: entry.section,
      intervalType: inferIntervalType(entry),
      intervalHours: entry.intervalHours,
      intervalCycles: entry.intervalCycles ? Math.round(entry.intervalCycles) : undefined,
      intervalCalendarDays: entry.intervalCalendarDays ? Math.round(entry.intervalCalendarDays) : undefined,
      intervalCalendarMonths: entry.intervalCalendarMonths ? Math.round(entry.intervalCalendarMonths) : undefined,
      referenceNumber: entry.referenceNumber,
      referenceType: forcedReferenceType ?? inferReferenceType(referenceBase),
      isMandatory: entry.isMandatory ?? false,
      estimatedManHours: entry.estimatedManHours,
      requiresInspection: entry.requiresInspection ?? false,
      applicableModel: model,
    };

    parsed.push(parsedRow);
  }

  return parsed;
}

async function main() {
  for (const file of files) {
    if (!fs.existsSync(file)) {
      throw new Error(`Archivo no encontrado: ${file}`);
    }
  }

  const workbookRows: ParsedRow[] = [];

  for (const file of files) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file);

    for (const worksheet of workbook.worksheets) {
      const rows: unknown[][] = [];
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        rows.push(values);
      });

      const parsed = parseRows(worksheet.name, rows);
      if (inspectOnly) {
        console.log(`\n[${path.basename(file)}] sheet=${worksheet.name} parsed=${parsed.length}`);
        console.log(parsed.slice(0, 5));
      }
      workbookRows.push(...parsed);
    }
  }

  if (inspectOnly) {
    console.log(`\nTotal parsed rows: ${workbookRows.length}`);
    return;
  }

  const organization = await prisma.organization.findFirst({ where: { slug: orgSlug } });
  if (!organization) throw new Error(`Organization not found for slug ${orgSlug}`);

  const template = await prisma.maintenanceTemplate.upsert({
    where: {
      manufacturer_model_organizationId: {
        manufacturer,
        model,
        organizationId: organization.id,
      },
    },
    create: {
      organizationId: organization.id,
      manufacturer,
      model,
      description: `${manufacturer} ${model} imported from XLSX maintenance files`,
      version,
    },
    update: {
      description: `${manufacturer} ${model} imported from XLSX maintenance files`,
      version,
      isActive: true,
    },
  });

  if (replace) {
    await prisma.maintenanceTemplateTask.deleteMany({ where: { templateId: template.id } });
  }

  let created = 0;
  let updated = 0;
  for (const row of workbookRows) {
    await prisma.maintenanceTemplateTask.upsert({
      where: { templateId_code: { templateId: template.id, code: row.code } },
      create: {
        templateId: template.id,
        code: row.code,
        title: row.title,
        description: row.description,
        chapter: row.chapter,
        section: row.section,
        intervalType: row.intervalType,
        intervalHours: row.intervalHours != null ? new Prisma.Decimal(row.intervalHours) : undefined,
        intervalCycles: row.intervalCycles,
        intervalCalendarDays: row.intervalCalendarDays,
        intervalCalendarMonths: row.intervalCalendarMonths,
        referenceNumber: row.referenceNumber,
        referenceType: row.referenceType,
        isMandatory: row.isMandatory,
        estimatedManHours: row.estimatedManHours != null ? new Prisma.Decimal(row.estimatedManHours) : undefined,
        requiresInspection: row.requiresInspection,
        applicableModel: row.applicableModel,
      },
      update: {
        title: row.title,
        description: row.description,
        chapter: row.chapter,
        section: row.section,
        intervalType: row.intervalType,
        intervalHours: row.intervalHours != null ? new Prisma.Decimal(row.intervalHours) : null,
        intervalCycles: row.intervalCycles ?? null,
        intervalCalendarDays: row.intervalCalendarDays ?? null,
        intervalCalendarMonths: row.intervalCalendarMonths ?? null,
        referenceNumber: row.referenceNumber ?? null,
        referenceType: row.referenceType,
        isMandatory: row.isMandatory,
        estimatedManHours: row.estimatedManHours != null ? new Prisma.Decimal(row.estimatedManHours) : null,
        requiresInspection: row.requiresInspection,
        applicableModel: row.applicableModel,
        isActive: true,
      },
    });
    updated += 1;
  }

  console.log(`Template ready: ${template.manufacturer} ${template.model}`);
  console.log(`Rows parsed: ${workbookRows.length}`);
  console.log(`Rows upserted: ${updated}`);
  console.log(`Rows created counter placeholder: ${created}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
