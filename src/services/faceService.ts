const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface RecognitionResult {
    found: boolean;
    score: number;
    message?: string;
    attendant?: any;
}

export const recognizeFace = async (imageBlob: Blob, eventId: string): Promise<RecognitionResult> => {
    const formData = new FormData();
    formData.append('file', imageBlob);
    formData.append('event_id', eventId);

    try {
        const response = await fetch(`${API_URL}/recognize`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Face Recognition API Error:", error);
        throw error;
    }
};

export const getFaceEmbedding = async (imageBlob: Blob): Promise<number[]> => {
    const formData = new FormData();
    formData.append('file', imageBlob);

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        return data.embedding; // 512-d array
    } catch (error) {
        console.error("Face Registration API Error:", error);
        throw error;
    }
};

// Helper: Resize image (Optional, but good for bandwidth)
// We keep this helper if we want to resize before sending to server
export const resizeImage = async (file: File | Blob, maxWidth = 800): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Canvas to Blob failed'));
                }, 'image/jpeg', 0.9);
            };
            img.src = event.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};
