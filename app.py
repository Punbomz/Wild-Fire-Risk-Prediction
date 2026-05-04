import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import catboost as cb
import pandas as pd

app = Flask(__name__)
CORS(app) 

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
        "message": "Ignis AI Backend is running"
    })

@app.route('/predict', methods=['POST'])
def predict():
    try:
        if not model_loaded:
            return jsonify({"error": "Model not loaded on server"}), 500

        data = request.json
        features = data.get('features', []) 
        
        if not features:
            return jsonify({"error": "No features provided"}), 400
            
        # ใช้ Pandas DataFrame เพื่อให้ CatBoost จัดการเรื่องประเภทข้อมูล (เช่น String) ได้ดีขึ้น
        df = pd.DataFrame(features)
        
        # ทำนายผล
        preds = model.predict_proba(df)
        probabilities = preds[:, 1].tolist()
        
        # Log สำหรับ Debug (ดูใน Render Dashboard)
        print(f"Predicted {len(probabilities)} points. First 5 probs: {probabilities[:5]}")
        
        return jsonify({
            "status": "success",
            "probabilities": probabilities
        })
    except Exception as e:
        print(f"❌ Prediction Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
