import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import Header from "../components/layout/Header";
import SidebarFilters from "../components/filters/SidebarFilters";
import FloatingMobileNav from "../components/layout/FloatingMobileNav";

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
  const [isLoading, setIsLoading] = useState(false);

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

  const handlePerformPrediction = async (simOptions = {}) => {
    if (!selectedProvince || !selectedDistrict) return;
    
    setIsLoading(true);
    try {
      const response = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          province: selectedProvince, 
          district: selectedDistrict,
          simTemp: simOptions.isSimMode ? simTemp : null,
          simMonth: simOptions.isSimMode ? simOptions.simMonth : (new Date().getMonth() + 1),
          isSimulation: simOptions.isSimMode
        }),
      });
      
      if (!response.ok) throw new Error("AI Server Error");
      
      const data = await response.json();
      setPredictionResult(data);
      
      if (data && data.avgRisk !== undefined) {
        setDistrictRisk((prev) => {
          const next = { ...prev };
          if (!next[data.province]) next[data.province] = {};
          next[data.province][data.district] = data.avgRisk;
          return next;
        });
      }
    } catch (error) {
      console.error("Prediction failed:", error);
      alert("❌ Prediction Failed: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Header />
      
      {/* Sidebar for Desktop */}
      <div className="container">
        <div className={`sidebar-wrapper ${isSidebarOpen ? 'open' : 'closed'}`}>
          <SidebarFilters
            geoData={geoData}
            selectedProvince={selectedProvince}
            selectedDistrict={selectedDistrict}
            onProvinceChange={handleProvinceChange}
            onDistrictChange={handleDistrictChange}
            onPredict={handlePerformPrediction}
            predictionResult={predictionResult}
            simTemp={simTemp}
            onSimTempChange={setSimTemp}
            isLoading={isLoading}
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

      {/* Floating Mobile Navigation */}
      <FloatingMobileNav
        geoData={geoData}
        selectedProvince={selectedProvince}
        selectedDistrict={selectedDistrict}
        onProvinceChange={handleProvinceChange}
        onDistrictChange={handleDistrictChange}
        onPredict={handlePerformPrediction}
        simTemp={simTemp}
        onSimTempChange={setSimTemp}
        isLoading={isLoading}
      />

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

        @media (max-width: 767px) {
          .container {
            height: calc(100vh - 60px);
          }

          .sidebar-wrapper {
            display: none; /* เอา sidebar ออกในมือถือ */
          }

          .map-main-wrapper {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}