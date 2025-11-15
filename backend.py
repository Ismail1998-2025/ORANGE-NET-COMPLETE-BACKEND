#!/usr/bin/env python3
"""
ORANGE NET - OCR Backend Server
يعمل على MikroTik RouterOS
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import base64
import io
from PIL import Image
import easyocr
import re
import os
import logging

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# تهيئة OCR Reader
try:
    reader = easyocr.Reader(['en', 'ar'], gpu=False)
    logger.info("✓ EasyOCR تم تحميله بنجاح")
except Exception as e:
    logger.error(f"✗ خطأ في تحميل EasyOCR: {e}")
    reader = None

# قاعدة البيانات
VALID_CARDS = [
    {"card": "2269727192", "pin": "455427"},
    {"card": "admin", "pin": "12345"},
    {"card": "1234567890", "pin": "123456"},
    {"card": "9876543210", "pin": "654321"}
]

def enhance_image(image):
    """تحسين الصورة للمسح الضوئي"""
    try:
        # تحويل لرمادي
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        # تحسين التباين
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        # Thresholding
        _, binary = cv2.threshold(enhanced, 150, 255, cv2.THRESH_BINARY)

        # Denoising
        denoised = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))

        return denoised
    except Exception as e:
        logger.error(f"خطأ في تحسين الصورة: {e}")
        return image

def extract_numbers(text):
    """استخراج الأرقام من النص"""
    # إزالة الأحرف وترك الأرقام فقط
    numbers = re.findall(r'\d+', text)

    # تصفية الأرقام الصغيرة
    numbers = [n for n in numbers if len(n) > 3]

    return numbers

@app.route('/api/ocr', methods=['POST'])
def ocr_scan():
    """معالجة صورة المسح"""
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'لا توجد صورة'}), 400

        image_file = request.files['image']
        if image_file.filename == '':
            return jsonify({'error': 'الملف فارغ'}), 400

        # قراءة الصورة
        image = Image.open(image_file.stream)
        image_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

        logger.info(f"📷 صورة جديدة: {image_cv.shape}")

        # تحسين الصورة
        enhanced = enhance_image(image_cv)

        # المسح الضوئي
        if reader:
            results = reader.readtext(enhanced, detail=0)
            raw_text = ' '.join(results)
        else:
            raw_text = ""

        logger.info(f"📝 النص الخام: {raw_text[:100]}")

        # استخراج الأرقام
        numbers = extract_numbers(raw_text)
        logger.info(f"🔢 الأرقام: {numbers}")

        if len(numbers) >= 2:
            card = numbers[0]
            pin = numbers[1]

            # التحقق من البيانات
            valid = any(c['card'] == card and c['pin'] == pin for c in VALID_CARDS)

            return jsonify({
                'success': valid,
                'card': card,
                'pin': pin,
                'valid': valid,
                'message': '✓ تم التعرف!' if valid else '✗ بيانات غير صحيحة'
            })
        else:
            return jsonify({
                'success': False,
                'card': None,
                'pin': None,
                'valid': False,
                'message': 'لم يتم التعرف على الأرقام'
            })

    except Exception as e:
        logger.error(f"❌ خطأ: {e}")
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/api/validate', methods=['POST'])
def validate():
    """التحقق من بيانات المستخدم"""
    try:
        data = request.get_json()
        card = str(data.get('card', '')).strip()
        pin = str(data.get('pin', '')).strip()

        valid = any(c['card'] == card and c['pin'] == pin for c in VALID_CARDS)

        return jsonify({
            'valid': valid,
            'message': '✓ دخول ناجح' if valid else '✗ بيانات خاطئة'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health():
    """فحص صحة الخادم"""
    return jsonify({
        'status': 'active',
        'ocr': 'ready' if reader else 'not-loaded',
        'version': '1.0'
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
