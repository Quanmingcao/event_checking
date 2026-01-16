import os
import cv2
import numpy as np
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from insightface.app import FaceAnalysis
from supabase import create_client, Client

app = Flask(__name__)
CORS(app)

# 1. Configuration
SUPABASE_URL = 'https://rqzdgearcsqoxikkbfeo.supabase.co'
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxemRnZWFyY3Nxb3hpa2tiZmVvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzc2MjU3NSwiZXhwIjoyMDgzMzM4NTc1fQ.esTHu5joEgj7SPL-d9F6St4pFfzwq2J8e4VRytKvYAg') 

# Initialize Supabase Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. Setup InsightFace
# Use slightly smaller model 'buffalo_l' or 'buffalo_s' (Scrub/Small)
# 'buffalo_l' is more accurate.
print("Loading InsightFace Model...")
face_app = FaceAnalysis(name='buffalo_l') 
face_app.prepare(ctx_id=0, det_size=(640, 640))
print("Model Loaded!")

# 3. In-memory Cache for Attendants
# Map: event_id -> { 'last_updated': timestamp, 'data': [attendants] }
attendants_cache = {}
CACHE_DURATION = 60 # seconds

def get_attendants(event_id):
    now = time.time()
    if event_id in attendants_cache:
        cached = attendants_cache[event_id]
        if now - cached['last_updated'] < CACHE_DURATION:
            return cached['data']
    
    print(f"Fetching attendants for event {event_id} from Supabase...")
    response = supabase.table('attendants').select('*').eq('event_id', event_id).not_.is_('face_descriptor', 'null').execute()
    data = response.data
    attendants_cache[event_id] = {
        'last_updated': now,
        'data': data
    }
    return data

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "message": "InsightFace Server Running"})

@app.route('/register', methods=['POST'])
def register():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
        
        file = request.files['file']
        file_bytes = np.frombuffer(file.read(), np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if img is None:
             return jsonify({"error": "Invalid image"}), 400

        faces = face_app.get(img)
        if len(faces) == 0:
            return jsonify({"error": "No face detected"}), 400
        
        # Take the largest face
        faces = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0]) * (x.bbox[3]-x.bbox[1]), reverse=True)
        target_face = faces[0]
        
        # Embedding needed to be serializable
        embedding = target_face.embedding.tolist()

        return jsonify({
            "status": "success",
            "embedding": embedding,
            "kps": target_face.kps.tolist()  # keypoints if needed
        })

    except Exception as e:
        print("Register Error:", e)
        return jsonify({"error": str(e)}), 500

@app.route('/recognize', methods=['POST'])
def recognize():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
        
        event_id = request.form.get('event_id')
        if not event_id:
            return jsonify({"error": "Missing event_id"}), 400

        file = request.files['file']
        file_bytes = np.frombuffer(file.read(), np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if img is None:
             return jsonify({"error": "Invalid image"}), 400

        start_time = time.time()
        faces = face_app.get(img)
        if len(faces) == 0:
            return jsonify({"found": False, "message": "No face detected"}), 200

        # Take largest face
        faces = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0]) * (x.bbox[3]-x.bbox[1]), reverse=True)
        target_face = faces[0]
        target_embedding = target_face.embedding # numpy array

        # Get candidates
        attendants = get_attendants(event_id)
        
        best_match = None
        max_score = 0.0
        SIMILARITY_THRESHOLD = 0.5 # Cosine Similarity Threshold

        for att in attendants:
            if not att.get('face_descriptor'):
                continue
            
            # Stored descriptor should be a list of floats
            stored_embedding = np.array(att['face_descriptor'], dtype=np.float32)
            
            # Compute Cosine Similarity
            # insightface embeddings are normalized, so just dot product
            # sim = np.dot(target_embedding, stored_embedding) 
            # (assuming stored is also from insightface and normalized)
            
            # To be safe, manual cosine similarity:
            norm_target = np.linalg.norm(target_embedding)
            norm_stored = np.linalg.norm(stored_embedding)
            
            if norm_target == 0 or norm_stored == 0:
                continue
                
            sim = np.dot(target_embedding, stored_embedding) / (norm_target * norm_stored)
            
            if sim > max_score:
                max_score = sim
                best_match = att

        print(f"Recognition Time: {time.time() - start_time:.4f}s - Best Score: {max_score}")

        if max_score > SIMILARITY_THRESHOLD and best_match:
            return jsonify({
                "found": True,
                "score": float(max_score),
                "attendant": best_match
            })
        else:
            return jsonify({
                "found": False,
                "score": float(max_score),
                "message": "Unknown face"
            })

    except Exception as e:
        print("Recognize Error:", e)
        return jsonify({"error": str(e)}), 500

@app.route('/admin/create-user', methods=['POST'])
def create_user():
    try:
        data = request.json
        email = data.get('email')
        password = data.get('password')
        full_name = data.get('full_name')

        if not email or not password or not full_name:
            return jsonify({"error": "Missing required fields"}), 400

        # 1. Create User in Supabase Auth
        # Using Service Role Key allows admin privileges
        res = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True, # Auto confirm
            "user_metadata": { "full_name": full_name }
        })

        # 2. Check if user created successfully
        # Python Supabase client returns an object with 'user' or 'data.user' depending on version
        # With supabase-py v2+, it returns UserResponse
        
        # We don't get 'error' dict like JS, it raises exception or returns data? 
        # Actually newer supabase-py might raise exception on error.
        # Let's verify the response structure. Usually res.user contains the user.

        user = res.user
        
        # 3. Create Profile (Optional if Trigger handles it, but safer to do explicitly if trigger fails or for robustness)
        # Note: We already have a trigger 'on_auth_user_created' in SQL that does this.
        # So we just rely on that trigger.
        
        return jsonify({
            "status": "success",
            "message": "User created successfully",
            "user_id": user.id,
            "email": user.email
        })

    except Exception as e:
        print("Create User Error:", e)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("Starting Flask Server on port 5000...")
    app.run(host='0.0.0.0', port=5000, debug=True)
