import { useState, useEffect } from "react";

export default function FloatingMobileNav({
  geoData,
  selectedProvince,
  selectedDistrict,
  onProvinceChange,
  onDistrictChange,
  onPredict,
  simTemp,
  onSimTempChange,
  isLoading
}) {
  const [activePanel, setActivePanel] = useState(null); // 'location' | 'simulation' | null
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [isSimMode, setIsSimMode] = useState(false);
  const [simMonth, setSimMonth] = useState(new Date().getMonth() + 1);

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

  const handlePredictClick = () => {
    setActivePanel(null);
    onPredict({
        isSimMode,
        simMonth
    });
  };

  const months = [
    { id: 1, name: "Jan" }, { id: 2, name: "Feb" }, { id: 3, name: "Mar" }, 
    { id: 4, name: "Apr" }, { id: 5, name: "May" }, { id: 6, name: "Jun" }, 
    { id: 7, name: "Jul" }, { id: 8, name: "Aug" }, { id: 9, name: "Sep" }, 
    { id: 10, name: "Oct" }, { id: 11, name: "Nov" }, { id: 12, name: "Dec" }
  ];

  const togglePanel = (panel) => {
    if (activePanel === panel) setActivePanel(null);
    else setActivePanel(panel);
  };

  return (
    <div className="mobile-nav-root">
      {/* Overlay Backdrop */}
      {activePanel && (
        <div className="nav-backdrop" onClick={() => setActivePanel(null)}></div>
      )}

      {/* Bottom Sheet Panels */}
      <div className={`bottom-sheet ${activePanel ? 'open' : ''}`}>
        <div className="sheet-header">
          <div className="handle"></div>
          <button className="close-sheet" onClick={() => setActivePanel(null)}>✕</button>
        </div>
        
        <div className="sheet-content">
          {activePanel === 'location' && (
            <div className="panel-inner">
              <h3 className="panel-title">Geographic Selection</h3>
              <div className="field-group">
                <label>Province</label>
                <select 
                  value={selectedProvince} 
                  onChange={(e) => onProvinceChange(e.target.value)}
                  className="mobile-select"
                >
                  <option value="">Select Province...</option>
                  {provinces.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label>District</label>
                <select 
                  value={selectedDistrict} 
                  onChange={(e) => onDistrictChange(e.target.value)}
                  disabled={!selectedProvince}
                  className="mobile-select"
                >
                  <option value="">Select District...</option>
                  {districts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          )}

          {activePanel === 'simulation' && (
            <div className="panel-inner">
              <div className="panel-header-row">
                <h3 className="panel-title">Environmental Simulation</h3>
                <div className={`mini-toggle ${isSimMode ? 'on' : 'off'}`} onClick={() => setIsSimMode(!isSimMode)}>
                  <div className="knob"></div>
                </div>
              </div>
              
              <div className={`sim-content-mobile ${!isSimMode ? 'dimmed' : ''}`}>
                <div className="sim-field">
                  <div className="sim-label-row">
                    <span>Heat Stress</span>
                    <span className="sim-val">{simTemp}°C</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="55"
                    value={simTemp}
                    onChange={(e) => onSimTempChange(parseInt(e.target.value))}
                    disabled={!isSimMode}
                    className="mobile-range"
                  />
                </div>

                <div className="sim-field">
                  <label className="sim-label">Seasonal Context</label>
                  <div className="month-scroll">
                    {months.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSimMonth(m.id)}
                        disabled={!isSimMode}
                        className={`month-pill ${simMonth === m.id ? 'active' : ''}`}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Navigation Bar */}
      <nav className="floating-bar">
        <button 
          className={`nav-item ${activePanel === 'location' ? 'active' : ''}`}
          onClick={() => togglePanel('location')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          <span>Location</span>
        </button>

        <div className="predict-center">
            <button 
                className={`predict-fab ${isLoading ? 'loading' : ''}`}
                onClick={handlePredictClick}
                disabled={isLoading || !selectedProvince || !selectedDistrict}
            >
                {isLoading ? (
                    <div className="spinner"></div>
                ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                )}
            </button>
        </div>

        <button 
          className={`nav-item ${activePanel === 'simulation' ? 'active' : ''}`}
          onClick={() => togglePanel('simulation')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path></svg>
          <span>Simulation</span>
        </button>
      </nav>

      <style jsx>{`
        .mobile-nav-root {
          display: none;
        }

        @media (max-width: 767px) {
          .mobile-nav-root {
            display: block;
          }

          .nav-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(4px);
            z-index: 2500;
            animation: fadeIn 0.3s ease;
          }

          .floating-bar {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            width: calc(100% - 48px);
            max-width: 400px;
            height: 72px;
            background: rgba(15, 23, 42, 0.85);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 36px;
            display: flex;
            align-items: center;
            justify-content: space-around;
            padding: 0 12px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1);
            z-index: 3000;
          }

          .nav-item {
            background: none;
            border: none;
            color: #94a3b8;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            padding: 8px;
            transition: all 0.3s;
            flex: 1;
          }

          .nav-item.active {
            color: #f97316;
            transform: translateY(-2px);
          }

          .nav-item svg {
            width: 20px;
            height: 20px;
          }

          .nav-item span {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .predict-center {
            position: relative;
            width: 80px;
            height: 80px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: -30px;
          }

          .predict-fab {
            width: 64px;
            height: 64px;
            background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
            border: none;
            border-radius: 50%;
            color: white;
            box-shadow: 0 8px 25px rgba(234, 88, 12, 0.5), 0 0 0 6px rgba(15, 23, 42, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            cursor: pointer;
          }

          .predict-fab:active {
            transform: scale(0.9);
          }

          .predict-fab:disabled {
            background: #334155;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2), 0 0 0 6px rgba(15, 23, 42, 0.85);
            color: #475569;
          }

          .predict-fab svg {
            width: 28px;
            height: 28px;
          }

          .bottom-sheet {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: #0f172a;
            border-radius: 32px 32px 0 0;
            z-index: 2600;
            transform: translateY(100%);
            transition: transform 0.4s cubic-bezier(0.32, 0.72, 0, 1);
            padding: 20px 24px 120px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
          }

          .bottom-sheet.open {
            transform: translateY(0);
          }

          .sheet-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
          }

          .handle {
            width: 40px;
            height: 4px;
            background: #334155;
            border-radius: 2px;
            position: absolute;
            top: 12px;
            left: 50%;
            transform: translateX(-50%);
          }

          .close-sheet {
            background: #1e293b;
            border: none;
            color: #94a3b8;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            margin-left: auto;
          }

          .panel-title {
            font-size: 18px;
            font-weight: 800;
            color: white;
            margin-bottom: 20px;
          }

          .field-group {
            margin-bottom: 16px;
          }

          .field-group label {
            display: block;
            font-size: 11px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            margin-bottom: 8px;
            letter-spacing: 1px;
          }

          .mobile-select {
            width: 100%;
            background: #1e293b;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 14px;
            color: white;
            font-size: 15px;
            outline: none;
          }

          .panel-header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
          }

          .mini-toggle {
            width: 48px;
            height: 24px;
            border-radius: 12px;
            padding: 4px;
            transition: all 0.3s;
          }
          .mini-toggle.off { background: #334155; }
          .mini-toggle.on { background: #f97316; }
          .knob {
            width: 16px;
            height: 16px;
            background: white;
            border-radius: 50%;
            transition: transform 0.3s;
          }
          .mini-toggle.on .knob { transform: translateX(24px); }

          .sim-content-mobile.dimmed {
            opacity: 0.4;
            pointer-events: none;
          }

          .sim-label-row {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            font-weight: 600;
            color: #94a3b8;
            margin-bottom: 12px;
          }
          .sim-val { color: #f97316; font-weight: 800; }

          .mobile-range {
            width: 100%;
            height: 6px;
            background: #334155;
            border-radius: 3px;
            appearance: none;
            outline: none;
            margin-bottom: 24px;
          }
          .mobile-range::-webkit-slider-thumb {
            appearance: none;
            width: 20px;
            height: 20px;
            background: white;
            border: 4px solid #f97316;
            border-radius: 50%;
          }

          .month-scroll {
            display: flex;
            gap: 8px;
            overflow-x: auto;
            padding: 4px 0;
            margin-top: 12px;
            -webkit-overflow-scrolling: touch;
          }
          .month-scroll::-webkit-scrollbar { display: none; }

          .month-pill {
            background: #1e293b;
            border: none;
            color: #64748b;
            padding: 8px 16px;
            border-radius: 18px;
            font-size: 13px;
            font-weight: 700;
            white-space: nowrap;
          }
          .month-pill.active {
            background: #f97316;
            color: white;
          }

          .spinner {
            width: 24px;
            height: 24px;
            border: 3px solid rgba(255,255,255,0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
}
