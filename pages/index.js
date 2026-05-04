import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import Header from "../components/layout/Header";
import SidebarFilters from "../components/filters/SidebarFilters";

const MapView = dynamic(() => import("../components/map/MapView"), { ssr: false });

export default function DashboardPage() {
  const [predictionResult, setPredictionResult] = useState(null);
  const [geoData, setGeoData] = useState(null);
  const [provData, setProvData] = useState(null);
  const [selectedProvince, setSelectedProvince] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [districtRisk, setDistrictRisk] = useState({});
  const [simTemp, setSimTemp] = useState(30);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    // ปิด sidebar อัตโนมัติถ้าเปิดในมือถือครั้งแรก
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }

    fetch("/data/north_districts.geojson")
      .then((r) => r.json())
      .then(setGeoData)
      .catch(console.error);
    fetch("/data/north_provinces.geojson")
      .then((r) => r.json())
      .then(setProvData)
      .catch(console.error);
  }, []);

  const handleProvinceChange = (province) => {
    if (province !== selectedProvince) {
      setSelectedProvince(province);
      setSelectedDistrict("");
      setPredictionResult(null);
    }
  };

  const handleDistrictChange = (district) => {
    if (district !== selectedDistrict) {
      setSelectedDistrict(district);
      setPredictionResult(null);
    }
  };

  const handlePredictResult = (result) => {
    setPredictionResult(result);
    if (window.innerWidth < 768) setIsSidebarOpen(false); // ปิด sidebar หลังกดทำนายในมือถือ
    if (result && result.avgRisk !== undefined) {
      setDistrictRisk((prev) => {
        const next = { ...prev };
        if (!next[result.province]) next[result.province] = {};
        next[result.province][result.district] = result.avgRisk;
        return next;
      });
    }
  };

  return (
    <>
      <Header />
      
      {/* ปุ่ม Toggle สำหรับมือถือ */}
      <button 
        className={`mobile-toggle ${isSidebarOpen ? 'active' : ''}`}
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? "✕" : "☰"}
      </button>

      <div className="container">
        <div className={`sidebar-wrapper ${isSidebarOpen ? 'open' : 'closed'}`}>
          <SidebarFilters
            geoData={geoData}
            selectedProvince={selectedProvince}
            selectedDistrict={selectedDistrict}
            onProvinceChange={handleProvinceChange}
            onDistrictChange={handleDistrictChange}
            onPredict={handlePredictResult}
            predictionResult={predictionResult}
            simTemp={simTemp}
            onSimTempChange={setSimTemp}
          />
        </div>
        
        <div className="map-main-wrapper">
          <MapView
            geoData={geoData}
            provData={provData}
            selectedProvince={selectedProvince}
            selectedDistrict={selectedDistrict}
            districtRisk={districtRisk}
            predictionResult={predictionResult}
            onProvinceClick={handleProvinceChange}
            onDistrictClick={handleDistrictChange}
          />
        </div>
      </div>

      <style jsx>{`
        .container {
          display: flex;
          height: calc(100vh - 60px);
          overflow: hidden;
          position: relative;
        }

        .sidebar-wrapper {
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 2000;
        }

        .map-main-wrapper {
          flex: 1;
          height: 100%;
          position: relative;
        }

        .mobile-toggle {
          display: none;
          position: fixed;
          bottom: 25px;
          left: 25px;
          width: 56px;
          height: 56px;
          background: #f97316;
          color: white;
          border-radius: 50%;
          border: none;
          font-size: 24px;
          box-shadow: 0 4px 20px rgba(249, 115, 22, 0.4);
          z-index: 3000;
          cursor: pointer;
          transition: all 0.3s;
        }

        @media (max-width: 767px) {
          .mobile-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .sidebar-wrapper {
            position: absolute;
            left: 0;
            top: 0;
            height: 100%;
          }

          .sidebar-wrapper.closed {
            transform: translateX(-100%);
          }

          .sidebar-wrapper.open {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}