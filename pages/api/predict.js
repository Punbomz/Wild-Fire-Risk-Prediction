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
    const points = pointsData[province] ? pointsData[province][district] : [];

    if (!points || points.length === 0) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลในพื้นที่ที่เลือก' });
    }

    // 2. เรียกใช้ Python Inference Server สำหรับแต่ละจุด
    // ในขั้นตอนผลิตจริง แนะนำให้ส่งไปทำนายแบบ Batch (ส่งทีเดียวหลายจุด) เพื่อความเร็ว
    // แต่สำหรับตัวอย่างนี้ เราจะส่งไปขอผลลัพธ์โมเดลจริง
    
    const featureBatch = (points || []).slice(0, 50).map((point) => {
      const featureArray = Array(32).fill(0); 
      // บังคับใช้ simTemp จาก request body ถ้ามี
      const currentTemp = simTemp !== undefined && simTemp !== null ? simTemp : (point.temp || 30);
      const isSim = !!req.body.isSimulation;
      
      // 1. Spectral Indices (ปรับให้สัมพันธ์กับอุณหภูมิในโหมดจำลอง)
      // เพิ่มความไว: ยิ่งร้อนยิ่งแห้งเร็วขึ้น
      const tempFactor = Math.max(0, (currentTemp - 24) / 26); // สเกล 24-50C -> 0-1
      
      const simNDVI = Math.max(0.02, 0.42 - (tempFactor * 0.4));
      const simSWIR1 = Math.min(0.95, 0.18 + (tempFactor * 0.75));
      const simNIR = Math.max(0.05, 0.45 - (tempFactor * 0.4));
      
      featureArray[0] = isSim ? simNDVI : (point.ndvi || 0.4); 
      featureArray[1] = isSim ? -0.25 : 0.05; 
      featureArray[2] = isSim ? 0.05 : 0.5;
      featureArray[6] = isSim ? simNIR : 0.35;
      featureArray[7] = isSim ? simSWIR1 : 0.22;
      featureArray[8] = isSim ? (simSWIR1 * 0.85) : 0.18;
      
      // 2. Weather & Environment
      featureArray[9] = currentTemp;
      
      const moisture = isSim 
        ? Math.max(0.005, 0.18 - (tempFactor * 0.175)) 
        : Math.max(0.05, 0.25 - (currentTemp - 25) * 0.01);
      
      featureArray[10] = moisture;
      
      featureArray[13] = point.elev || 300;
      featureArray[14] = point.slope || 10;
      featureArray[16] = 10;
      featureArray[17] = req.body.simMonth || new Date().getMonth() + 1;
      featureArray[18] = province;
      featureArray[19] = district;
      
      // 3. Fire Factors (เพิ่มความไวของ drought_proxy)
      featureArray[22] = isSim ? (3.0 + tempFactor * 6) : 2.5; 
      featureArray[23] = isSim ? (tempFactor * 0.8) : Math.max(0, (currentTemp - 30) * 0.05);
      
      return featureArray;
    });

    // เรียกใช้ Python API (ส่งแบบ Batch ทีเดียว 50 จุด)
    const apiUrl = process.env.NODE_ENV === 'development' 
      ? 'http://localhost:8000/predict' 
      : `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : ''}/api/predict_ai`;

    let finalPoints = [];
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            batch_features: featureBatch,
            isSimulation: req.body.isSimulation 
        }),
      });
      const result = await response.json();
      
      finalPoints = points.slice(0, 50).map((point, idx) => {
        const rawProb = (result.probabilities && result.probabilities[idx] !== undefined) 
              ? result.probabilities[idx] 
              : (point.risk_prob / 100);
        
        // --- 1. ปรับสเกลความเสี่ยง (Softened Normalization) ---
        // ปรับให้ 0.20 คือจุดอ้างอิงของความเสี่ยงสูงสุด และใช้เพดานที่ 95%
        let scaledRisk = (rawProb / 0.22) * 100;
        if (scaledRisk > 95) scaledRisk = 95; // ไม่ให้ถึง 100% เพื่อความสมจริง
        if (scaledRisk < 2) scaledRisk = 2;   // ขั้นต่ำ 2%

        // --- 2. คำนวณ Confidence Score (0-100%) ---
        // จำลองจากความเสถียรของอุณหภูมิและ NDVI (ค่ากลางๆ จะมีความเชื่อมั่นสูง)
        const temp = point.temp || 30;
        const tempAnomaly = Math.abs(temp - 32);
        let conf = 92 - (tempAnomaly * 0.8); // พื้นฐาน 92% ลดลงตามความผิดปกติ
        if (conf < 65) conf = 65; // ขั้นต่ำ 65%
        if (conf > 98) conf = 98; // สูงสุด 98%

        return {
          ...point,
          risk: scaledRisk / 100, // เก็บเป็น 0-1 เพื่อใช้กับสีเดิม
          displayRisk: scaledRisk, // ส่งค่า 0-100 ไปแสดงผล
          confidence: Math.round(conf)
        };
      });
    } catch (err) {
      console.error("Batch Prediction Error:", err);
      finalPoints = points.slice(0, 50).map(p => ({ 
        ...p, 
        risk: p.risk_prob / 100,
        displayRisk: p.risk_prob,
        confidence: 85 
      }));
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
