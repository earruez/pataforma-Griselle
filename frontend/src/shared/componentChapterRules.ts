const TARGET_COMPONENT_SECTIONS = new Set(['04-10-00', '05-10-00', '05-11-00']);
const TARGET_COMPONENT_CHAPTERS = new Set(['04', '05']);

function normalizeChapter(value: string): string {
  return value
    .toUpperCase()
    .trim()
    .replace(/[./\s]+/g, '-')
    .replace(/-+/g, '-');
}

export function isComponentSection(section: string | null | undefined): boolean {
  if (!section) return false;
  const normalized = normalizeChapter(section);
  const root = normalized.split('-')[0];
  return TARGET_COMPONENT_SECTIONS.has(normalized) || TARGET_COMPONENT_CHAPTERS.has(root);
}

export function isComponentTaskCode(taskCode: string | null | undefined): boolean {
  if (!taskCode) return false;
  const normalized = normalizeChapter(taskCode);
  const root = normalized.split('-')[0];
  if (TARGET_COMPONENT_CHAPTERS.has(root)) return true;
  return (
    normalized.startsWith('04-10-')
    || normalized.startsWith('05-10-')
    || normalized.startsWith('05-11-')
  );
}

export function isComponentChapter(chapter: string | null | undefined): boolean {
  if (!chapter) return false;
  const normalized = normalizeChapter(chapter);
  const root = normalized.split('-')[0];
  return TARGET_COMPONENT_CHAPTERS.has(root);
}

export function isComponentChapterTask(input: {
  section?: string | null;
  chapter?: string | null;
  taskCode?: string | null;
}): boolean {
  return (
    isComponentChapter(input.chapter)
    || isComponentSection(input.section)
    || isComponentTaskCode(input.taskCode)
  );
}

export const componentChapterLabel = 'Capitulos ATA 04 / 05 y secciones 04-10-00, 05-10-00, 05-11-00';
