
export interface BatchImage {
  id: string;
  file: File | Blob;
  previewUrl: string;
  processedText?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
}

export interface OCRConfig {
  language: string;
  grayscale: boolean;
  contrast: number;
  threshold: number;
}
