
import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw } from 'lucide-react';

interface Props {
  onCapture: (blob: Blob) => void;
}

const CameraCapture: React.FC<Props> = ({ onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' },
          audio: false 
        });
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      } catch (err) {
        setError('Camera access denied or not available.');
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const captureFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) onCapture(blob);
        }, 'image/jpeg', 0.95);
      }
    }
  };

  return (
    <div className="flex flex-col items-center bg-black">
      <div className="relative w-full aspect-[4/3] bg-black">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-white p-6 text-center">
            {error}
          </div>
        ) : (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-contain"
          />
        )}
      </div>
      <div className="w-full p-8 bg-white dark:bg-slate-900 flex justify-center gap-6">
        <button 
          onClick={captureFrame}
          disabled={!!error}
          className="w-16 h-16 rounded-full bg-primary-600 flex items-center justify-center shadow-lg active:scale-90 transition-transform disabled:opacity-50"
        >
          <div className="w-12 h-12 rounded-full border-4 border-white" />
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraCapture;
