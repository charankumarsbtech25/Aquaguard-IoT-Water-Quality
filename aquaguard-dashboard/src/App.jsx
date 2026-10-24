import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, Droplets, Gauge, AlertTriangle, ShieldCheck, Wifi, 
  Settings, LineChart, FileText, Cpu, Download, Zap, 
  Volume2, VolumeX, Database, Key, HelpCircle, Sliders, CheckCircle2,
  XCircle, Filter, Search, ChevronRight, Moon, Sun, Play, Pause, Radio, RefreshCw
} from 'lucide-react';
import { 
  ResponsiveContainer, LineChart as ReLineChart, Line, XAxis, YAxis, 
  Tooltip, CartesianGrid, AreaChart, Area 
} from 'recharts';

import { ref, onValue } from 'firebase/database';
import { db } from './firebase';

const DEFAULT_THRESHOLDS = {
  phMin: 6.5,
  phMax: 8.5,
  tdsMax: 200,
  flowMax: 15.0,
  dailyLimit: 250
};

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [theme, setTheme] = useState('dark');
  const [connectionMode, setConnectionMode] = useState('firebase');
  const [isConnected, setIsConnected] = useState(false);

  const [user, setUser] = useState({ email: 'operator@aquaguard.io', role: 'System Admin' });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const [telemetry, setTelemetry] = useState({
    ph: 7.0,
    phVoltage: 0.0,
    tds: 0,
    tdsVoltage: 0.0,
    flowRate: 0.0,
    totalLiters: 0.0,
    alert: false,
    wifiRssi: -60,
    firmwareVersion: "v1.4.2-ESP32",
    updatedAt: Date.now()
  });

  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [audioAlerts, setAudioAlerts] = useState(false);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([
    { id: 1, type: 'info', title: 'System Bootstrapped', message: 'ESP32 Device aquaguard initialized on path /devices/aquaguard.', time: 'Just now', status: 'acknowledged', code: 'SYS_INIT' }
  ]);

  const [isSimulating, setIsSimulating] = useState(false);

  // Live Firebase Realtime Database Listener
  useEffect(() => {
    if (connectionMode !== 'firebase') return;

    const sensorRef = ref(db, 'devices/aquaguard');

    const unsubscribe = onValue(
      sensorRef, 
      (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          const now = new Date();

          const liveData = {
            ph: Number(val.ph) || 0,
            phVoltage: Number(val.phVoltage) || 0,
            tds: Number(val.tds) || 0,
            tdsVoltage: Number(val.tdsVoltage) || 0,
            flowRate: Number(val.flowRate) || 0,
            totalLiters: Number(val.totalLiters ?? val.totalLitres ?? 0),
            alert: Boolean(val.alert),
            wifiRssi: val.wifiRssi || -62,
            firmwareVersion: "v1.4.2-ESP32",
            updatedAt: Date.now()
          };

          setTelemetry(liveData);
          setIsConnected(true);

          const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const dateStr = now.toLocaleDateString();

          setHistory((prevHistory) => [
            ...prevHistory.slice(-199),
            {
              timestamp: now.getTime(),
              timeStr,
              dateStr,
              ph: liveData.ph,
              phVoltage: liveData.phVoltage,
              tds: liveData.tds,
              tdsVoltage: liveData.tdsVoltage,
              flowRate: liveData.flowRate,
              totalLiters: liveData.totalLiters,
              wifiRssi: liveData.wifiRssi
            }
          ]);

          if (liveData.tds > thresholds.tdsMax) {
            triggerAlert('critical', 'High TDS Level Detected', `TDS level (${liveData.tds} ppm) exceeded threshold of ${thresholds.tdsMax} ppm.`, 'TDS_HIGH');
          }
          if (liveData.ph < thresholds.phMin || liveData.ph > thresholds.phMax) {
            triggerAlert('warning', 'pH Out of Optimal Range', `pH level recorded at ${liveData.ph} (Optimal: ${thresholds.phMin} - ${thresholds.phMax}).`, 'PH_OUT');
          }
        } else {
          setIsConnected(false);
        }
      },
      (error) => {
        console.error("Firebase RTDB Error:", error);
        setIsConnected(false);
      }
    );

    return () => unsubscribe();
  }, [connectionMode, thresholds]);

  // Simulation Fallback Engine
  useEffect(() => {
    if (!isSimulating || connectionMode === 'firebase') return;

    const interval = setInterval(() => {
      setTelemetry(prev => {
        const deltaFlow = Math.max(0, parseFloat((prev.flowRate + (Math.random() * 0.8 - 0.4)).toFixed(1)));
        const newTotal = parseFloat((prev.totalLiters + (deltaFlow > 0 ? 0.05 : 0)).toFixed(2));
        const newPh = parseFloat(Math.min(9.2, Math.max(5.8, prev.ph + (Math.random() * 0.06 - 0.03))).toFixed(2));
        const newTds = Math.max(80, Math.min(320, prev.tds + Math.floor(Math.random() * 5 - 2)));
        const isAlert = newPh < thresholds.phMin || newPh > thresholds.phMax || newTds > thresholds.tdsMax;

        return {
          ...prev,
          ph: newPh,
          tds: newTds,
          flowRate: deltaFlow,
          totalLiters: newTotal,
          alert: isAlert,
          updatedAt: Date.now()
        };
      });
      setIsConnected(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [isSimulating, connectionMode, thresholds]);

  const triggerAlert = (type, title, message, code) => {
    setAlerts(prev => {
      if (prev.some(a => a.code === code && a.status === 'active')) return prev;
      return [{ id: Date.now(), type, title, message, time: 'Just now', status: 'active', code }, ...prev];
    });
  };

  const wqi = useMemo(() => {
    let score = 100;
    if (telemetry.ph < 6.5) score -= (6.5 - telemetry.ph) * 20;
    else if (telemetry.ph > 8.5) score -= (telemetry.ph - 8.5) * 20;
    if (telemetry.tds > 150) score -= ((telemetry.tds - 150) / 200) * 30;

    score = Math.max(0, Math.min(100, Math.round(score)));

    let status = 'Excellent';
    let color = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (score < 60) {
      status = 'Poor / Non-Potable';
      color = 'text-red-400 border-red-500/30 bg-red-500/10';
    } else if (score < 80) {
      status = 'Moderate / Acceptable';
      color = 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    }
    return { score, status, color };
  }, [telemetry.ph, telemetry.tds]);

  const exportCSV = () => {
    const headers = ["Timestamp", "Date", "Time", "pH", "pH_Voltage", "TDS_ppm", "TDS_Voltage", "FlowRate_Lmin", "TotalLiters"];
    const rows = history.map(h => [h.timestamp, h.dateStr, h.timeStr, h.ph, h.phVoltage, h.tds, h.tdsVoltage, h.flowRate, h.totalLiters]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `aquaguard_telemetry_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#0a0f1d] text-slate-100' : 'bg-slate-50 text-slate-800'} font-sans flex flex-col md:flex-row transition-colors duration-300`}>
      
      {/* SIDEBAR NAVIGATION */}
      <aside className={`w-full md:w-64 ${theme === 'dark' ? 'bg-[#0e1628]/90 border-slate-800/80' : 'bg-white border-slate-200'} border-r flex flex-col justify-between shrink-0`}>
        <div>
          <div className="p-5 border-b border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-500 shadow-lg shadow-cyan-500/20 text-white">
                <Droplets className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h1 className="font-bold text-lg tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-emerald-400 to-blue-400">
                  AQUAGUARD
                </h1>
                <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">IoT Water Quality</p>
              </div>
            </div>
          </div>

          <div className="px-5 py-3 border-b border-slate-800/40 bg-slate-900/40">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Node ESP32-V1</span>
              {isConnected ? (
                <span className="flex items-center space-x-1.5 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span>ONLINE</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1.5 text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-red-400"></span>
                  <span>OFFLINE</span>
                </span>
              )}
            </div>
            <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between font-mono">
              <span>RSSI: {telemetry.wifiRssi} dBm</span>
              <span>Mode: {connectionMode === 'simulated' ? 'SIM' : 'RTDB'}</span>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            {[
              { id: 'overview', label: 'Overview', icon: Gauge },
              { id: 'analytics', label: 'Analytics & Graphs', icon: LineChart },
              { id: 'history', label: 'Data History Logs', icon: FileText },
              { id: 'alerts', label: 'Alerts & Diagnostics', icon: AlertTriangle, count: alerts.filter(a => a.status === 'active').length },
              { id: 'device', label: 'ESP32 Device Health', icon: Cpu },
              { id: 'settings', label: 'Settings & Setup', icon: Settings },
              { id: 'documentation', label: 'Setup Guide & Code', icon: HelpCircle }
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive 
                      ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/10 text-cyan-400 border border-cyan-500/30 shadow-md shadow-cyan-950/20' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.count ? (
                    <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full border border-red-500/30 font-mono">
                      {item.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800/60 space-y-3">
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/60 text-xs space-y-2">
            <div className="flex justify-between items-center text-slate-400">
              <span>Data Source</span>
              <button 
                onClick={() => {
                  const nextMode = connectionMode === 'simulated' ? 'firebase' : 'simulated';
                  setConnectionMode(nextMode);
                  setIsSimulating(nextMode === 'simulated');
                }}
                className="text-cyan-400 hover:underline font-mono text-[11px]"
              >
                Switch to {connectionMode === 'simulated' ? 'RTDB' : 'SIM'}
              </button>
            </div>
            {connectionMode === 'simulated' && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">Hardware Simulator</span>
                <button 
                  onClick={() => setIsSimulating(!isSimulating)}
                  className={`p-1 rounded ${isSimulating ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}
                >
                  {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <div className="truncate max-w-[140px]">
              <p className="font-semibold text-slate-200 truncate">{user.email}</p>
              <p className="text-[10px] text-emerald-400 font-mono">{user.role}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* TOP BAR */}
        <header className={`px-6 py-4 ${theme === 'dark' ? 'bg-[#0e1628]/60 border-slate-800/60' : 'bg-white border-slate-200'} border-b flex flex-wrap items-center justify-between gap-4 sticky top-0 backdrop-blur-md z-10`}>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-100 capitalize">
              {activeTab.replace('-', ' ')}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live Monitoring Node: <span className="font-mono text-cyan-400">devices/aquaguard</span> &bull; Updated: {new Date(telemetry.updatedAt).toLocaleTimeString()}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setAudioAlerts(!audioAlerts)}
              className={`p-2 rounded-xl border text-xs font-medium flex items-center space-x-2 transition-all ${
                audioAlerts 
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                  : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              {audioAlerts ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden sm:inline">{audioAlerts ? 'Audio On' : 'Audio Muted'}</span>
            </button>

            <button
              onClick={exportCSV}
              className="px-3 py-2 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white rounded-xl text-xs font-medium flex items-center space-x-2 shadow-lg shadow-cyan-950/40 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV Log</span>
            </button>

            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-xl border border-slate-700/50 bg-slate-800/40 text-slate-400 hover:text-slate-200"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* TAB 1: OVERVIEW DASHBOARD */}
        {activeTab === 'overview' && (
          <div className="p-6 space-y-6">
            
            {/* Header Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-[#111e38] to-slate-900 border border-slate-800 p-6 shadow-xl">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div>
                  <div className="flex items-center space-x-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${wqi.color}`}>
                      WQI SCORE: {wqi.score} / 100
                    </span>
                    <span className="text-xs text-slate-400 font-mono">STATUS: {wqi.status}</span>
                  </div>
                  <h3 className="text-2xl font-bold mt-2 text-white">Water Purification Telemetry Center</h3>
                  <p className="text-xs text-slate-400 max-w-xl mt-1">
                    Real-time IoT stream monitoring acidity (pH), total dissolved solids (TDS ppm), and hydrodynamic volumetric flow rates via Node ESP32 DevKit V1.
                  </p>
                </div>

                <div className="flex items-center space-x-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Total Consumption</p>
                    <p className="text-2xl font-black text-cyan-400 font-mono">{telemetry.totalLiters.toFixed(1)} <span className="text-xs font-normal text-slate-400">Liters</span></p>
                  </div>
                  <div className="p-3 bg-cyan-500/10 rounded-lg text-cyan-400 border border-cyan-500/20">
                    <Droplets className="w-6 h-6" />
                  </div>
                </div>
              </div>
            </div>

            {/* 6 Metric Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              
              {/* Card 1: pH */}
              <div className="bg-[#0e1628]/80 border border-slate-800/80 hover:border-cyan-500/30 transition-all rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Acidity Level (pH)</span>
                  <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <Activity className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <div>
                    <span className="text-3xl font-black tracking-tight text-white font-mono">{telemetry.ph.toFixed(2)}</span>
                    <span className="text-xs text-slate-400 ml-2 font-mono">pH</span>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                    telemetry.ph >= thresholds.phMin && telemetry.ph <= thresholds.phMax 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    {telemetry.ph >= thresholds.phMin && telemetry.ph <= thresholds.phMax ? 'OPTIMAL' : 'OUT OF RANGE'}
                  </span>
                </div>
                <div className="mt-4 pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                  <span>Optimal: {thresholds.phMin} - {thresholds.phMax}</span>
                  <span className="font-mono text-purple-400">ADC: {telemetry.phVoltage.toFixed(2)}V</span>
                </div>
              </div>

              {/* Card 2: TDS */}
              <div className="bg-[#0e1628]/80 border border-slate-800/80 hover:border-cyan-500/30 transition-all rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Dissolved Solids (TDS)</span>
                  <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Filter className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <div>
                    <span className="text-3xl font-black tracking-tight text-white font-mono">{Math.round(telemetry.tds)}</span>
                    <span className="text-xs text-slate-400 ml-2 font-mono">PPM</span>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                    telemetry.tds <= thresholds.tdsMax 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {telemetry.tds <= thresholds.tdsMax ? 'SAFE PURITY' : 'HIGH SOLIDS'}
                  </span>
                </div>
                <div className="mt-4 pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                  <span>Limit: {thresholds.tdsMax} ppm</span>
                  <span className="font-mono text-cyan-400">ADC: {telemetry.tdsVoltage.toFixed(2)}V</span>
                </div>
              </div>

              {/* Card 3: Flow Rate */}
              <div className="bg-[#0e1628]/80 border border-slate-800/80 hover:border-cyan-500/30 transition-all rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Flow Velocity</span>
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Zap className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <div>
                    <span className="text-3xl font-black tracking-tight text-white font-mono">{telemetry.flowRate.toFixed(1)}</span>
                    <span className="text-xs text-slate-400 ml-2 font-mono">L / min</span>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                    telemetry.flowRate > 0 
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse' 
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {telemetry.flowRate > 0 ? 'ACTIVE FLOW' : 'IDLE / NO FLOW'}
                  </span>
                </div>
                <div className="mt-4 pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                  <span>Sensor: YF-S201</span>
                  <span className="font-mono text-blue-400">Hall Pulse</span>
                </div>
              </div>

              {/* Card 4: Cumulative Volume */}
              <div className="bg-[#0e1628]/80 border border-slate-800/80 hover:border-cyan-500/30 transition-all rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cumulative Volume</span>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Droplets className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <div>
                    <span className="text-3xl font-black tracking-tight text-white font-mono">{telemetry.totalLiters.toFixed(1)}</span>
                    <span className="text-xs text-slate-400 ml-2 font-mono">Liters</span>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Quota: {thresholds.dailyLimit}L
                  </span>
                </div>
                <div className="mt-4 space-y-1">
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400" 
                      style={{ width: `${Math.min(100, (telemetry.totalLiters / thresholds.dailyLimit) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Usage: {((telemetry.totalLiters / thresholds.dailyLimit) * 100).toFixed(0)}%</span>
                    <span>Max: {thresholds.dailyLimit}L</span>
                  </div>
                </div>
              </div>

              {/* Card 5: Purity Grade */}
              <div className="bg-[#0e1628]/80 border border-slate-800/80 hover:border-cyan-500/30 transition-all rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Purity Grade</span>
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <h4 className={`text-xl font-bold ${wqi.color.split(' ')[0]}`}>{wqi.status}</h4>
                  <p className="text-xs text-slate-400 mt-1">EPA water purity model</p>
                </div>
                <div className="mt-4 pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                  <span>Filter Status</span>
                  <span className="font-mono text-emerald-400">{telemetry.alert ? 'ALERT' : 'NORMAL'}</span>
                </div>
              </div>

              {/* Card 6: Node Telemetry Link */}
              <div className="bg-[#0e1628]/80 border border-slate-800/80 hover:border-cyan-500/30 transition-all rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Node Telemetry Link</span>
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Wifi className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4 flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-red-500'}`}></div>
                  <div>
                    <h4 className="text-base font-bold text-white">{isConnected ? 'Firebase Synced' : 'Connecting...'}</h4>
                    <p className="text-xs text-slate-400 font-mono">devices/aquaguard</p>
                  </div>
                </div>
                <div className="mt-4 pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                  <span>Latency</span>
                  <span className="font-mono text-indigo-400">Live Stream</span>
                </div>
              </div>

            </div>

            {/* Live Telemetry Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              
              {/* Realtime pH & TDS Trend */}
              <div className="bg-[#0e1628]/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-purple-400" />
                      Live pH & TDS Trend Log
                    </h4>
                    <p className="text-xs text-slate-400">Realtime streaming sensor telemetry from Firebase</p>
                  </div>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history.slice(-20)}>
                      <defs>
                        <linearGradient id="colorPh" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorTds" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="timeStr" stroke="#64748b" fontSize={10} />
                      <YAxis yAxisId="left" stroke="#a855f7" fontSize={10} domain={[0, 14]} />
                      <YAxis yAxisId="right" orientation="right" stroke="#06b6d4" fontSize={10} domain={[0, 300]} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} />
                      <Area yAxisId="left" type="monotone" dataKey="ph" stroke="#a855f7" fillOpacity={1} fill="url(#colorPh)" name="pH Level" />
                      <Area yAxisId="right" type="monotone" dataKey="tds" stroke="#06b6d4" fillOpacity={1} fill="url(#colorTds)" name="TDS (ppm)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Realtime Water Flow Profile */}
              <div className="bg-[#0e1628]/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-blue-400" />
                      Hydrodynamic Flow Profile
                    </h4>
                    <p className="text-xs text-slate-400">Volumetric flow velocity rate (L/min)</p>
                  </div>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history.slice(-20)}>
                      <defs>
                        <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="timeStr" stroke="#64748b" fontSize={10} />
                      <YAxis stroke="#3b82f6" fontSize={10} domain={[0, 'auto']} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} />
                      <Area type="monotone" dataKey="flowRate" stroke="#3b82f6" fillOpacity={1} fill="url(#colorFlow)" name="Flow Rate (L/min)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="p-6 space-y-6">
            <div className="bg-[#0e1628]/80 border border-slate-800/80 p-4 rounded-2xl">
              <h3 className="text-lg font-bold text-white">Historical Telemetry Analytics</h3>
              <p className="text-xs text-slate-400">All sensor stream visualizers running live from Firebase RTDB.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#0e1628]/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg space-y-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" /> 1. Acidity Level (pH Sensor)
                </h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ReLineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="timeStr" stroke="#64748b" fontSize={10} />
                      <YAxis stroke="#a855f7" fontSize={10} domain={[0, 14]} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} />
                      <Line type="monotone" dataKey="ph" stroke="#a855f7" strokeWidth={2} dot={false} name="pH Level" />
                    </ReLineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-[#0e1628]/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg space-y-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Filter className="w-4 h-4 text-cyan-400" /> 2. Dissolved Solids (TDS Sensor)
                </h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ReLineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="timeStr" stroke="#64748b" fontSize={10} />
                      <YAxis stroke="#06b6d4" fontSize={10} domain={[0, 400]} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} />
                      <Line type="monotone" dataKey="tds" stroke="#06b6d4" strokeWidth={2} dot={false} name="TDS (ppm)" />
                    </ReLineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-[#0e1628]/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg space-y-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-blue-400" /> 3. Water Flow Rate (YF-S201 Sensor)
                </h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ReLineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="timeStr" stroke="#64748b" fontSize={10} />
                      <YAxis stroke="#3b82f6" fontSize={10} domain={[0, 'auto']} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} />
                      <Line type="monotone" dataKey="flowRate" stroke="#3b82f6" strokeWidth={2} dot={false} name="Flow Rate (L/min)" />
                    </ReLineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-[#0e1628]/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg space-y-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-emerald-400" /> 4. Total Water Consumption
                </h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="timeStr" stroke="#64748b" fontSize={10} />
                      <YAxis stroke="#10b981" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} />
                      <Area type="monotone" dataKey="totalLiters" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="Total Volume (L)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DATA HISTORY LOGS */}
        {activeTab === 'history' && (
          <div className="p-6 space-y-6">
            <div className="flex justify-between items-center bg-[#0e1628]/80 border border-slate-800/80 p-5 rounded-2xl">
              <div>
                <h3 className="text-lg font-bold text-white">Historical Telemetry Database</h3>
                <p className="text-xs text-slate-400">Recorded sensor entries from <span className="font-mono text-cyan-400">devices/aquaguard</span>.</p>
              </div>
              <button onClick={exportCSV} className="px-4 py-2 bg-cyan-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2">
                <Download className="w-4 h-4" /> Download CSV
              </button>
            </div>

            <div className="bg-[#0e1628]/80 border border-slate-800/80 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-4">Timestamp</th>
                    <th className="p-4">pH</th>
                    <th className="p-4">TDS (PPM)</th>
                    <th className="p-4">Flow Rate</th>
                    <th className="p-4">Total Volume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {history.slice().reverse().map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/40">
                      <td className="p-4 text-slate-400">{row.dateStr} {row.timeStr}</td>
                      <td className="p-4 text-purple-400">{row.ph} pH</td>
                      <td className="p-4 text-cyan-400">{row.tds} ppm</td>
                      <td className="p-4 text-blue-400">{row.flowRate} L/min</td>
                      <td className="p-4 text-emerald-400">{row.totalLiters} L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: ALERTS */}
        {activeTab === 'alerts' && (
          <div className="p-6 space-y-6">
            <div className="bg-[#0e1628]/80 border border-slate-800/80 p-5 rounded-2xl">
              <h3 className="text-lg font-bold text-white">Alerts & System Safety Diagnostics</h3>
              <p className="text-xs text-slate-400">Current threshold violations and device warnings.</p>
            </div>

            <div className="space-y-3">
              {alerts.map(a => (
                <div key={a.id} className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <h5 className="font-bold text-white">{a.title}</h5>
                    <p className="text-slate-400 mt-1">{a.message}</p>
                  </div>
                  <span className="text-slate-500 font-mono">{a.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: ESP32 DEVICE HEALTH */}
        {activeTab === 'device' && (
          <div className="p-6 space-y-6">
            <div className="bg-[#0e1628]/80 border border-slate-800/80 p-5 rounded-2xl">
              <h3 className="text-lg font-bold text-white">ESP32 Hardware Health</h3>
              <p className="text-xs text-slate-400">Live pin outputs and micro-controller connection state.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-slate-400">pH Sensor ADC Pin</span>
                <p className="text-purple-400 text-lg font-bold mt-1">GPIO 34 ({telemetry.phVoltage.toFixed(2)}V)</p>
              </div>
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-slate-400">TDS Sensor ADC Pin</span>
                <p className="text-cyan-400 text-lg font-bold mt-1">GPIO 35 ({telemetry.tdsVoltage.toFixed(2)}V)</p>
              </div>
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-slate-400">Flow Sensor Interrupt</span>
                <p className="text-blue-400 text-lg font-bold mt-1">GPIO 27 ({telemetry.flowRate} L/min)</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="p-6 space-y-6">
            <div className="bg-[#0e1628]/80 border border-slate-800/80 p-5 rounded-2xl">
              <h3 className="text-lg font-bold text-white">Threshold & Safety Settings</h3>
              <p className="text-xs text-slate-400">Adjust active warning limits for water quality triggers.</p>
            </div>

            <div className="bg-[#0e1628]/80 border border-slate-800/80 p-5 rounded-2xl space-y-4 max-w-lg text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Max TDS Limit ({thresholds.tdsMax} PPM)</label>
                <input 
                  type="range" min="100" max="500" step="10" 
                  value={thresholds.tdsMax} 
                  onChange={(e) => setThresholds({ ...thresholds, tdsMax: Number(e.target.value) })}
                  className="w-full accent-cyan-500" 
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: SETUP GUIDE & DOCUMENTATION */}
        {activeTab === 'documentation' && (
          <div className="p-6 space-y-6">
            <div className="bg-[#0e1628]/80 border border-slate-800/80 p-5 rounded-2xl">
              <h3 className="text-lg font-bold text-white">Setup Guide & ESP32 Code</h3>
              <p className="text-xs text-slate-400">Instructions for connecting ESP32 DevKit V1 to Firebase RTDB.</p>
            </div>

            <div className="bg-[#0e1628]/80 border border-slate-800/80 p-5 rounded-2xl text-xs space-y-3">
              <h4 className="font-bold text-cyan-400 text-sm">Target RTDB Firebase Node Path</h4>
              <p className="text-slate-300 font-mono bg-slate-900 p-3 rounded-xl border border-slate-800">devices/aquaguard</p>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
