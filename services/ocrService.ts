
import { GoogleGenAI } from "@google/genai";
import { OCRConfig } from '../types';

export const processImageOCR = async (
  imageUrl: string, 
  config: OCRConfig, 
  onProgress: (progress: number) => void,
  apiKey: string
): Promise<string> => {
  const img = new Image();
  img.src = imageUrl;
  
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  // Performance Optimization: Resize huge images
  // Cameras often capture 12MP+ (4000x3000). 
  // Resizing to max dimension 1536px reduces pixel count by ~6-8x, 
  // dramatically speeding up canvas ops and network upload 
  // while maintaining enough resolution for handwriting recognition.
  const MAX_DIMENSION = 1536;
  let width = img.width;
  let height = img.height;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_DIMENSION) / width);
      width = MAX_DIMENSION;
    } else {
      width = Math.round((width * MAX_DIMENSION) / height);
      height = MAX_DIMENSION;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Could not get canvas context");

  // Draw scaled image
  ctx.drawImage(img, 0, 0, width, height);

  // Apply grayscale and contrast enhancements
  if (config.grayscale) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const contrastFactor = config.contrast;
      const newValue = (avg - 128) * contrastFactor + 128;
      data[i] = data[i+1] = data[i+2] = newValue;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Convert to JPEG with reasonable quality (0.85 is a sweet spot for size/quality)
  const processedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const base64Data = processedDataUrl.split(',')[1];

  // Report initial progress
  onProgress(0.3);

  if (!apiKey) {
    throw new Error("API Key is missing. Please enter your Google Gemini API Key.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          },
          {
            text: `Transcribe the handwritten text in this image accurately. 
            Maintain original paragraphs and structure. 
            Language: ${config.language}. 
            Output ONLY the transcribed text without any greetings or explanations.`
          },
        ],
      },
    });

    onProgress(1.0);
    return response.text || "No text detected in the image.";
  } catch (error) {
    console.error("OCR process failed with Gemini API:", error);
    throw new Error("Failed to extract text. Please check your API Key and internet connection.");
  }
};
