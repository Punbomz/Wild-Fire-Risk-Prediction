import { useEffect, useState } from "react";

export default function SidebarFilters({
  geoData,
  selectedProvince,
  selectedDistrict,
  onProvinceChange,
  onDistrictChange,
  onPredict,
  predictionResult,
  simTemp,
  onSimTempChange,
}) {
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSimMode, setIsSimMode] = useState(false);
  const [simMonth, setSimMonth] = useState(new Date().getMonth() + 1);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!geoData) return;
    const provSet = new Set();
    geoData.features.forEach((f) => provSet.add(f.properties.NAME_1));
    setProvinces(Array.from(provSet).sort());
  }, [geoData]);

  useEffect(() => {
    if (!selectedProvince || !geoData) {
      setDistricts([]);
      return;
    }
    const dists = geoData.features
      .filter((f) => f.properties.NAME_1 === selectedProvince)
      .map((f) => f.properties.NAME_2)
      .sort();
    setDistricts(dists);
  }, [selectedProvince, geoData]);

  const handlePredict = async () => {
    if (!selectedProvince || !selectedDistrict) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          province: selectedProvince, 
          district: selectedDistrict,
          simTemp: isSimMode ? simTemp : null,
          simMonth: isSimMode ? simMonth : (new Date().getMonth() + 1),
          isSimulation: isSimMode
        }),
      });
      
      if (!response.ok) {
        throw new Error("AI Server Error: Could not generate prediction.");
      }
      
      const data = await response.json();
      if (onPredict) onPredict(data);
    } catch (error) {
      console.error("Prediction failed:", error);
      setError(error.message);
      alert("❌ Prediction Failed: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const months = [
    { id: 1, name: "Jan" }, { id: 2, name: "Feb" }, { id: 3, name: "Mar" }, 
    { id: 4, name: "Apr" }, { id: 5, name: "May" }, { id: 6, name: "Jun" }, 
    { id: 7, name: "Jul" }, { id: 8, name: "Aug" }, { id: 9, name: "Sep" }, 
    { id: 10, name: "Oct" }, { id: 11, name: "Nov" }, { id: 12, name: "Dec" }
  ];

  return (
    <div className="sidebar-container no-scrollbar">
      {/* Brand Section */}
      <div className="brand-wrapper">
        <div className="brand-logo">
          <div className="logo-dot"></div>
          <h1 className="brand-name">IGNIS<span className="brand-suffix">AI</span></h1>
        </div>
        <p className="brand-tagline">Sentinel Wildfire Analytics</p>
      </div>

      <div className="divider"></div>

      {/* Main Controls */}
      <div className="control-group">
        <div className="field-wrapper">
          <label className="field-label">Geographic Province</label>
          <div className="custom-select-wrapper">
            <select
              value={selectedProvince}
              onChange={(e) => onProvinceChange(e.target.value)}
              className="custom-select"
            >
              <option value="">Select Province...</option>
              {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="field-wrapper">
          <label className="field-label">Target District</label>
          <div className="custom-select-wrapper">
            <select
              value={selectedDistrict}
              onChange={(e) => onDistrictChange(e.target.value)}
              disabled={!selectedProvince}
              className="custom-select"
            >
              <option value="">Select District...</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Simulation Master Control */}
      <div className={`simulation-panel ${isSimMode ? 'active' : ''}`}>
        <div className="panel-header" onClick={() => setIsSimMode(!isSimMode)}>
          <div className="header-info">
            <h3 className="panel-title">Environment Simulation</h3>
            <p className="panel-desc">{isSimMode ? 'Active Stress Testing' : 'Enable simulation mode'}</p>
          </div>
          <div className={`toggle-switch ${isSimMode ? 'on' : 'off'}`}>
            <div className="toggle-knob"></div>
          </div>
        </div>

        {isSimMode && (
          <div className="panel-content">
            <div className="sim-field">
              <div className="sim-label-row">
                <span className="sim-label">Heat Stress Index</span>
                <span className="sim-value">{simTemp}°C</span>
              </div>
              <input
                type="range"
                min="20"
                max="55"
                value={simTemp}
                onChange={(e) => onSimTempChange(parseInt(e.target.value))}
                className="sim-slider"
              />
            </div>

            <div className="sim-field">
              <label className="sim-label">Temporal Context (Season)</label>
              <div className="month-grid">
                {months.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSimMonth(m.id)}
                    className={`month-chip ${simMonth === m.id ? 'active' : ''}`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Area */}
      <div className="action-wrapper">
        <button
          onClick={handlePredict}
          disabled={isLoading || !selectedProvince || !selectedDistrict}
          className={`predict-button ${isLoading ? 'loading' : ''}`}
        >
          {isLoading ? (
            <div className="loading-state">
              <span className="loader"></span>
              <span className="loading-text">PREDICTING...</span>
            </div>
          ) : (
            <span className="btn-text">INITIALIZE PREDICTION</span>
          )}
        </button>
      </div>

      {/* System Status */}
      <div className="system-footer">
        <div className="status-indicator">
          <span className="pulse"></span>
          AI Core Online
        </div>
        <span className="version">v1.5.0-CatBoost</span>
      </div>

      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <span className="error-msg">{error}</span>
        </div>
      )}

      <style jsx>{`
        .loading-state {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .loading-text {
          font-size: 11px;
          letter-spacing: 2px;
        }
        .error-banner {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          padding: 12px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .error-msg {
          font-size: 11px;
          color: #f87171;
          font-weight: 500;
        }
        .sidebar-container {
          background: #0a0f1e;
          width: 320px;
          height: 100vh;
          padding: 40px 24px;
          display: flex;
          flex-direction: column;
          gap: 32px;
          border-right: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 20px 0 50px rgba(0, 0, 0, 0.5);
          position: relative;
          z-index: 1000;
          overflow-y: auto;
        }

        .brand-wrapper {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .brand-logo {
          display: flex;
          items-center: center;
          gap: 12px;
        }

        .logo-dot {
          width: 10px;
          height: 10px;
          background: #f97316;
          border-radius: 50%;
          box-shadow: 0 0 15px #f97316;
        }

        .brand-name {
          font-size: 24px;
          font-weight: 900;
          color: #fff;
          letter-spacing: -0.5px;
        }

        .brand-suffix {
          color: #f97316;
          margin-left: 2px;
        }

        .brand-tagline {
          font-size: 10px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 2px;
          font-weight: 600;
        }

        .divider {
          height: 1px;
          background: linear-gradient(90deg, rgba(249, 115, 22, 0.2), transparent);
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .field-label {
          display: block;
          font-size: 10px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          margin-bottom: 8px;
          letter-spacing: 1px;
        }

        .custom-select {
          width: 100%;
          background: #151c2e;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 14px 16px;
          color: #f1f5f9;
          font-size: 13px;
          font-weight: 500;
          outline: none;
          transition: all 0.2s;
          cursor: pointer;
        }

        .custom-select:hover {
          background: #1e293b;
          border-color: rgba(249, 115, 22, 0.3);
        }

        .custom-select:focus {
          border-color: #f97316;
          box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1);
        }

        .simulation-panel {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          transition: all 0.3s;
        }

        .simulation-panel.active {
          background: rgba(249, 115, 22, 0.03);
          border-color: rgba(249, 115, 22, 0.2);
        }

        .panel-header {
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
        }

        .panel-title {
          font-size: 13px;
          font-weight: 700;
          color: #fff;
        }

        .panel-desc {
          font-size: 10px;
          color: #64748b;
        }

        .toggle-switch {
          width: 44px;
          height: 22px;
          border-radius: 11px;
          padding: 3px;
          transition: all 0.3s;
        }

        .toggle-switch.off { background: #334155; }
        .toggle-switch.on { background: #f97316; }

        .toggle-knob {
          width: 16px;
          height: 16px;
          background: white;
          border-radius: 50%;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .toggle-switch.on .toggle-knob {
          transform: translateX(22px);
        }

        .panel-content {
          padding: 0 20px 20px 20px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .sim-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .sim-label {
          font-size: 11px;
          font-weight: 600;
          color: #94a3b8;
        }

        .sim-value {
          font-size: 16px;
          font-weight: 800;
          color: #f97316;
        }

        .sim-slider {
          width: 100%;
          height: 4px;
          background: #334155;
          border-radius: 2px;
          appearance: none;
          outline: none;
        }

        .sim-slider::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          background: #fff;
          border: 4px solid #f97316;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(249, 115, 22, 0.5);
        }

        .month-grid {
          display: grid;
          grid-template-cols: repeat(4, 1fr);
          gap: 6px;
          margin-top: 12px;
        }

        .month-chip {
          background: #1e293b;
          border: 1px solid transparent;
          color: #64748b;
          padding: 8px 0;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .month-chip:hover {
          color: #cbd5e1;
          background: #334155;
        }

        .month-chip.active {
          background: #f97316;
          color: #fff;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
        }

        .predict-button {
          width: 100%;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          border: none;
          border-radius: 16px;
          padding: 18px;
          color: #fff;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 1.5px;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 10px 20px rgba(234, 88, 12, 0.2);
        }

        .predict-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 30px rgba(234, 88, 12, 0.3);
          background: linear-gradient(135deg, #fb923c 0%, #f97316 100%);
        }

        .predict-button:disabled {
          background: #1e293b;
          color: #475569;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        .system-footer {
          margin-top: auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 10px;
          font-weight: 700;
          color: #10b981;
          text-transform: uppercase;
        }

        .pulse {
          width: 6px;
          height: 6px;
          background: #10b981;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        .version {
          font-size: 9px;
          font-family: monospace;
          color: #334155;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }

        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}