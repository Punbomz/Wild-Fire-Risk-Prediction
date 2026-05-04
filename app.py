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
if os.path.exists(MODEL_PATH):
    model.load_model(MODEL_PATH)
    print("✅ Model loaded successfully on Render")

@app.route('/')
def health():
    return jsonify({"status": "online", "message": "Ignis AI Backend is running on Render"})

@app.route('/predict', methods=['POST'])
def predict():
    try:
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
