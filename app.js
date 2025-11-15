const API_URL = 'http://localhost:5000/api';
const CARDS = [
    { card: '2269727192', pin: '455427' },
    { card: 'admin', pin: '12345' },
    { card: '1234567890', pin: '123456' },
    { card: '9876543210', pin: '654321' }
];
const SESSION_DURATION = 8 * 3600;
let currentMode = 'manual';
let stream = null;
let scanning = false;
let currentCard = '';

function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.form-content').forEach(f => f.style.display = 'none');

    if (mode === 'manual') {
        document.querySelectorAll('.tab')[0].classList.add('active');
        document.getElementById('manualForm').style.display = 'block';
    } else {
        document.querySelectorAll('.tab')[1].classList.add('active');
        document.getElementById('scanForm').style.display = 'block';
    }
    clearMsg();
}

function handleLogin(e) {
    e.preventDefault();
    const card = document.getElementById('cardInput').value.trim();
    const pin = document.getElementById('pinInput').value.trim();

    if (!card || !pin) {
        showMsg('الرجاء ملء جميع الحقول', 'error');
        return;
    }

    const found = CARDS.find(c => c.card === card && c.pin === pin);
    if (found) {
        currentCard = card;
        showMsg('✓ دخول ناجح!', 'success');
        playSound(800);
        vibrate([100]);
        setTimeout(showSuccess, 800);
    } else {
        showMsg('✗ البيانات غير صحيحة', 'error');
        playSound(400);
        vibrate([100, 50, 100]);
        document.getElementById('pinInput').value = '';
    }
}

async function startCamera() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('cameraScreen').classList.add('active');

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        document.getElementById('video').srcObject = stream;
        scanning = true;
        scanFrame();
    } catch (err) {
        alert('لا يمكن الوصول للكاميرا');
        stopCamera();
    }
}

async function scanFrame() {
    if (!scanning) return;

    const video = document.getElementById('video');
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        setTimeout(scanFrame, 100);
        return;
    }

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // تحويل إلى JPEG وإرسال للـ Backend
    canvas.toBlob(async (blob) => {
        try {
            const formData = new FormData();
            formData.append('image', blob, 'scan.jpg');

            const response = await fetch(API_URL + '/ocr', {
                method: 'POST',
                body: formData,
                timeout: 3000
            });

            if (response.ok) {
                const data = await response.json();
                if (data.card && data.pin) {
                    const found = CARDS.find(c => c.card === data.card && c.pin === data.pin);
                    if (found) {
                        currentCard = data.card;
                        document.getElementById('scanText').textContent = '✓ تم التعرف!';
                        playSound(900);
                        vibrate([50, 100, 50, 100, 50]);

                        scanning = false;
                        setTimeout(() => {
                            stopCamera();
                            showSuccess();
                        }, 800);
                        return;
                    }
                }
            }
        } catch (err) {
            console.log('API Error - using local OCR');
            await localOCR(canvas);
        }

        if (scanning) {
            setTimeout(scanFrame, 400);
        }
    }, 'image/jpeg', 0.8);
}

async function localOCR(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    processImage(imageData);
    ctx.putImageData(imageData, 0, 0);

    try {
        if (typeof Tesseract !== 'undefined') {
            const { data: { text } } = await Tesseract.recognize(
                canvas, 'eng+ara',
                { logger: () => {}, tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: 11 }
            );

            const numbers = extractNumbers(text);
            if (numbers.length >= 2) {
                const found = CARDS.find(c => c.card === numbers[0] && c.pin === numbers[1]);
                if (found) {
                    currentCard = numbers[0];
                    playSound(900);
                    vibrate([50, 100, 50, 100, 50]);
                    scanning = false;
                    setTimeout(() => { stopCamera(); showSuccess(); }, 800);
                }
            }
        }
    } catch (e) {
        console.log('Local OCR Error');
    }
}

function processImage(imageData) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        let gray = r * 0.299 + g * 0.587 + b * 0.114;
        gray = (gray - 128) * 2 + 128;
        gray = Math.max(0, Math.min(255, gray));
        if (gray > 200) gray = 255;
        else if (gray < 50) gray = 0;
        else gray = gray > 128 ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = gray;
    }
}

function extractNumbers(text) {
    const cleaned = text.replace(/[^0-9]/g, ' ').trim();
    const parts = cleaned.split(/\s+/).filter(p => p.length > 3);
    return parts;
}

function stopCamera() {
    scanning = false;
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }
    document.getElementById('cameraScreen').classList.remove('active');
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('scanText').textContent = 'جاري المسح...';
}

function showSuccess() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('successScreen').classList.add('active');
    document.getElementById('displayCard').textContent = currentCard;

    let time = SESSION_DURATION;
    setInterval(() => {
        const h = String(Math.floor(time / 3600)).padStart(2, '0');
        const m = String(Math.floor((time % 3600) / 60)).padStart(2, '0');
        const s = String(time % 60).padStart(2, '0');
        document.getElementById('timer').textContent = `${h}:${m}:${s}`;
        if (time > 0) time--;
    }, 1000);
}

function goBack() {
    document.getElementById('successScreen').classList.remove('active');
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('cardInput').value = '';
    document.getElementById('pinInput').value = '';
    setMode('manual');
}

function logout() {
    if (confirm('تأكيد: قطع الاتصال؟')) location.reload();
}

function showMsg(text, type) {
    const msg = document.getElementById('msg');
    msg.textContent = text;
    msg.className = 'msg show ' + type;
}

function clearMsg() {
    document.getElementById('msg').classList.remove('show');
}

function openWhatsApp() { window.open('https://wa.me/+966501234567', '_blank'); }
function showSales() { alert('نقاط البيع:\nأحمد محمد - الرياض\nفاطمة علي - جدة\nعمر خالد - الدمام'); }

function playSound(freq) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
}

function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
}

const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js';
document.head.appendChild(script);
