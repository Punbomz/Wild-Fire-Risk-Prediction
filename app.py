import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import catboost as cb
import csv

app = Flask(__name__)
CORS(app) # สำคัญมาก! เพื่อให้ Vercel เรียกข้ามมาหา Render ได้

# โหลดโมเดล
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'wildfire_improved_model_d.cbm')
model = cb.CatBoostClassifier()
model_loaded = False

if os.path.exists(MODEL_PATH):
    try:
        model.load_model(MODEL_PATH)
        model_loaded = True
        print("✅ Model loaded successfully on Render")
    except Exception as e:
        print(f"❌ Error loading model: {e}")
else:
    print(f"❌ Model file not found at: {MODEL_PATH}")

@app.route('/')
def health():
    return jsonify({
        "status": "online", 
        "model_loaded": model_loaded,
        "model_path": MODEL_PATH,
        "message": "Ignis AI Backend is running"
    })

@app.route('/predict', methods=['POST'])
def predict():
    try:
        if not model_loaded:
            return jsonify({"error": "Model not loaded on server"}), 500

        data = request.json
        features = data.get('features', []) # รับอาเรย์ของฟีเจอร์ (Batch)
        
        if not features:
            return jsonify({"error": "No features provided"}), 400
            
        # ทำนายผล
        preds = model.predict_proba(features)
        probabilities = preds[:, 1].tolist()
        
        return jsonify({
            "status": "success",
            "probabilities": probabilities
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Render จะกำหนด Port ให้ผ่าน Environment Variable
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
