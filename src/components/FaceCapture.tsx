import React, { useRef, useState, useEffect } from 'react';
import { Camera, Upload, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { getFaceEmbedding, resizeImage } from '../services/faceService';

interface FaceCaptureProps {
    onCapture: (blob: Blob, embedding: number[]) => void;
}

export const FaceCapture: React.FC<FaceCaptureProps> = ({ onCapture }) => {
    const [mode, setMode] = useState<'initial' | 'camera' | 'preview'>('initial');
    const [isModelsLoaded, setIsModelsLoaded] = useState(true); // Always true now
    const [isAnalysing, setIsAnalysing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [imgSrc, setImgSrc] = useState<string | null>(null);
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Cleanup camera on unmount
    useEffect(() => {
        return () => {
            stopCamera();
        };
    }, []);

    const startCamera = async () => {
        try {
            setMode('camera');
            setError(null);
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'user', width: { ideal: 1280 } } 
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            setError('Could not access camera. Please allow permissions.');
            setMode('initial');
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    };

    const capturePhoto = () => {
        if (!videoRef.current) return;

        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw video (mirrored if user facing, usually handled by CSS, but output should be normal)
        // For simplicity, we draw as is.
        ctx.drawImage(video, 0, 0);

        canvas.toBlob(async (blob) => {
            if (blob) {
                const url = URL.createObjectURL(blob);
                setImgSrc(url);
                setMode('preview');
                stopCamera();
                processFace(blob, url);
            }
        }, 'image/jpeg');
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setError(null);
            setIsAnalysing(true);
            
            // Resize if too big (optimize for mobile packages)
            const processedBlob = await resizeImage(file);
            const url = URL.createObjectURL(processedBlob);
            
            setImgSrc(url);
            setMode('preview');
            processFace(processedBlob, url);
        } catch (err) {
            setError('Error processing file.');
            setIsAnalysing(false);
        }
    };

    const processFace = async (blob: Blob, url: string) => {
        setIsAnalysing(true);
        setError(null);
        
        try {
            // Call Python API to get embedding
            const embedding = await getFaceEmbedding(blob);
            
            if (embedding && embedding.length > 0) {
                onCapture(blob, embedding);
                setIsAnalysing(false);
            } else {
                setError('No face detected. Please try again.');
                setIsAnalysing(false);
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'AI detection failed.');
            setIsAnalysing(false);
        }
    };

    const handleRetake = () => {
        setImgSrc(null);
        setMode('initial');
        setError(null);
        setIsAnalysing(false);
    };

    if (!isModelsLoaded) {
        return <div className="text-center p-8">Loading AI Models...</div>;
    }

    return (
        <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Capture Face</h3>

                {/* ERROR MESSAGE */}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg flex items-center gap-2">
                        <AlertCircle size={20} />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                {/* MODE: INITIAL */}
                {mode === 'initial' && (
                    <div className="grid grid-cols-2 gap-4">
                        <button 
                            onClick={startCamera}
                            className="flex flex-col items-center justify-center p-8 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors gap-3 border-2 border-blue-100"
                        >
                            <Camera size={32} className="text-blue-600" />
                            <span className="font-semibold text-blue-800">Use Camera</span>
                        </button>

                        <label className="flex flex-col items-center justify-center p-8 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors gap-3 border-2 border-purple-100 cursor-pointer">
                            <Upload size={32} className="text-purple-600" />
                            <span className="font-semibold text-purple-800">Upload Photo</span>
                            <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={handleFileUpload}
                            />
                        </label>
                    </div>
                )}

                {/* MODE: CAMERA */}
                {mode === 'camera' && (
                    <div className="relative bg-black rounded-lg overflow-hidden aspect-[4/3]">
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            className="w-full h-full object-cover"
                        />
                        <button 
                            onClick={capturePhoto}
                            className="absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-16 bg-white rounded-full border-4 border-gray-200 shadow-xl active:scale-95 transition-transform"
                        />
                        <button 
                            onClick={() => { stopCamera(); setMode('initial'); }}
                            className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full backdrop-blur-sm"
                        >
                            <RefreshCw size={20} />
                        </button>
                    </div>
                )}

                {/* MODE: PREVIEW / ANALYSING */}
                {mode === 'preview' && imgSrc && (
                    <div className="relative rounded-lg overflow-hidden bg-gray-100">
                        <img src={imgSrc} alt="Preview" className="w-full h-auto" />
                        
                        {isAnalysing && (
                            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                                <RefreshCw className="animate-spin mb-2" size={32} />
                                <span className="font-medium">Analysing face...</span>
                            </div>
                        )}

                        {!isAnalysing && !error && (
                            <div className="absolute inset-x-0 bottom-0 bg-green-500/90 p-3 text-white flex items-center justify-center gap-2">
                                <CheckCircle size={20} />
                                <span className="font-medium">Face Detected!</span>
                            </div>
                        )}
                    </div>
                )}

                {/* ACTIONS (Only in Preview) */}
                {mode === 'preview' && !isAnalysing && (
                    <div className="mt-4 flex justify-center">
                        <button 
                            onClick={handleRetake}
                            className="text-gray-500 font-medium hover:text-gray-700 underline"
                        >
                            Retake Photo
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
