const axios = require('axios');
const fs = require('fs');
const readline = require('readline');

const API_BASE_URL = 'https://api.fireverseai.com';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function readTokens() {
    try {
        return fs.readFileSync('tokens.txt', 'utf8')
            .split('\n')
            .map(token => token.trim())
            .filter(token => token.length > 0);
    } catch (error) {
        console.error('❌ Error reading tokens.txt:', error.message);
        process.exit(1);
    }
}

function createAxiosInstance(token) {
    return axios.create({
        baseURL: API_BASE_URL,
        headers: {
            'accept': '*/*',
            'token': token,
            'x-version': '1.0.100',
            'content-type': 'application/json',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
        }
    });
}

async function getMyBalance(api) {
    try {
        const response = await api.get('/userInfo/getMyInfo');
        return response.data.data.score;
    } catch (error) {
        console.error('❌ Error getting balance:', error.message);
        throw error;
    }
}

async function checkUserExists(api, userId) {
    try {
        const response = await api.get(`/userInfo/getByUserId?userId=${userId}`);
        return response.data.success;
    } catch (error) {
        return false;
    }
}

async function sendPoints(api, userId, amount) {
    try {
        const response = await api.post('/musicUserScore/sendPoints', {
            sendScore: amount,
            sendUserId: parseInt(userId)
        });
        console.log('🔥 API Response:', response.data);
        return response.data.success;
    } catch (error) {
        console.error('❌ Error sending points:', error.message);
        throw error;
    }
}

async function processTransaction(api, tokenIndex, userId) {
    try {
        const balance = await getMyBalance(api);
        console.log(`💰 Token ${tokenIndex + 1} | Balance: ${balance} points`);

        if (balance <= 0) {
            console.log('❌ Insufficient balance. Skipping token...');
            processNextToken(tokenIndex + 1, userId);
            return;
        }

        const amountToSend = Math.floor(balance * 0.79);
        const fee = balance - amountToSend;
        console.log(`📜 Token ${tokenIndex + 1} | Sending ${amountToSend} points (Fee: ${fee})`);

        const success = await sendPoints(api, userId, amountToSend);
        if (success) {
            console.log(`✅ Token ${tokenIndex + 1} | Transaction successful!`);
            const newBalance = await getMyBalance(api);
            console.log(`💰 New Balance: ${newBalance} points`);
        } else {
            console.log('❌ Transaction failed!');
        }

        await new Promise(r => setTimeout(r, 2000)); // Jeda 5 detik sebelum lanjut ke token berikutnya
        processNextToken(tokenIndex + 1, userId);
    } catch (error) {
        console.error(`❌ Token ${tokenIndex + 1} failed. Trying next token...`);
        await new Promise(r => setTimeout(r, 2000)); // Jeda 5 detik sebelum mencoba token berikutnya
        processNextToken(tokenIndex + 1, userId);
    }
}

function processNextToken(tokenIndex, userId) {
    const tokens = readTokens();

    if (tokenIndex >= tokens.length) {
        console.log('\n🚀 All tokens processed. Restarting from first token...');
        processTransaction(createAxiosInstance(tokens[0]), 0, userId);
    } else {
        processTransaction(createAxiosInstance(tokens[tokenIndex]), tokenIndex, userId);
    }
}

function main() {
    console.log('🚀 Points Sender Bot Starting...');

    const tokens = readTokens();
    if (tokens.length === 0) {
        console.error('❌ No tokens found in tokens.txt');
        process.exit(1);
    }

    rl.question('🎯 Enter target user ID: ', async (userId) => {
        processTransaction(createAxiosInstance(tokens[0]), 0, userId);
    });
}

main();
