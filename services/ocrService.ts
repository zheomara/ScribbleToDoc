
import { GoogleGenAI } from "@google/genai";
import { OCRConfig } from '../types';

export const processImageOCR = async (
  imageUrl: string, 
  config: OCRConfig, 
  onProgress: (progress: number) => void,
  apiKey: string
): Promise<string> => {
  // We utilize a canvas to prepare the image and still support pre-processing options
  const img = new Image();
  img.src = imageUrl;
  
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.drawImage(img, 0, 0);

  // Apply grayscale and contrast enhancements which often help vision models with handwritten notes
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

  // Convert to high-quality JPEG for transmission to the Gemini API
  const processedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const base64Data = processedDataUrl.split(',')[1];

  // Report initial progress
  onProgress(0.2);

  if (!apiKey) {
    throw new Error("API Key is missing. Please enter your Google Gemini API Key.");
  }

  // Initialize the Gemini API client with the user-provided key
  const ai = new GoogleGenAI({ apiKey });

  try {
    // We use gemini-3-flash-preview for high speed and excellent vision-to-text capabilities
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
