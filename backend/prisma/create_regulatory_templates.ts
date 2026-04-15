import fs from 'fs';
import path from 'path';
import { PrismaClient, ReferenceType } from '@prisma/client';

const prisma = new PrismaClient();
const args = process.argv.slice(2);

function argValue(name: string, fallback?: string): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return fallback;
}

const orgSlug = argValue('--org-slug', 'demo-airlines')!;
const model = argValue('--model', 'AS350B3')!;
const dataDir = path.resolve(argValue('--data-dir', path.join(process.cwd(), 'data'))!);
const replace = args.includes('--replace');
const inspectOnly = args.includes('--inspect-only');

type SourceDoc = {
  fileName: string;
  code: string;
  title: string;
  referenceType: ReferenceType;
  isMandatory?: boolean;
  requiresInspection?: boolean;
};

type TemplateConfig = {
  manufacturer: string;
  model: string;
  description: string;
  version: string;
  section: string;
  docs: SourceDoc[];
};

const templateConfigs: TemplateConfig[] = [
  {
    manufacturer: 'DGAC',
    model,
    description: 'Normativa nacional (DGAC) - fuente: mIM AHO.pdf',
    version: '1.0',
    section: 'Normativa nacional (DGAC)',
    docs: [
      {
        fileName: 'mIM AHO.pdf',
        code: 'DGAC-MIM-AHO',
        title: 'MIM AHO',
        referenceType: 'INTERNAL',
        isMandatory: true,
      },
    ],
  },
  {
    manufacturer: 'MOTOR',
    model,
    description: 'Componentes e inspecciones de motor - fuentes: INSP MOTOR AHO.pdf, COMP MOTOR.pdf',
    version: '1.0',
    section: 'Componentes e inspecciones de motor',
    docs: [
      {
        fileName: 'INSP MOTOR AHO.pdf',
        code: 'MOTOR-INSP-AHO',
        title: 'INSP MOTOR AHO',
        referenceType: 'AMM',
        requiresInspection: true,
        isMandatory: true,
      },
      {
        fileName: 'COMP MOTOR.pdf',
        code: 'MOTOR-COMP',
        title: 'COMP MOTOR',
        referenceType: 'AMM',
        isMandatory: true,
      },
    ],
  },
  {
    manufacturer: 'EASA',
    model,
    description: 'Normativa pais de origen (EASA) - fuentes: AD MOTOR EASA.pdf, AD AHO.pdf',
    version: '1.0',
    section: 'Normativa pais de origen (EASA)',
    docs: [
      {
        fileName: 'AD MOTOR EASA.pdf',
        code: 'EASA-AD-MOTOR',
        title: 'AD MOTOR EASA',
        referenceType: 'AD',
        isMandatory: true,
      },
      {
        fileName: 'AD AHO.pdf',
        code: 'EASA-AD-AHO',
        title: 'AD AHO',
        referenceType: 'AD',
        isMandatory: true,
      },
    ],
  },
];

async function main() {
  const missing: string[] = [];
  for (const cfg of templateConfigs) {
    for (const doc of cfg.docs) {
      const fullPath = path.join(dataDir, doc.fileName);
      if (!fs.existsSync(fullPath)) missing.push(fullPath);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Faltan archivos requeridos:\n${missing.join('\n')}`);
  }

  if (inspectOnly) {
    console.log('Plantilla fabricante (existente): EUROCOPTER /', model);
    console.log('Plantillas regulatorias a crear/actualizar:');
    for (const cfg of templateConfigs) {
      console.log(`- ${cfg.manufacturer} / ${cfg.model} -> ${cfg.docs.length} documento(s)`);
    }
    return;
  }

  const organization = await prisma.organization.findFirst({ where: { slug: orgSlug } });
  if (!organization) {
    throw new Error(`Organization not found for slug ${orgSlug}`);
  }

  for (const cfg of templateConfigs) {
    const template = await prisma.maintenanceTemplate.upsert({
      where: {
        manufacturer_model_organizationId: {
          manufacturer: cfg.manufacturer,
          model: cfg.model,
          organizationId: organization.id,
        },
      },
      create: {
        organizationId: organization.id,
        manufacturer: cfg.manufacturer,
        model: cfg.model,
        description: cfg.description,
        version: cfg.version,
      },
      update: {
        description: cfg.description,
        version: cfg.version,
        isActive: true,
      },
    });

    if (replace) {
      await prisma.maintenanceTemplateTask.deleteMany({ where: { templateId: template.id } });
    }

    for (const doc of cfg.docs) {
      const sourcePath = path.join(dataDir, doc.fileName);
      const sourceFile = path.basename(sourcePath);
      await prisma.maintenanceTemplateTask.upsert({
        where: {
          templateId_code: {
            templateId: template.id,
            code: doc.code,
          },
        },
        create: {
          templateId: template.id,
          code: doc.code,
          title: doc.title,
          description: `Tarea regulatoria basada en documento fuente: ${sourceFile}`,
          section: cfg.section,
          intervalType: 'ON_CONDITION',
          referenceNumber: sourceFile,
          referenceType: doc.referenceType,
          isMandatory: doc.isMandatory ?? true,
          requiresInspection: doc.requiresInspection ?? false,
          applicableModel: cfg.model,
        },
        update: {
          title: doc.title,
          description: `Tarea regulatoria basada en documento fuente: ${sourceFile}`,
          section: cfg.section,
          intervalType: 'ON_CONDITION',
          referenceNumber: sourceFile,
          referenceType: doc.referenceType,
          isMandatory: doc.isMandatory ?? true,
          requiresInspection: doc.requiresInspection ?? false,
          applicableModel: cfg.model,
          isActive: true,
        },
      });
    }

    console.log(`OK: ${cfg.manufacturer} / ${cfg.model} (${cfg.docs.length} tarea(s))`);
  }

  console.log('Separacion completada en 4 bloques de biblioteca:');
  console.log(`1) Fabricante: EUROCOPTER / ${model} (existente)`);
  console.log(`2) DGAC: DGAC / ${model}`);
  console.log(`3) Componentes motor: MOTOR / ${model}`);
  console.log(`4) EASA: EASA / ${model}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
