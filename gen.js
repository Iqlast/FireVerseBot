const ethers = require('ethers');
const axios = require('axios');
const fs = require('fs');
const readline = require('readline');
const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

// For chalk 5.x, use ES module import and update syntax:
// import { chalk } from 'chalk';
// Use chalk.magentaBright().bold() instead of chalk.magenta.bold

const API_BASE_URL = 'https://api.fireverseai.com';
const WEB3_URL = 'https://web3.fireverseai.com';
const APP_URL = 'https://app.fireverseai.com';

const DEFAULT_HEADERS = {
    'accept': 'application/json',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'en-US,en;q=0.9',
    'origin': WEB3_URL,
    'referer': `${WEB3_URL}/`,
    'sec-ch-ua': '"Not(A:Brand";v="99", "Microsoft Edge";v="133", "Chromium";v="133"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(chalk.yellow(query), resolve));

function loadProxies() {
    try {
        if (fs.existsSync('proxy.txt')) {
            const proxyList = fs.readFileSync('proxy.txt', 'utf8')
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
            return proxyList.map(proxy => {
                const [url, type = 'http'] = proxy.split('#').map(p => p.trim());
                return { url, type: type.toLowerCase() };
            });
        }
        return [];
    } catch (error) {
        console.log(chalk.red(`⚠️ Error loading proxies: ${error.message}`));
        return [];
    }
}

function createAxiosInstance(proxy = null) {
    const config = {
        timeout: 30000,
        headers: DEFAULT_HEADERS
    };
    if (proxy) {
        const { url, type } = proxy;
        try {
            switch (type) {
                case 'http':
                case 'https':
                    config.httpsAgent = new HttpsProxyAgent(url);
                    break;
                case 'socks4':
                case 'socks5':
                    config.httpsAgent = new SocksProxyAgent(url);
                    break;
            }
        } catch (error) {
            console.log(chalk.red(`⚠️ Error creating proxy agent: ${error.message}`));
        }
    }
    return axios.create(config);
}

class FireverseMusicBot {
    constructor(token, accountIndex, proxy = null) {
        this.baseUrl = API_BASE_URL;
        this.token = token;
        this.accountIndex = accountIndex;
        this.playedSongs = new Set();
        this.songsToPlay = 50;
        this.songCount = 0;
        this.totalListeningTime = 0;
        this.lastHeartbeat = Date.now();
        this.headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.8',
            'content-type': 'application/json',
            'origin': APP_URL,
            'referer': `${APP_URL}/`,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'x-version': '1.0.100',
            'token': token
        };
        this.axios = createAxiosInstance(proxy);
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    log(message, color = 'white', overwrite = false) {
        const prefix = chalk.cyan(`[Account ${this.accountIndex}] `);
        if (overwrite) {
            process.stdout.write(`\r${prefix}${chalk[color](message)}`);
        } else {
            console.log(`${prefix}${chalk[color](message)}`);
        }
    }

    async initialize() {
        try {
            await this.getUserInfo();
            return true;
        } catch (error) {
            this.log(`Error initializing bot: ${error.message}`, 'red');
            return false;
        }
    }

    async getUserInfo() {
        const spinner = ora('Fetching user info...').start();
        try {
            const response = await this.axios.get(`${this.baseUrl}/userInfo/getMyInfo`, { headers: this.headers });
            const { level, expValue, score } = response.data.data;
            spinner.succeed('User info fetched');
            const table = new Table({
                head: [chalk.cyan('Field'), chalk.cyan('Value')],
                colWidths: [20, 30]
            });
            table.push(
                ['Level', chalk.green(level)],
                ['Score', chalk.green(score)],
                ['EXP', chalk.green(expValue)]
            );
            console.log(table.toString());
            return response.data.data;
        } catch (error) {
            spinner.fail(chalk.red(`Error getting user info: ${error.message}`));
            return null;
        }
    }

    async getRecommendedSongs() {
        const spinner = ora('Fetching recommended songs...').start();
        try {
            const response = await this.axios.post(`${this.baseUrl}/home/getRecommend`, { type: 1 }, { headers: this.headers });
            spinner.succeed('Recommended songs fetched');
            return response.data?.data || [];
        } catch (error) {
            spinner.fail(chalk.red(`Error getting recommended songs: ${error.message}`));
            return [];
        }
    }

    async getMusicDetails(musicId) {
        try {
            const response = await this.axios.get(`${this.baseUrl}/music/getDetailById?musicId=${musicId}`, { headers: this.headers });
            return response.data?.data;
        } catch (error) {
            this.log(`Error getting music details: ${error.message}`, 'red');
            return null;
        }
    }

    async sendHeartbeat() {
        try {
            const now = Date.now();
            if (now - this.lastHeartbeat >= 30000) {
                await this.axios.post(`${this.baseUrl}/music/userOnlineTime/receiveHeartbeat`, {}, { headers: this.headers });
                this.lastHeartbeat = now;
                process.stdout.write(chalk.green('💓'));
            }
        } catch (error) {
            // Silent heartbeat errors
        }
    }

    async playMusic(musicId) {
        try {
            await this.axios.post(`${this.baseUrl}/musicUserBehavior/playEvent`, { musicId, event: 'playing' }, { headers: this.headers });
            return true;
        } catch (error) {
            return false;
        }
    }

    async endMusic(musicId) {
        try {
            await this.axios.post(`${this.baseUrl}/musicUserBehavior/playEvent`, { musicId, event: 'playEnd' }, { headers: this.headers });
            return true;
        } catch (error) {
            return false;
        }
    }

    async likeMusic(musicId) {
        try {
            await this.axios.post(`${this.baseUrl}/musicMyFavorite/addToMyFavorite?musicId=${musicId}`, {}, { headers: this.headers });
            return true;
        } catch (error) {
            return false;
        }
    }

    async commentMusic(musicId) {
        try {
            const comments = ["Great song!", "Amazing tune!", "Love this!", "Fantastic music!", "Wonderful piece!"];
            const randomComment = comments[Math.floor(Math.random() * comments.length)];
            await this.axios.post(`${this.baseUrl}/musicComment/addComment`, {
                content: randomComment,
                musicId,
                parentId: 0,
                rootId: 0
            }, { headers: this.headers });
            return true;
        } catch (error) {
            return false;
        }
    }

    async processMusic(song) {
        try {
            this.log(`▶️ Now Playing: ${song.musicName}`, 'green');
            this.log(`👤 Artist: ${song.author || 'Unknown'}`, 'yellow');
            const musicDetails = await this.getMusicDetails(song.id);
            const duration = musicDetails?.duration || song.duration || 180;
            this.log(`⏱️ Duration: ${this.formatTime(duration)}`, 'blue');
            
            if (await this.playMusic(song.id)) {
                await this.likeMusic(song.id);
                this.log('❤️ Liked the song', 'magenta');
                await this.commentMusic(song.id);
                this.log('💬 Commented on the song', 'cyan');
                
                const spinner = ora('Playing song...').start();
                let secondsPlayed = 0;
                for (let timeLeft = duration; timeLeft > 0; timeLeft--) {
                    await this.sendHeartbeat();
                    secondsPlayed++;
                    this.totalListeningTime++;
                    spinner.text = chalk.blue(`⏳ Time remaining: ${this.formatTime(timeLeft)} | Total listening time: ${this.formatTime(this.totalListeningTime)}`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                spinner.succeed(chalk.green('✅ Finished playing'));
                return true;
            }
            return false;
        } catch (error) {
            this.log(`Error processing music: ${error.message}`, 'red');
            return false;
        }
    }

    async performTasks() {
        try {
            const songs = await this.getRecommendedSongs();
            for (const song of songs) {
                if (this.songCount >= this.songsToPlay) break;
                if (this.playedSongs.has(song.id)) continue;
                this.playedSongs.add(song.id);
                await this.processMusic(song);
                this.songCount++;
                
                const table = new Table({
                    head: [chalk.cyan('Metric'), chalk.cyan('Value')],
                    colWidths: [30, 30]
                });
                table.push(
                    ['Songs Played', chalk.green(`${this.songCount}/${this.songsToPlay}`)],
                    ['Total Listening Time', chalk.green(this.formatTime(this.totalListeningTime))]
                );
                console.log(table.toString());
                await this.getUserInfo();
                
                if (this.songCount < this.songsToPlay) {
                    this.log('⏳ Waiting 5 seconds before next song...', 'blue');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
            console.log(chalk.green.bold(`\n🎉 Completed all tasks!`));
            const finalTable = new Table({
                head: [chalk.cyan('Statistic'), chalk.cyan('Value')],
                colWidths: [30, 30]
            });
            finalTable.push(
                ['Songs Played', chalk.green(this.songCount)],
                ['Total Listening Time', chalk.green(this.formatTime(this.totalListeningTime))]
            );
            console.log(finalTable.toString());
        } catch (error) {
            this.log(`Error performing tasks: ${error.message}`, 'red');
        }
    }
}

async function generateWallet() {
    const wallet = ethers.Wallet.createRandom();
    return {
        address: wallet.address,
        privateKey: wallet.privateKey
    };
}

async function getSession(axiosInstance) {
    const spinner = ora('Fetching session...').start();
    try {
        const response = await axiosInstance.get(`${API_BASE_URL}/walletConnect/getSession`);
        spinner.succeed('Session fetched');
        return response.data.data;
    } catch (error) {
        spinner.fail(chalk.red(`Error getting session: ${error.message}`));
        return null;
    }
}

async function getNonce(axiosInstance) {
    const spinner = ora('Fetching nonce...').start();
    try {
        const response = await axiosInstance.get(`${API_BASE_URL}/walletConnect/nonce`);
        spinner.succeed('Nonce fetched');
        return response.data.data.nonce;
    } catch (error) {
        spinner.fail(chalk.red(`Error getting nonce: ${error.message}`));
        return null;
    }
}

async function signMessage(wallet, nonce) {
    const messageToSign = `web3.fireverseai.com wants you to sign in with your Ethereum account:\n${wallet.address}\n\nPlease sign with your account\n\nURI: https://web3.fireverseai.com\nVersion: 1\nChain ID: 8453\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
    const signingKey = new ethers.SigningKey(wallet.privateKey);
    const messageHash = ethers.hashMessage(messageToSign);
    const signature = signingKey.sign(messageHash);
    return {
        message: messageToSign,
        signature: signature.serialized
    };
}

async function verifyWallet(axiosInstance, message, signature, inviteCode) {
    const spinner = ora('Verifying wallet...').start();
    try {
        const response = await axiosInstance.post(`${API_BASE_URL}/walletConnect/verify`, {
            message,
            signature,
            wallet: "bee",
            invitationCode: inviteCode
        });
        spinner.succeed('Wallet verified');
        return response.data;
    } catch (error) {
        spinner.fail(chalk.red(`Error verifying wallet: ${error.message}`));
        return null;
    }
}

async function processWalletAndTasks(wallet, inviteCode, outputStream, index, total, proxy = null) {
    console.log(chalk.cyan.bold(`\n🔄 Processing wallet ${index + 1}/${total}`));
    const table = new Table({
        head: [chalk.cyan('Field'), chalk.cyan('Value')],
        colWidths: [20, 60]
    });
    table.push(
        ['Address', chalk.green(wallet.address)],
        ['Proxy', proxy ? chalk.green(`${proxy.url} (${proxy.type})`) : chalk.yellow('None')]
    );
    console.log(table.toString());
    
    const axiosInstance = createAxiosInstance(proxy);
    const session = await getSession(axiosInstance);
    if (!session) {
        console.log(chalk.red('❌ Failed to get session'));
        return false;
    }
    
    const nonce = await getNonce(axiosInstance);
    if (!nonce) {
        console.log(chalk.red('❌ Failed to get nonce'));
        return false;
    }
    
    const { message, signature } = await signMessage(wallet, nonce);
    const verifyResult = await verifyWallet(axiosInstance, message, signature, inviteCode);
    
    if (verifyResult?.success) {
        const walletInfo = `${verifyResult.data.token}\n`;
        outputStream.write(walletInfo);
        console.log(chalk.green('✅ Wallet successfully verified and saved'));
        return true;
    } else {
        console.log(chalk.red('❌ Wallet verification failed'));
        return false;
    }
}

async function main() {
    // For chalk 5.x, use: chalk.magentaBright().bold()
    console.log(chalk.magenta.bold('🎵 Auto Gen account 🎵'));
    console.log(chalk.magenta('-----------------------------------------------------'));
    
    try {
        const numWallets = parseInt(await question('How many wallets do you want to generate? '));
        if (isNaN(numWallets) || numWallets <= 0) {
            console.log(chalk.red('❌ Please enter a valid number greater than 0.'));
            process.exit(1);
        }
        
        console.log(chalk.blue(`\n🔄 Generating ${numWallets} wallets...`));
        const proxies = loadProxies();
        console.log(chalk.blue(`📡 Loaded ${proxies.length} proxies from proxy.txt`));
        
        const outputStream = fs.createWriteStream('generated_wallets.txt', { flags: 'a' });
        let successCount = 0;
        
        const spinner = ora('Processing wallets...').start();
        for (let i = 0; i < numWallets; i++) {
            spinner.text = `Processing wallet ${i + 1}/${numWallets}`;
            const wallet = await generateWallet();
            const proxy = proxies.length > 0 ? proxies[i % proxies.length] : null;
            const success = await processWalletAndTasks(wallet, "fireverse", outputStream, i, numWallets, proxy);
            if (success) successCount++;
            if (i < numWallets - 1) {
                console.log(chalk.blue('\n⏳ Waiting 3 seconds before next wallet...'));
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        spinner.succeed(chalk.green(`✨ Complete! Successfully generated ${successCount}/${numWallets} wallets`));
        outputStream.end();
        console.log(chalk.green(`📝 Check generated_wallets.txt for wallet information`));
        process.exit(0);
    } catch (error) {
        console.error(chalk.red(`❌ Fatal error: ${error.message}`));
        process.exit(1);
    } finally {
        rl.close();
    }
}

main().catch(error => {
    console.error(chalk.red(`❌ Fatal error: ${error.message}`));
    process.exit(1);
});
