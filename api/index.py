import os
# แก้ไขปัญหา Windows Error 0xc06d007f โดยการจำกัด Threading
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

from flask import Flask, request, jsonify
import pandas as pd
import catboost as cb
import os

import joblib
import numpy as np

app = Flask(__name__)

# โหลดโมเดลและข้อมูลประกอบ
BASE_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BASE_DIR, "..", "models", "wildfire_improved_model_d.cbm")
SCALER_PATH = os.path.join(BASE_DIR, "..", "models", "cluster_scaler.pkl")
KMEANS_PATH = os.path.join(BASE_DIR, "..", "models", "cluster_kmeans.pkl")
BASELINE_PATH = os.path.join(BASE_DIR, "..", "data", "baseline_table.csv")

model = None
cluster_scaler = None
cluster_kmeans = None
baseline_df = None

def load_resources():
    global model, cluster_scaler, cluster_kmeans, baseline_df
    if model is None and os.path.exists(MODEL_PATH):
        model = cb.CatBoostClassifier()
        model.load_model(MODEL_PATH)
    if cluster_scaler is None and os.path.exists(SCALER_PATH):
        cluster_scaler = joblib.load(SCALER_PATH)
    if cluster_kmeans is None and os.path.exists(KMEANS_PATH):
        cluster_kmeans = joblib.load(KMEANS_PATH)
    if baseline_df is None and os.path.exists(BASELINE_PATH):
        baseline_df = pd.read_csv(BASELINE_PATH)
    return model

# รายชื่อฟีเจอร์ตามลำดับเป๊ะๆ (32 ฟีเจอร์)
FEATURE_NAMES = [
    'ndvi', 'ndwi', 'nbr', 'blue', 'green', 'red', 'nir', 'swir1', 'swir2',
    'temp', 'soil_moisture', 'wind_u', 'wind_v', 'elev', 'slope', 'aspect',
    'landcover', 'month', 'NAME_1', 'NAME_2', 'veg_stress', 'fire_weather_idx',
    'wind_speed', 'drought_proxy', 'terrain_roughness', 'hot_dry_stress',
    'ndvi_anomaly', 'moisture_anomaly', 'temp_anomaly', 'month_sin', 'month_cos',
    'cluster_id'
]

@app.route("/predict", methods=["POST"])
@app.route("/api/predict_ai", methods=["POST"])
def predict():
    try:
        print("--- Start Prediction Pipeline ---")
        m = load_resources()
        if m is None:
            return jsonify({"error": "Model not found"}), 500
        
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400

        # 1. Normalize input to batch format
        is_batch = "batch_features" in data
        is_simulation = data.get("isSimulation", False)
        
        if is_batch:
            raw_batch = data["batch_features"]
        else:
            point = data.get("features", data)
            raw_batch = [point]

        if not raw_batch:
            return jsonify({"error": "No features provided"}), 400

        # Convert list format to dict format
        batch_features = []
        for p in raw_batch:
            if isinstance(p, list):
                p_dict = {name: p[i] if i < len(p) else 0 for i, name in enumerate(FEATURE_NAMES)}
                p_dict['province'] = p_dict.get('NAME_1')
                p_dict['district'] = p_dict.get('NAME_2')
                batch_features.append(p_dict)
            else:
                batch_features.append(p)

        print(f"Processing {len(batch_features)} points (Simulation: {is_simulation})...")

        # --- STEP 1: Anomaly & Physics-based Features ---
        for p in batch_features:
            # Basic values
            temp = float(p.get('temp', 30))
            moisture = float(p.get('soil_moisture', 0.15))
            ndvi = float(p.get('ndvi', 0.4))
            swir1 = float(p.get('swir1', 0.22))
            nir = float(p.get('nir', 0.35))
            u = float(p.get('wind_u', 2.0))
            v = float(p.get('wind_v', 2.0))
            slope = float(p.get('slope', 10))
            elev = float(p.get('elev', 300))

            # Derived features
            p['veg_stress'] = (swir1 - nir) / (swir1 + nir + 1e-6)
            p['fire_weather_idx'] = temp * (1.0 - max(0, min(1, moisture)))
            p['wind_speed'] = np.sqrt(u**2 + v**2)
            p['drought_proxy'] = (1.0 - max(-1, min(1, ndvi))) * (1.0 - max(0, min(1, moisture)))
            p['terrain_roughness'] = slope * np.log1p(max(0, elev))
            p['hot_dry_stress'] = temp * p['veg_stress']

            # Anomalies
            p['ndvi_anomaly'] = 0.0
            p['moisture_anomaly'] = 0.0
            p['temp_anomaly'] = 0.0
            
            if baseline_df is not None:
                prov = str(p.get('province', '')).strip()
                month = int(p.get('month', 1))
                base = baseline_df[(baseline_df['NAME_1'].str.strip() == prov) & (baseline_df['month'] == month)]
                if base.empty:
                    base = baseline_df[(baseline_df['NAME_1'].str.strip().str.lower() == prov.lower()) & (baseline_df['month'] == month)]
                
                if not base.empty:
                    p['ndvi_anomaly'] = ndvi - base['ndvi_base'].values[0]
                    p['moisture_anomaly'] = moisture - base['moisture_base'].values[0]
                    p['temp_anomaly'] = temp - base['temp_base'].values[0]
            
            # Boost anomalies in simulation mode to trigger AI sensitivity
            if is_simulation:
                p['temp_anomaly'] = max(p['temp_anomaly'], temp - 25.0)
                p['moisture_anomaly'] = min(p['moisture_anomaly'], moisture - 0.25)

        # --- STEP 2: Seasonal Encoding ---
        print("Step 2: Encoding Seasonality...")
        for p in batch_features:
            m_val = int(p.get('month', 1))
            p['month_sin'] = np.sin(2 * np.pi * m_val / 12)
            p['month_cos'] = np.cos(2 * np.pi * m_val / 12)

        # --- STEP 3: Cluster ID ---
        print("Step 3: Predicting Cluster ID...")
        p['cluster_id'] = "0"
        if cluster_scaler is not None and cluster_kmeans is not None:
            try:
                cluster_cols = ['elev', 'ndvi', 'soil_moisture', 'slope', 'temp']
                c_data = [[float(p.get(col, 0)) for col in cluster_cols] for p in batch_features]
                X_c = cluster_scaler.transform(c_data)
                clusters = cluster_kmeans.predict(X_c)
                for i, p in enumerate(batch_features):
                    p['cluster_id'] = str(clusters[i])
            except Exception as ce:
                print(f"⚠️ Clustering Skip: {ce}")

        # --- STEP 4: CatBoost Inference ---
        print("Step 4: Running CatBoost...")
        batch_rows = []
        for p in batch_features:
            # Ensure categorical features are strings, others are floats
            row = [
                float(p.get('ndvi', 0)), float(p.get('ndwi', 0)), float(p.get('nbr', 0)),
                float(p.get('blue', 0)), float(p.get('green', 0)), float(p.get('red', 0)),
                float(p.get('nir', 0)), float(p.get('swir1', 0)), float(p.get('swir2', 0)),
                float(p.get('temp', 0)), float(p.get('soil_moisture', 0)), float(p.get('wind_u', 0)),
                float(p.get('wind_v', 0)), float(p.get('elev', 0)), float(p.get('slope', 0)),
                float(p.get('aspect', 0)), str(int(float(p.get('landcover', 0)))), int(p.get('month', 1)),
                str(p.get('province', 'Unknown')), str(p.get('district', 'Unknown')),
                float(p.get('veg_stress', 0)), float(p.get('fire_weather_idx', 0)),
                float(p.get('wind_speed', 0)), float(p.get('drought_proxy', 0)),
                float(p.get('terrain_roughness', 0)), float(p.get('hot_dry_stress', 0)),
                float(p.get('ndvi_anomaly', 0)), float(p.get('moisture_anomaly', 0)),
                float(p.get('temp_anomaly', 0)), float(p.get('month_sin', 0)),
                float(p.get('month_cos', 0)), str(p.get('cluster_id', '0'))
            ]
            batch_rows.append(row)

        df_final = pd.DataFrame(batch_rows, columns=FEATURE_NAMES)
        
        # LOGGING: Check Point 0 features
        if not df_final.empty:
            print(f"--- Feature Verification (Point 0) ---")
            check_cols = ['ndvi', 'temp', 'soil_moisture', 'fire_weather_idx', 'drought_proxy', 'NAME_1', 'cluster_id']
            for c in check_cols:
                print(f"  {c}: {df_final.iloc[0][c]}")

        probs = model.predict_proba(df_final)[:, 1]
        results = [float(pr) for pr in probs]

        # ENHANCED STRESS TEST
        # Simulate extreme conditions and RECALCULATE all derived features
        s_ndvi, s_temp, s_moisture = 0.1, 55.0, 0.01
        s_swir1, s_nir = 0.6, 0.1
        s_veg_stress = (s_swir1 - s_nir) / (s_swir1 + s_nir + 1e-6)
        
        stress_sample = {
            'ndvi': s_ndvi, 'ndwi': 0.0, 'nbr': 0.8, 'blue': 0.05, 'green': 0.05, 'red': 0.1,
            'nir': s_nir, 'swir1': s_swir1, 'swir2': 0.5, 'temp': s_temp, 'soil_moisture': s_moisture,
            'wind_u': 3.0, 'wind_v': 3.0, 'elev': 500.0, 'slope': 15.0, 'aspect': 180.0,
            'landcover': '30', 'month': 4, 'NAME_1': str(df_final.iloc[0]['NAME_1']), 
            'NAME_2': str(df_final.iloc[0]['NAME_2']),
            'veg_stress': s_veg_stress,
            'fire_weather_idx': s_temp * (1.0 - s_moisture),
            'wind_speed': 4.24,
            'drought_proxy': (1.0 - s_ndvi) * (1.0 - s_moisture),
            'terrain_roughness': 15.0 * np.log1p(500),
            'hot_dry_stress': s_temp * s_veg_stress,
            'ndvi_anomaly': -0.3, 'moisture_anomaly': -0.2, 'temp_anomaly': 25.0,
            'month_sin': 0.866, 'month_cos': -0.5, 'cluster_id': str(df_final.iloc[0]['cluster_id'])
        }
        
        # Convert dict to ordered list for CatBoost
        stress_row = [stress_sample[name] for name in FEATURE_NAMES]
        stress_prob = model.predict_proba(pd.DataFrame([stress_row], columns=FEATURE_NAMES))[0][1]
        print(f"🔥 STRESS TEST (Extreme Hot/Dry/Anomaly): {stress_prob:.4f}")

        if is_batch:
            return jsonify({"probabilities": results, "status": "success"})
        else:
            return jsonify({
                "probability": results[0], 
                "status": "success",
                "debug": {
                    "temp_anomaly": batch_features[0].get('temp_anomaly'),
                    "prob": results[0]
                }
            })

    except Exception as e:
        import traceback
        print(f"❌ API Error:\n{traceback.format_exc()}")
        return jsonify({"error": str(e), "status": "error"}), 500

if __name__ == "__main__":
    app.run(port=8000)
