import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import catboost as cb
import pandas as pd
import joblib

app = Flask(__name__)
CORS(app) 

# โหลดโมเดลและข้อมูลประกอบ
BASE_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BASE_DIR, 'models', 'wildfire_improved_model_d.cbm')
SCALER_PATH = os.path.join(BASE_DIR, 'models', 'cluster_scaler.pkl')
KMEANS_PATH = os.path.join(BASE_DIR, 'models', 'cluster_kmeans.pkl')
BASELINE_PATH = os.path.join(BASE_DIR, 'data', 'baseline_table.csv')

model = cb.CatBoostClassifier()
cluster_scaler = None
cluster_kmeans = None
baseline_df = None
model_loaded = False

if os.path.exists(MODEL_PATH):
    try:
        model.load_model(MODEL_PATH)
        model_loaded = True
        print("✅ Model loaded successfully")
        
        if os.path.exists(SCALER_PATH):
            cluster_scaler = joblib.load(SCALER_PATH)
        if os.path.exists(KMEANS_PATH):
            cluster_kmeans = joblib.load(KMEANS_PATH)
        if os.path.exists(BASELINE_PATH):
            baseline_df = pd.read_csv(BASELINE_PATH)
            print("✅ Baseline and Clusters loaded")
    except Exception as e:
        print(f"❌ Error loading resources: {e}")
else:
    print(f"❌ Model file not found at: {MODEL_PATH}")

# รายชื่อฟีเจอร์ตามลำดับเป๊ะๆ (32 ฟีเจอร์)
FEATURE_NAMES = [
    'ndvi', 'ndwi', 'nbr', 'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
    'temp', 'soil_moisture', 'wind_u', 'wind_v', 'elev', 'slope', 'aspect',
    'landcover', 'month', 'NAME_1', 'NAME_2', 'veg_stress', 'fire_weather_idx',
    'wind_speed', 'drought_proxy', 'terrain_roughness', 'hot_dry_stress',
    'ndvi_anomaly', 'moisture_anomaly', 'temp_anomaly', 'month_sin', 'month_cos',
    'cluster_id'
]

@app.route('/')
def health():
    return jsonify({
        "status": "online", 
        "model_loaded": model_loaded,
        "resources": {
            "baseline": baseline_df is not None,
            "clustering": cluster_kmeans is not None
        },
        "message": "Ignis AI Backend is running with full pipeline"
    })

@app.route('/predict', methods=['POST'])
def predict():
    try:
        if not model_loaded:
            return jsonify({"error": "Model not loaded on server"}), 500

        data = request.json
        # รับ features (อาจเป็น list ของ list หรือ list ของ dict)
        raw_features = data.get('features', []) 
        is_simulation = data.get('isSimulation', False)
        
        if not raw_features:
            return jsonify({"error": "No features provided"}), 400

        # แปลงเป็น DataFrame เพื่อประมวลผล
        # กรณีส่งมาเป็น Array (32 ช่อง หรือน้อยกว่า) เราจะ Mapping ให้เข้าคู่กับ FEATURE_NAMES
        batch_data = []
        for p in raw_features:
            if isinstance(p, list):
                # ถ้าส่งมาเป็น list (เช่น จาก predict.js) ให้ Map เข้ากับชื่อฟีเจอร์หลัก
                p_dict = {name: p[i] if i < len(p) else 0 for i, name in enumerate(FEATURE_NAMES)}
                # ชื่อจังหวัด/อำเภอ อาจจะอยู่ใน index 18, 19
                p_dict['NAME_1'] = p_dict.get('NAME_1') or data.get('province')
                p_dict['NAME_2'] = p_dict.get('NAME_2') or data.get('district')
                batch_data.append(p_dict)
            else:
                batch_data.append(p)

        df = pd.DataFrame(batch_data)

        # --- STEP 1: Feature Engineering (คำนวณฟีเจอร์ที่ขาดหาย) ---
        df['temp'] = pd.to_numeric(df['temp'], errors='coerce').fillna(30)
        df['soil_moisture'] = pd.to_numeric(df['soil_moisture'], errors='coerce').fillna(0.15)
        df['ndvi'] = pd.to_numeric(df['ndvi'], errors='coerce').fillna(0.4)
        df['nir'] = pd.to_numeric(df['nir'], errors='coerce').fillna(0.35)
        df['swir1'] = pd.to_numeric(df['swir1'], errors='coerce').fillna(0.22)
        
        # คำนวณฟีเจอร์พื้นฐาน
        df['veg_stress'] = (df['swir1'] - df['nir']) / (df['swir1'] + df['nir'] + 1e-6)
        df['fire_weather_idx'] = df['temp'] * (1.0 - df['soil_moisture'].clip(0, 1))
        df['wind_speed'] = np.sqrt(df.get('wind_u', 0)**2 + df.get('wind_v', 0)**2)
        df['drought_proxy'] = (1.0 - df['ndvi'].clip(-1, 1)) * (1.0 - df['soil_moisture'].clip(0, 1))
        df['terrain_roughness'] = df['slope'] * np.log1p(df['elev'].clip(0))
        df['hot_dry_stress'] = df['temp'] * df['veg_stress']

        # --- STEP 2: Anomaly Calculation (ใช้ไฟล์ Baseline) ---
        df['ndvi_anomaly'] = 0.0
        df['moisture_anomaly'] = 0.0
        df['temp_anomaly'] = 0.0

        if baseline_df is not None:
            for i, row in df.iterrows():
                prov = str(row.get('NAME_1', '')).strip()
                month = int(row.get('month', 1))
                
                # ค้นหาในตาราง Baseline
                base = baseline_df[(baseline_df['NAME_1'].str.strip() == prov) & (baseline_df['month'] == month)]
                if not base.empty:
                    df.at[i, 'ndvi_anomaly'] = row['ndvi'] - base['ndvi_base'].values[0]
                    df.at[i, 'moisture_anomaly'] = row['soil_moisture'] - base['moisture_base'].values[0]
                    df.at[i, 'temp_anomaly'] = row['temp'] - base['temp_base'].values[0]

        # ในโหมดจำลอง ถ้า temp สูงมาก ให้เร่ง Anomaly เพื่อกระตุ้น AI
        if is_simulation:
            df['temp_anomaly'] = df.apply(lambda r: max(r['temp_anomaly'], r['temp'] - 28.0), axis=1)

        # --- STEP 3: Seasonal & Cluster Encoding ---
        df['month_sin'] = np.sin(2 * np.pi * df['month'].astype(int) / 12)
        df['month_cos'] = np.cos(2 * np.pi * df['month'].astype(int) / 12)
        
        df['cluster_id'] = "0"
        if cluster_scaler is not None and cluster_kmeans is not None:
            try:
                cluster_cols = ['elev', 'ndvi', 'soil_moisture', 'slope', 'temp']
                X_c = cluster_scaler.transform(df[cluster_cols])
                df['cluster_id'] = cluster_kmeans.predict(X_c).astype(str)
            except: pass

        # จัดลำดับคอลัมน์ให้ตรงกับที่โมเดลต้องการ
        # สำหรับ CatBoost: ประเภท Category ต้องเป็น String, ตัวเลขต้องเป็น Float/Int
        df_final = df[FEATURE_NAMES].copy()
        
        # แปลงประเภทข้อมูลให้ชัวร์
        cat_cols = ['landcover', 'NAME_1', 'NAME_2', 'cluster_id']
        for col in cat_cols:
            df_final[col] = df_final[col].astype(str)
            
        # ทำนายผล
        preds = model.predict_proba(df_final)
        probabilities = preds[:, 1].tolist()
        
        print(f"Predicted {len(probabilities)} points. Max prob: {max(probabilities):.4f}")
        
        return jsonify({
            "status": "success",
            "probabilities": probabilities
        })
    except Exception as e:
        import traceback
        print(f"❌ Prediction Error:\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
