// Inisialisasi ikon Feather
feather.replace();

let port, reader, writer;
let isConnected = false;
let keepReading = true;
let isChartPaused = false;

// Parameter default disesuaikan presisi dengan nilai awal Arduino
let activeGains = {
  P: { kp: 5.00, ki: 0.20, kd: 0.10 },
  S: { kp: 1.20, ki: 0.50, kd: 0.01 }
};

let peakValue = 0.0;
let startTime = 0;
let t10 = null, t90 = null;
let rpmHistory = [];

/* LOGIKA TOGGLE TEMA (DARK / LIGHT) */
function toggleTheme() {
  const htmlEl = document.documentElement;
  const currentTheme = htmlEl.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  
  htmlEl.setAttribute('data-theme', newTheme);
  updateThemeIcon(newTheme);
  updateChartColors(newTheme);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('themeIcon');
  if (theme === 'light') {
    icon.setAttribute('data-feather', 'moon');
  } else {
    icon.setAttribute('data-feather', 'sun');
  }
  feather.replace();
}

function updateChartColors(theme) {
  const isLight = theme === 'light';
  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';

  [telemetryChart, pwmChart].forEach(chart => {
    chart.options.scales.x.ticks.color = isLight ? '#64748b' : '#94a3b8';
    chart.options.scales.x.grid.color = gridColor;
    chart.options.scales.y.ticks.color = isLight ? '#64748b' : '#94a3b8';
    chart.options.scales.y.grid.color = gridColor;
    chart.options.plugins.legend.labels.color = textColor;
    chart.update();
  });
}

/* FUNGSI TOGGLE PAUSE / RESUME GRAFIK */
function togglePauseChart() {
  isChartPaused = !isChartPaused;
  const btn = document.getElementById('btnPause');
  const icon = document.getElementById('pauseIcon');
  const text = document.getElementById('pauseText');
  const btnExport = document.getElementById('btnExportJpg');

  if (isChartPaused) {
    btn.style.background = 'rgba(249, 115, 22, 0.2)';
    btn.style.borderColor = 'var(--accent-orange)';
    btn.style.color = 'var(--accent-orange)';
    icon.setAttribute('data-feather', 'play');
    text.innerText = 'Resume Grafik';
    btnExport.style.display = 'inline-flex';
  } else {
    btn.style.background = 'var(--card-bg)';
    btn.style.borderColor = 'var(--card-border)';
    btn.style.color = 'var(--text-main)';
    icon.setAttribute('data-feather', 'pause');
    text.innerText = 'Pause Grafik';
    btnExport.style.display = 'none';
  }
  feather.replace();
}

/* FUNGSI EKSPOR GRAFIK KE FORMAT JPG */
function exportChartToJPG() {
  const canvas = document.getElementById('telemetryChart');
  const theme = document.documentElement.getAttribute('data-theme');
  const isLight = theme === 'light';

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const ctxTemp = tempCanvas.getContext('2d');

  ctxTemp.fillStyle = isLight ? '#ffffff' : '#1e293b';
  ctxTemp.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  ctxTemp.drawImage(canvas, 0, 0);

  const imageURI = tempCanvas.toDataURL('image/jpeg', 0.95);
  const link = document.createElement('a');
  const timeStamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  
  link.download = `Grafik_Telemetri_PID_${timeStamp}.jpg`;
  link.href = imageURI;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function setPreset(kp, ki, kd) {
  document.getElementById('kpInput').value = kp;
  document.getElementById('kiInput').value = ki;
  document.getElementById('kdInput').value = kd;
  sendPidGain();
}

function loadDefaultPidValues() {
  const type = document.getElementById('pidTypeSelect').value;
  if (activeGains[type]) {
    document.getElementById('kpInput').value = activeGains[type].kp;
    document.getElementById('kiInput').value = activeGains[type].ki;
    document.getElementById('kdInput').value = activeGains[type].kd;
  }
}

/* 1. INITIALIZATION GRAFIK TELEMETRI (RPM / POSISI) */
const ctxTelemetry = document.getElementById('telemetryChart').getContext('2d');
const telemetryChart = new Chart(ctxTelemetry, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Target Setpoint',
        borderColor: '#0284c7',
        borderWidth: 2,
        borderDash: [5, 5],
        data: [],
        fill: false,
        pointRadius: 0,
        tension: 0.3
      },
      {
        label: 'Feedback Terukur',
        borderColor: '#16a34a',
        borderWidth: 2,
        data: [],
        fill: false,
        pointRadius: 0,
        tension: 0.4
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.08)' },
        ticks: { color: '#94a3b8', maxTicksLimit: 12 }
      },
      y: {
        grace: '15%',
        grid: { color: 'rgba(255, 255, 255, 0.08)' },
        ticks: { color: '#94a3b8' }
      }
    },
    plugins: {
      legend: { labels: { color: '#f8fafc', font: { family: 'Montserrat', weight: '600' } } },
      zoom: {
        pan: { enabled: true, mode: 'xy' },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }
      }
    }
  }
});

/* 2. INITIALIZATION GRAFIK PWM (SINYAL KOTAK / STEPPED LINE) */
const ctxPwm = document.getElementById('pwmChart').getContext('2d');
const pwmChart = new Chart(ctxPwm, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'PWM Output (-255 s/d 255)',
        borderColor: '#f97316',
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        borderWidth: 2,
        data: [],
        fill: true,
        pointRadius: 0,
        stepped: 'before'
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.08)' },
        ticks: { color: '#94a3b8', maxTicksLimit: 12 }
      },
      y: {
        min: -260,
        max: 260,
        grid: { color: 'rgba(255, 255, 255, 0.08)' },
        ticks: { color: '#94a3b8' }
      }
    },
    plugins: {
      legend: { labels: { color: '#f8fafc', font: { family: 'Montserrat', weight: '600' } } },
      zoom: {
        pan: { enabled: true, mode: 'xy' },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }
      }
    }
  }
});

/* DETEKSI AUTOMATIS RESIZE KOTAK PWM DENGAN RESIZEOBSERVER */
const resizableBox = document.querySelector('.resizable-box');
if (resizableBox) {
  const resizeObserver = new ResizeObserver(() => {
    if (typeof pwmChart !== 'undefined') {
      pwmChart.resize();
    }
  });
  resizeObserver.observe(resizableBox);
}

function resetChartZoom() {
  telemetryChart.resetZoom();
  pwmChart.resetZoom();
}

function clearChartData() {
  [telemetryChart, pwmChart].forEach(chart => {
    chart.data.labels = [];
    chart.data.datasets.forEach(ds => ds.data = []);
    chart.update();
  });

  peakValue = 0.0;
  t10 = null; 
  t90 = null;
  rpmHistory = [];

  document.getElementById('valOvershoot').innerText = "0.0%";
  document.getElementById('valRiseTime').innerText = "0.00s";
  document.getElementById('valEss').innerText = "0.00";
  document.getElementById('valAvgRpm').innerText = "0.0 RPM";
}

/* SINKRONISASI & ATUR RENTANG SEEKBAR SESUAI MODE KONTROL */
function handleModeChange() {
  const mode = document.getElementById('modeSelect').value;
  const label = document.getElementById('targetLabel');
  const seekbarContainer = document.getElementById('seekbarContainer');

  if (mode === '0') {
    seekbarContainer.style.display = 'none';
    label.innerText = "TARGET VALUE";
  } else {
    seekbarContainer.style.display = 'block';

    if (mode === '1') {
      label.innerText = "TARGET PWM (-255 s/d 255)";
      configureSeekbar(-255, 255, 5, 0);
    } else if (mode === '2') {
      label.innerText = "TARGET SPEED (RPM)";
      configureSeekbar(0, 600, 5, 100);
    } else if (mode === '3') {
      label.innerText = "TARGET SUDUT (DERAJAT)";
      configureSeekbar(0, 360, 1, 90);
    } else if (mode === '4') {
      label.innerText = "TARGET SPEED OPEN LOOP (RPM)";
      configureSeekbar(0, 600, 5, 100);
    }
  }
}

/* FUNGSI HELPER UNTUK MENGATUR LIMIT SEEKBAR DAN INPUT */
function configureSeekbar(min, max, step, defaultValue) {
  const seekbar = document.getElementById('targetSeekbar');
  const targetInput = document.getElementById('targetInput');

  seekbar.min = min;
  seekbar.max = max;
  seekbar.step = step;
  seekbar.value = defaultValue;

  targetInput.step = step;
  targetInput.value = defaultValue;

  document.getElementById('seekbarMinLbl').innerText = min;
  document.getElementById('seekbarMaxLbl').innerText = max;
  document.getElementById('seekbarValLbl').innerText = parseFloat(defaultValue).toFixed(1);
}

/* SINKRONISASI: DARI SEEKBAR KE INPUT ANGKA */
function syncInputFromSeekbar() {
  const val = document.getElementById('targetSeekbar').value;
  document.getElementById('targetInput').value = parseFloat(val).toFixed(1);
  document.getElementById('seekbarValLbl').innerText = parseFloat(val).toFixed(1);
}

/* SINKRONISASI: DARI INPUT ANGKA KE SEEKBAR */
function syncSeekbarFromInput() {
  const val = document.getElementById('targetInput').value;
  if (val !== "") {
    document.getElementById('targetSeekbar').value = val;
    document.getElementById('seekbarValLbl').innerText = parseFloat(val).toFixed(1);
  }
}

/* FUNGSI KONTROL REALTIME SAAT SEEKBAR DIGESER */
function handleSeekbarRealtimeInput() {
  syncInputFromSeekbar();
  if (isConnected) {
    sendTarget();
  }
}

async function toggleConnect() {
  if (isConnected) disconnect();
  else connect();
}

async function connect() {
  if (!("serial" in navigator)) {
    alert("Web Serial API tidak didukung browser ini. Gunakan Google Chrome atau MS Edge.");
    return;
  }
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    
    isConnected = true;
    keepReading = true;
    updateStatusUI('connected');

    const textEncoder = new TextEncoderStream();
    textEncoder.readable.pipeTo(port.writable);
    writer = textEncoder.writable.getWriter();

    readLoop();
  } catch (err) {
    console.error("Koneksi gagal:", err);
  }
}

async function disconnect() {
  keepReading = false;
  if (reader) await reader.cancel();
  if (writer) await writer.close();
  if (port) await port.close();
  
  isConnected = false;
  updateStatusUI('disconnected');
}

async function readLoop() {
  const textDecoder = new TextDecoderStream();
  port.readable.pipeTo(textDecoder.writable);
  reader = textDecoder.readable.getReader();

  let buffer = "";
  while (keepReading) {
    try {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let lines = buffer.split("\n");
      buffer = lines.pop();

      for (let line of lines) {
        parseTelemetry(line.trim());
      }
    } catch (error) {
      console.error("Error membaca data serial:", error);
      break;
    }
  }
}

/* PARSING TELEMETRI ARDUINO & UPDATE KE KEDUA GRAFIK */
function parseTelemetry(line) {
  if (!line.startsWith("DATA:")) return;

  let rawData = line.substring(5);
  let parts = rawData.split(',');

  if (parts.length === 6) {
    let mode = parseInt(parts[0]);
    let currentRPM = parseFloat(parts[1]);
    let targetRPM = parseFloat(parts[2]);
    let currentAngle = parseFloat(parts[3]);
    let targetAngle = parseFloat(parts[4]);
    let currentPWM = parseFloat(parts[5]);

    let target = 0.0;
    let feedback = 0.0;
    let isSpeedMode = (mode === 1 || mode === 2 || mode === 4);

    if (mode === 1) {
      target = currentPWM;
      feedback = currentRPM;
    } else if (mode === 2 || mode === 4) {
      target = targetRPM;
      feedback = currentRPM;
    } else if (mode === 3) {
      target = targetAngle;
      feedback = currentAngle;
    } else {
      target = 0;
      feedback = currentAngle;
    }

    document.getElementById('valMode').innerText = mode;
    document.getElementById('valFeedback').innerText = feedback.toFixed(1);
    document.getElementById('valPwm').innerText = currentPWM.toFixed(0);

    let currentDeg = isSpeedMode ? (Date.now() / 5) % 360 : feedback;
    document.getElementById('motorDisc').style.transform = `rotate(${currentDeg}deg)`;
    document.getElementById('simDegText').innerText = `${feedback.toFixed(1)} ${isSpeedMode ? 'RPM' : '°'}`;
    document.getElementById('lblFeedback').innerText = isSpeedMode ? "Feedback Kecepatan (RPM)" : "Feedback Posisi (Deg)";

    rpmHistory.push(currentRPM);
    let totalRPM = rpmHistory.reduce((acc, val) => acc + val, 0);
    let avgRPM = totalRPM / rpmHistory.length;
    document.getElementById('valAvgRpm').innerText = `${avgRPM.toFixed(1)} RPM`;

    let absTarget = Math.abs(target);
    if (absTarget > 0) {
      if (Math.abs(feedback) > peakValue) peakValue = Math.abs(feedback);
      let os = ((peakValue - absTarget) / absTarget) * 100.0;
      document.getElementById('valOvershoot').innerText = os > 0 ? `+${os.toFixed(1)}%` : '0.0%';

      let currentTime = (Date.now() - startTime) / 1000.0;
      if (t10 === null && Math.abs(feedback) >= absTarget * 0.1) t10 = currentTime;
      if (t90 === null && Math.abs(feedback) >= absTarget * 0.9) t90 = currentTime;
      if (t10 !== null && t90 !== null) {
        document.getElementById('valRiseTime').innerText = `${(t90 - t10).toFixed(2)}s`;
      }

      let ess = Math.abs(target - feedback);
      document.getElementById('valEss').innerText = ess.toFixed(2);
    }

    // UPDATE DATA TELEMETRI & PWM REALTIME KE GRAFIK
    if (!isChartPaused) {
      let now = new Date().toLocaleTimeString();
      
      // Update Grafik Telemetri (RPM / Posisi)
      if (telemetryChart.data.labels.length > 80) {
        telemetryChart.data.labels.shift();
        telemetryChart.data.datasets[0].data.shift();
        telemetryChart.data.datasets[1].data.shift();
      }
      telemetryChart.data.labels.push(now);
      telemetryChart.data.datasets[0].data.push(target);
      telemetryChart.data.datasets[1].data.push(feedback);
      telemetryChart.update('none');

      // Update Grafik PWM Kotak
      if (pwmChart.data.labels.length > 80) {
        pwmChart.data.labels.shift();
        pwmChart.data.datasets[0].data.shift();
      }
      pwmChart.data.labels.push(now);
      pwmChart.data.datasets[0].data.push(currentPWM);
      pwmChart.update('none');
    }
  }
}

function updateStatusUI(state) {
  const badge = document.getElementById('statusBadge');
  const text = document.getElementById('statusText');
  const btnC = document.getElementById('btnConnect');

  if (state === 'connected') {
    badge.classList.add('active');
    text.innerText = 'Connected (Serial USB)';
    btnC.innerHTML = `<i data-feather="power"></i> Disconnect`;
  } else {
    badge.classList.remove('active');
    text.innerText = 'Disconnected';
    btnC.innerHTML = `<i data-feather="power"></i> Connect Serial`;
  }
  feather.replace();
}

async function sendCommand(cmd) {
  if (isConnected && writer) {
    await writer.write(cmd + "\n");
  } else {
    alert("Silakan klik 'Connect Serial' terlebih dahulu untuk terhubung ke perangkat!");
  }
}

function sendTarget() {
  const mode = document.getElementById('modeSelect').value;
  const target = document.getElementById('targetInput').value;
  
  startTime = Date.now();
  peakValue = 0; t10 = null; t90 = null;
  rpmHistory = [];

  sendCommand(`MODE:${mode}`);

  if (mode === '1') {
    sendCommand(`SET_PWM:${target}`);
  } else if (mode === '2') {
    sendCommand(`SET_RPM:${target}`);
  } else if (mode === '3') {
    sendCommand(`SET_ANG:${target}`);
  } else if (mode === '4') {
    sendCommand(`SET_RPM_OL:${target}`);
  }
}

function sendPpr() {
  const pprVal = document.getElementById('pprInput').value;
  if (pprVal && parseFloat(pprVal) > 0) {
    sendCommand(`SET_PPR:${pprVal}`);
  } else {
    alert("Masukkan nilai PPR yang valid!");
  }
}

function sendPidGain() {
  const type = document.getElementById('pidTypeSelect').value;
  const kp = document.getElementById('kpInput').value;
  const ki = document.getElementById('kiInput').value;
  const kd = document.getElementById('kdInput').value;

  if (activeGains[type]) {
    activeGains[type].kp = parseFloat(kp);
    activeGains[type].ki = parseFloat(ki);
    activeGains[type].kd = parseFloat(kd);
  }

  if (type === 'P') {
    sendCommand(`PID_POS:${kp},${ki},${kd}`);
  } else if (type === 'S') {
    sendCommand(`PID_RPM:${kp},${ki},${kd}`);
  }
}

function sendZero() {
  sendCommand("ZERO");
}

function sendResetOrigin() {
  sendCommand("RESET_ORIGIN");
}

/* FITUR GEMINI AI AUTO-TUNING PID */
let recommendedGains = { kp: 0, ki: 0, kd: 0 };
let geminiApiKey = "AQ.Ab8RN6IZpHhyivEOAcLzKoz25APAIKWMBxQbgHkjV5XsKq16fA";

function runGeminiAiAutoTune() {
  executeGeminiAnalysis();
}

function closeApiKeyModal() {
  document.getElementById('apiKeyModal').style.display = 'none';
}

function saveApiKeyAndRun() {
  const keyInput = document.getElementById('geminiApiKeyInput').value.trim();
  if (keyInput) {
    geminiApiKey = keyInput;
  }
  closeApiKeyModal();
  executeGeminiAnalysis();
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function executeGeminiAnalysis() {
  const chartData = telemetryChart.data.datasets;
  const targetArray = chartData[0].data;
  const feedbackArray = chartData[1].data;

  if (!feedbackArray || feedbackArray.length < 10) {
    alert("Data grafik belum cukup untuk dianalisis AI. Jalankan motor terlebih dahulu hingga grafik respon terbentuk.");
    return;
  }

  const pidType = document.getElementById('pidTypeSelect').value;
  const currentKp = parseFloat(document.getElementById('kpInput').value) || 1.0;
  const currentKi = parseFloat(document.getElementById('kiInput').value) || 0.0;
  const currentKd = parseFloat(document.getElementById('kdInput').value) || 0.0;

  const targetVal = Math.abs(targetArray[targetArray.length - 1]);
  if (targetVal === 0) {
    alert("Target setpoint saat ini 0. Berikan target pergerakan terlebih dahulu untuk menganalisis respon motor.");
    return;
  }

  const overshootText = document.getElementById('valOvershoot').innerText;
  const riseTimeText = document.getElementById('valRiseTime').innerText;
  const essText = document.getElementById('valEss').innerText;

  const btn = document.getElementById('btnAiTune');
  const badge = document.getElementById('aiStatusBadge');
  btn.disabled = true;
  btn.innerHTML = `<i data-feather="loader" class="spin"></i> Menganalisis dengan Gemini AI...`;
  badge.innerText = 'Analyzing...';
  feather.replace();

  const sampledFeedback = feedbackArray.slice(-20).map(v => typeof v === 'number' ? v.toFixed(2) : v);

  const systemPrompt = `Anda adalah ahli sistem kontrol otomatis dan tuning PID motor DC modern.
Tugas Anda adalah menganalisis data respon transien motor DC berikut dan merekomendasikan gain PID yang lebih presisi (Kp, Ki, Kd).

Data Sistem Kontrol Motor DC:
- Tipe PID: ${pidType === 'P' ? 'Position PID (Posisi Mode 3)' : 'Speed PID (Kecepatan Mode 2)'}
- Gain Saat Ini: Kp=${currentKp}, Ki=${currentKi}, Kd=${currentKd}
- Target Setpoint: ${targetVal}
- Peak Overshoot: ${overshootText}
- Rise Time: ${riseTimeText}
- Steady State Error (Ess): ${essText}
- Sampling feedback data terakhir: [${sampledFeedback.join(', ')}]

Instruksi Respons:
Berikan keluaran dalam format JSON murni TANPA markdown formatting/fenced blocks. Format JSON harus tepat sebagai berikut:
{
  "kp": number,
  "ki": number,
  "kd": number,
  "diagnosis": "Analisis mendalam mengenai performa sistem (overshoot, ketidakstabilan, osilasi, atau kelembatan) dan penjelasan mengapa nilai Kp, Ki, Kd baru ini dipilih."
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

  const maxRetries = 3;
  let retryCount = 0;
  let success = false;
  let result = null;

  while (retryCount <= maxRetries && !success) {
    try {
      if (retryCount > 0) {
        btn.innerHTML = `<i data-feather="loader" class="spin"></i> Pelayan sibuk, mencuba semula (${retryCount}/${maxRetries})...`;
        feather.replace();
        await sleep(2000 * retryCount);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      result = await response.json();

      if (response.status === 429 || response.status === 503 || (result.error && result.error.code === 429)) {
        retryCount++;
        continue;
      }

      if (result.error) {
        alert("Gagal melakukan analisis Gemini AI: " + result.error.message);
        break;
      }

      success = true;

    } catch (err) {
      console.error("Error AI Auto-Tune:", err);
      retryCount++;
      if (retryCount > maxRetries) {
        alert("Terjadi kesalahan saat berkomunikasi dengan Google Gemini API. Periksa koneksi internet Anda.");
      }
    }
  }

  if (success && result && result.candidates && result.candidates[0]) {
    try {
      const rawContent = result.candidates[0].content.parts[0].text;
      const aiData = JSON.parse(rawContent);

      recommendedGains = {
        kp: parseFloat(aiData.kp) || currentKp,
        ki: parseFloat(aiData.ki) || currentKi,
        kd: parseFloat(aiData.kd) || currentKd
      };

      document.getElementById('recKp').innerText = recommendedGains.kp.toFixed(2);
      document.getElementById('recKi').innerText = recommendedGains.ki.toFixed(2);
      document.getElementById('recKd').innerText = recommendedGains.kd.toFixed(2);
      document.getElementById('aiDiagnosisText').innerText = aiData.diagnosis;
      document.getElementById('aiResultBox').style.display = 'block';

      badge.classList.add('active');
      badge.innerText = 'Gemini Tuned';
    } catch (e) {
      alert("Format respons daripada AI tidak sah.");
    }
  }

  btn.disabled = false;
  btn.innerHTML = `<i data-feather="zap"></i> Analisa & Auto-Tune Gemini AI`;
  feather.replace();
}

function applyAiGains() {
  document.getElementById('kpInput').value = recommendedGains.kp;
  document.getElementById('kiInput').value = recommendedGains.ki;
  document.getElementById('kdInput').value = recommendedGains.kd;

  sendPidGain();
}
