
export interface ScanResult {
  fileName: string;
  match: boolean;
  confidence: number;
  handle: FileSystemFileHandle;
  previewUrl: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  INITIALIZING = 'INITIALIZING',
  SCANNING = 'SCANNING',
  ORGANIZING = 'ORGANIZING',
  COMPLETED = 'COMPLETED'
}

export interface PersonProfile {
  description: string;
  originalImage: string;
}
