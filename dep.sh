#!/bin/bash

echo -e "\e[96m🚀 Menjalankan setup environment...\e[0m"

# Install dependencies Python
echo -e "\n\e[93m📦 Menginstall dependency Python dari requirements.txt ...\e[0m"
if pip3 install -r requirements.txt; then
    echo -e "\e[92m✅ Dependency Python berhasil diinstall!\e[0m"
else
    echo -e "\e[91m❌ Gagal menginstall dependency Python.\e[0m"
fi

# Install module Node.js
echo -e "\n\e[93m📦 Menginstall module Node.js dari package.json ...\e[0m"
if npm install; then
    echo -e "\e[92m✅ Module Node.js berhasil diinstall!\e[0m"
else
    echo -e "\e[91m❌ Gagal menginstall module Node.js.\e[0m"
fi

echo -e "\n\e[96m🎉 Selesai!\e[0m"
