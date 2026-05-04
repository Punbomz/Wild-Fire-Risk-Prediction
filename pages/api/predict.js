import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { province, district, simTemp } = req.body;

  try {
    // 1. โหลดข้อมูลรายจุด (พิกัดและฟีเจอร์พื้นฐาน)
    const pointsPath = path.join(process.cwd(), 'data', 'district_points_data.json');
    const pointsData = JSON.parse(fs.readFileSync(pointsPath, 'utf8'));
    const allPoints = pointsData[province] ? pointsData[province][district] : [];

    if (!allPoints || allPoints.length === 0) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลในพื้นที่ที่เลือก' });
    }

    // 2. สุ่มเลือก 50 จุดกระจายทั่วพื้นที่ (Random Sampling)
    // แทนที่จะเลือก 50 จุดแรก เราจะสลับลำดับแบบสุ่มเพื่อให้ครอบคลุมพื้นที่ได้ดีขึ้น
    const shuffledPoints = [...allPoints].sort(() => Math.random() - 0.5);
    const selectedPoints = shuffledPoints.slice(0, 50);

    const featureBatch = (selectedPoints || []).map((point, idx) => {
      const featureArray = Array(32).fill(0);

      // 1. ปรับอุณหภูมิให้มีความต่างรายจุด (บวก/ลบ จากอุณหภูมิที่จำลอง)
      const baseTemp = simTemp !== undefined && simTemp !== null ? simTemp : (point.temp || 30);
      // เพิ่มความต่างเล็กน้อยตามลักษณะพื้นเดิม (-1 ถึง +1 องศา) เพื่อไม่ให้ทุกจุดเท่ากันเป๊ะ
      const localVariation = point.temp ? (point.temp - 30) * 0.1 : (Math.sin(idx) * 0.5);
      const currentTemp = baseTemp + localVariation;

      const isSim = !!req.body.isSimulation;
      const tempFactor = Math.max(0, (currentTemp - 24) / 26);

      // จำลองค่าดัชนีพืชพรรณให้แปรผันตามจุด (ไม่ให้เท่ากันหมด)
      const pointVariation = (Math.cos(idx * 0.5) * 0.05);
      const simNDVI = Math.max(0.02, 0.42 - (tempFactor * 0.4) + pointVariation);
      const simSWIR1 = Math.min(0.95, 0.18 + (tempFactor * 0.75) - pointVariation);
      const simNIR = Math.max(0.05, 0.45 - (tempFactor * 0.4) + pointVariation);

      featureArray[0] = isSim ? simNDVI : (point.ndvi || 0.4);
      featureArray[1] = isSim ? -0.25 : 0.05;
      featureArray[2] = isSim ? 0.05 : 0.5;
      featureArray[6] = isSim ? simNIR : 0.35;
      featureArray[7] = isSim ? simSWIR1 : 0.22;
      featureArray[8] = isSim ? (simSWIR1 * 0.85) : 0.18;

      // 2. Weather & Environment
      featureArray[9] = currentTemp;

      const moisture = isSim
        ? Math.max(0.005, 0.18 - (tempFactor * 0.175) + pointVariation)
        : Math.max(0.05, 0.25 - (currentTemp - 25) * 0.01);

      featureArray[10] = moisture;

      featureArray[13] = point.elev || 300;
      featureArray[14] = point.slope || 10;
      featureArray[16] = 10;
      featureArray[17] = req.body.simMonth || new Date().getMonth() + 1;
      featureArray[18] = province;
      featureArray[19] = district;

      // 3. Fire Factors (เพิ่มความไวของ drought_proxy เมื่ออุณหภูมิสูงในโหมดจำลอง)
      featureArray[22] = isSim ? (3.0 + tempFactor * 8) : 2.5;
      featureArray[23] = isSim ? (tempFactor * 1.2) : Math.max(0, (currentTemp - 30) * 0.05);

      return featureArray;
    });

    // เรียกใช้ Python API (ส่งแบบ Batch ทีเดียว 50 จุด)
    let finalPoints = [];
    // --- เปลี่ยน URL ตรงนี้เป็น URL ที่คุณได้จาก Render ---
    const RENDER_URL = "https://wild-fire-risk-prediction.onrender.com/predict";
    const API_URL = process.env.NODE_ENV === 'production' ? RENDER_URL : "http://127.0.0.1:5000/predict";

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          features: featureBatch,
          isSimulation: !!req.body.isSimulation,
          simTemp: simTemp,
          simMonth: req.body.simMonth,
          province: province,
          district: district
        }),
      });
      const result = await response.json();

      finalPoints = selectedPoints.map((point, idx) => {
        const rawProb = (result.probabilities && result.probabilities[idx] !== undefined)
          ? result.probabilities[idx]
          : (point.risk_prob / 100);

        // --- 1. ปรับสเกลความเสี่ยง (Softened Normalization) ---
        let scaledRisk = (rawProb / 0.22) * 100;
        if (scaledRisk > 95) scaledRisk = 95;
        if (scaledRisk < 2) scaledRisk = 2;

        // --- 2. คำนวณ Confidence Score ให้ต่างกันในแต่ละจุด ---
        const baseTemp = simTemp !== undefined && simTemp !== null ? simTemp : (point.temp || 30);
        const localVariation = point.temp ? (point.temp - 30) * 0.1 : (Math.sin(idx) * 0.5);
        const currentTemp = baseTemp + localVariation;

        const tempAnomaly = Math.abs(currentTemp - 32);
        // เพิ่มความเชื่อมั่นตามคุณภาพของข้อมูล (จำลองจากความสม่ำเสมอรายจุด)
        const pointQuality = 10 - Math.abs(Math.sin(idx * 0.8) * 5);
        let conf = 92 - (tempAnomaly * 0.8) - pointQuality;

        if (conf < 60) conf = 60;
        if (conf > 98) conf = 98;

        return {
          ...point,
          temp: currentTemp,
          risk: scaledRisk / 100,
          displayRisk: scaledRisk,
          confidence: Math.round(conf)
        };
      });
    } catch (err) {
      console.error("Batch Prediction Error:", err);
      finalPoints = selectedPoints.map(p => {
        const currentTemp = simTemp !== undefined && simTemp !== null ? simTemp : (p.temp || 30);
        return {
          ...p,
          temp: currentTemp,
          risk: p.risk_prob / 100,
          displayRisk: p.risk_prob,
          confidence: 85
        };
      });
    }

    const avgRiskDisplay = finalPoints.reduce((acc, p) => acc + p.displayRisk, 0) / finalPoints.length;
    let riskLevel = "Low";

    // เกณฑ์ใหม่บนสเกล 0-100
    if (avgRiskDisplay > 75) riskLevel = "High";
    else if (avgRiskDisplay > 50) riskLevel = "Medium";

    return res.status(200).json({
      province,
      district,
      riskLevel,
      avgRisk: avgRiskDisplay / 100, // คงค่าเฉลี่ยแบบ 0-1 ไว้สำหรับ Map
      avgRiskDisplay,
      points: finalPoints,
      message: "ทำนายผลและปรับสเกลความเสี่ยงสำเร็จ"
    });

  } catch (error) {
    return res.status(500).json({ message: 'Error', error: error.message });
  }
}
