const ethers = require('ethers');
const axios = require('axios');
const fs = require('fs');
const readline = require('readline');
const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const API_BASE_URL = 'https://api.fireverseai.com';
const WEB3_URL = 'https://web3.fireverseai.com';

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

async function processWallet(wallet, inviteCode, outputStream, index, total, proxy = null) {
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
        console.log(chalk.green('✅ Wallet successfully verified and token saved'));
        return true;
    } else {
        console.log(chalk.red('❌ Wallet verification failed'));
        return false;
    }
}

async function main() {
    console.log(chalk.magenta.bold('🎵 Auto Generate Wallet & Save Token 🎵'));
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
        
        // Hapus file token lama jika ada
        const outputFile = 'generated_wallets.txt';
        if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile);
            console.log(chalk.yellow('🗑️ Previous token file deleted'));
        }
        
        const outputStream = fs.createWriteStream(outputFile, { flags: 'a' });
        let successCount = 0;
        
        const spinner = ora('Processing wallets...').start();
        for (let i = 0; i < numWallets; i++) {
            spinner.text = `Processing wallet ${i + 1}/${numWallets}`;
            const wallet = await generateWallet();
            const proxy = proxies.length > 0 ? proxies[i % proxies.length] : null;
            const success = await processWallet(wallet, "fireverse", outputStream, i, numWallets, proxy);
            if (success) successCount++;
            if (i < numWallets - 1) {
                console.log(chalk.blue('\n⏳ Waiting 3 seconds before next wallet...'));
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        spinner.succeed(chalk.green(`✨ Complete! Successfully generated ${successCount}/${numWallets} wallets`));
        outputStream.end();
        console.log(chalk.green(`📝 Check ${outputFile} for token information`));
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
