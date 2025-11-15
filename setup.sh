#!/bin/bash
# ORANGE NET - Backend Setup Script

echo "🔧 إعداد ORANGE NET Backend..."

# تثبيت Python والمكتبات
pip install -r requirements.txt

# إنشاء مجلد البيانات
mkdir -p /tmp/orange-net

echo "✅ تم الإعداد بنجاح!"
echo "🚀 لتشغيل الخادم: python3 backend.py"
