import type { MappableFieldKey } from "../model";
import type { WorkbookFingerprintProfile } from "./workbookFingerprint";
import type { SmartFieldRole } from "./types";
import { fingerprintSimilarity } from "./workbookFingerprint";

export type SmartMappingTemplateEntry = {
  segmentIndex: number;
  logicalGroupIndex: number;
  physicalColumns: string;
  role: SmartFieldRole;
  targetField: MappableFieldKey | null;
  confidence: number;
};

export type SmartImportMappingTemplate = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: WorkbookFingerprintProfile;
  mappings: SmartMappingTemplateEntry[];
  minSimilarity: number;
};

const STORAGE_KEY = "puantaj_smart_import_v2_templates_v1";
const MIN_APPLY_SIMILARITY = 72;

export function loadSmartImportTemplates(): SmartImportMappingTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SmartImportMappingTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSmartImportTemplates(templates: SmartImportMappingTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function saveSmartImportTemplate(template: SmartImportMappingTemplate): SmartImportMappingTemplate {
  const list = loadSmartImportTemplates();
  const idx = list.findIndex((t) => t.id === template.id);
  const next = { ...template, updatedAt: new Date().toISOString() };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  saveSmartImportTemplates(list);
  return next;
}

export function deleteSmartImportTemplate(id: string): void {
  saveSmartImportTemplates(loadSmartImportTemplates().filter((t) => t.id !== id));
}

export function suggestSmartImportTemplate(
  fingerprint: WorkbookFingerprintProfile,
): { template: SmartImportMappingTemplate; similarity: number } | null {
  let best: { template: SmartImportMappingTemplate; similarity: number } | null = null;
  for (const tpl of loadSmartImportTemplates()) {
    const similarity = fingerprintSimilarity(fingerprint, tpl.fingerprint);
    const threshold = tpl.minSimilarity ?? MIN_APPLY_SIMILARITY;
    if (similarity < threshold) continue;
    if (!best || similarity > best.similarity) best = { template: tpl, similarity };
  }
  return best;
}

export { MIN_APPLY_SIMILARITY };
