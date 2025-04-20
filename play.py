import aiohttp
import asyncio
import time
import threading
import os
import random
from colorama import init, Fore, Style
from aiohttp_socks import ProxyConnector
from urllib.parse import urlparse

# Initialize colorama
init()

async def read_proxies():
    """Read proxies from proxy.txt."""
    try:
        with open("proxy.txt", "r", encoding="utf-8") as f:
            proxies = [line.strip() for line in f if line.strip() and not line.startswith("#")]
        return proxies
    except Exception as e:
        print(Fore.RED + f"❌ Error reading proxy.txt: {str(e)}" + Style.RESET_ALL)
        return []

async def read_tokens(file_name):
    """Read tokens from the specified file."""
    try:
        with open(file_name, "r", encoding="utf-8") as f:
            tokens = [line.strip() for line in f if line.strip() and not line.startswith("#")]
        return tokens
    except Exception as e:
        print(Fore.RED + f"❌ Error reading {file_name}: {str(e)}" + Style.RESET_ALL)
        return []

# Shared state for account statuses
status_lock = threading.Lock()
account_statuses = {}
stop_display = False

def print_grid():
    """Worker thread to display account statuses in a grid."""
    BANNER = """

╭━━━╮╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╭━╮╭━╮╱╱╱╱╱╱╱╱╱╱╭━━╮╱╱╱╭╮
┃╭━━╯╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱┃┃╰╯┃┃╱╱╱╱╱╱╱╱╱╱┃╭╮┃╱╱╭╯╰╮
┃╰━━┳┳━┳━━┳╮╭┳━━┳━┳━━┳━━╮┃╭╮╭╮┣╮╭┳━━┳┳━━╮┃╰╯╰┳━┻╮╭╯
┃╭━━╋┫╭┫┃━┫╰╯┃┃━┫╭┫━━┫┃━┫┃┃┃┃┃┃┃┃┃━━╋┫╭━╯┃╭━╮┃╭╮┃┃
┃┃╱╱┃┃┃┃┃━╋╮╭┫┃━┫┃┣━━┃┃━┫┃┃┃┃┃┃╰╯┣━━┃┃╰━╮┃╰━╯┃╰╯┃╰╮
╰╯╱╱╰┻╯╰━━╯╰╯╰━━┻╯╰━━┻━━╯╰╯╰╯╰┻━━┻━━┻┻━━╯╰━━━┻━━┻━╯

                🚀🌟⭐ Don't Forget Click 🌟 https://github.com/Iqlast
"""
    while not stop_display:
        with status_lock:
            os.system("cls" if os.name == "nt" else "clear")
            print(Fore.CYAN + BANNER + Style.RESET_ALL)
            box_width = 30
            border = "═" * box_width
            num_accounts = len(account_statuses)
            max_cols = 3
            for row_start in range(0, num_accounts, max_cols):
                for col in range(max_cols):
                    idx = row_start + col
                    if idx < num_accounts:
                        account_id = list(account_statuses.keys())[idx]
                        print(f"{Fore.CYAN}╔{border}╗{Style.RESET_ALL}", end=" ")
                    else:
                        print(" " * (box_width + 4), end=" ")
                print()
                for col in range(max_cols):
                    idx = row_start + col
                    if idx < num_accounts:
                        account_id = list(account_statuses.keys())[idx]
                        print(f"{Fore.CYAN}║ Account {account_id:<{box_width-10}} ║{Style.RESET_ALL}", end=" ")
                    else:
                        print(" " * (box_width + 4), end=" ")
                print()
                for col in range(max_cols):
                    idx = row_start + col
                    if idx < num_accounts:
                        print(f"{Fore.CYAN}╠{border}╣{Style.RESET_ALL}", end=" ")
                    else:
                        print(" " * (box_width + 4), end=" ")
                print()
                max_lines = max([len(status.split("\n")) for status in account_statuses.values()] + [1])
                for line_idx in range(max_lines):
                    for col in range(max_cols):
                        idx = row_start + col
                        if idx < num_accounts:
                            account_id = list(account_statuses.keys())[idx]
                            lines = account_statuses[account_id].split("\n")
                            line = lines[line_idx] if line_idx < len(lines) else ""
                            print(f"{Fore.CYAN}║ {Fore.GREEN}{line:<{box_width-4}}{Style.RESET_ALL} ║", end=" ")
                        else:
                            print(" " * (box_width + 4), end=" ")
                    print()
                for col in range(max_cols):
                    idx = row_start + col
                    if idx < num_accounts:
                        print(f"{Fore.CYAN}╚{border}╝{Style.RESET_ALL}", end=" ")
                    else:
                        print(" " * (box_width + 4), end=" ")
                print()
        time.sleep(0.5)

class FireverseMusicBot:
    def __init__(self, token, account_index, proxy=None):
        self.base_url = "https://api.fireverseai.com"
        self.token = token
        self.account_index = account_index
        self.proxy = proxy
        self.played_songs = set()
        self.daily_play_count = 0
        self.DAILY_LIMIT = 50
        self.last_heartbeat = time.time() * 1000
        self.total_listening_time = 0
        self.headers = {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.8",
            "content-type": "application/json",
            "origin": "https://app.fireverseai.com",
            "referer": "https://app.fireverseai.com/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            "x-version": "1.0.100",
            "sec-ch-ua": '"Not(A:Brand";v="99", "Brave";v="133", "Chromium";v="133"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-site",
            "sec-gpc": "1",
            "token": token
        }
        with status_lock:
            account_statuses[account_index] = f"Initializing...\nProxy: {proxy or 'None'}"

    def log(self, message):
        with status_lock:
            account_statuses[self.account_index] = message

    async def get_session(self):
        if self.proxy:
            parsed = urlparse(self.proxy)
            protocol = parsed.scheme.lower()
            if protocol in ["socks4", "socks5"]:
                connector = ProxyConnector.from_url(self.proxy)
                return aiohttp.ClientSession(connector=connector)
            else:
                return aiohttp.ClientSession()
        return aiohttp.ClientSession()

    async def initialize(self):
        try:
            await self.get_user_info()
            return True
        except Exception as e:
            self.log(f"❌ Init failed: {str(e)}")
            return False

    async def get_user_info(self):
        async with await self.get_session() as session:
            try:
                async with session.get(f"{self.base_url}/userInfo/getMyInfo", headers=self.headers, proxy=self.proxy if self.proxy and urlparse(self.proxy).scheme in ["http", "https"] else None) as response:
                    data = await response.json()
                    user_data = data.get("data", {})
                    level, score = user_data.get("level", 0), user_data.get("score", 0)
                    self.log(f"📊 Level: {level} | Score: {score}")
            except Exception as e:
                self.log(f"❌ User info error: {str(e)}")

    async def get_recommended_songs(self):
        async with await self.get_session() as session:
            try:
                async with session.post(f"{self.base_url}/home/getRecommend", json={"type": 1}, headers=self.headers, proxy=self.proxy if self.proxy and urlparse(self.proxy).scheme in ["http", "https"] else None) as response:
                    data = await response.json()
                    return data.get("data", [])
            except Exception:
                self.log("❌ Song fetch error")
                return []

    async def add_to_history(self, music_id):
        async with await self.get_session() as session:
            try:
                async with session.post(f"{self.base_url}/musicHistory/addToHistory/{music_id}", json={}, headers=self.headers, proxy=self.proxy if self.proxy and urlparse(self.proxy).scheme in ["http", "https"] else None):
                    pass
            except Exception:
                pass

    async def get_music_details(self, music_id):
        async with await self.get_session() as session:
            try:
                async with session.get(f"{self.base_url}/music/getDetailById?musicId={music_id}", headers=self.headers, proxy=self.proxy if self.proxy and urlparse(self.proxy).scheme in ["http", "https"] else None) as response:
                    data = await response.json()
                    return data.get("data")
            except Exception:
                return None

    async def send_heartbeat(self):
        try:
            now = time.time() * 1000
            if now - self.last_heartbeat >= 30000:
                async with await self.get_session() as session:
                    async with session.post(f"{self.base_url}/music/userOnlineTime/receiveHeartbeat", json={}, headers=self.headers, proxy=self.proxy if self.proxy and urlparse(self.proxy).scheme in ["http", "https"] else None):
                        self.last_heartbeat = now
        except Exception:
            pass

    async def play_music(self, music_id):
        async with await self.get_session() as session:
            try:
                async with session.post(f"{self.base_url}/musicUserBehavior/playEvent", json={"musicId": music_id, "event": "playing"}, headers=self.headers, proxy=self.proxy if self.proxy and urlparse(self.proxy).scheme in ["http", "https"] else None):
                    return True
            except Exception:
                return False

    async def end_music(self, music_id):
        async with await self.get_session() as session:
            try:
                async with session.post(f"{self.base_url}/musicUserBehavior/playEvent", json={"musicId": music_id, "event": "playEnd"}, headers=self.headers, proxy=self.proxy if self.proxy and urlparse(self.proxy).scheme in ["http", "https"] else None):
                    return True
            except Exception:
                return False

    async def like_music(self, music_id):
        async with await self.get_session() as session:
            try:
                async with session.post(f"{self.base_url}/musicMyFavorite/addToMyFavorite?musicId={music_id}", json={}, headers=self.headers, proxy=self.proxy if self.proxy and urlparse(self.proxy).scheme in ["http", "https"] else None) as response:
                    data = await response.json()
                    return data.get("success", False)
            except Exception:
                return False

    async def comment_music(self, music_id, content="good one"):
        async with await self.get_session() as session:
            try:
                comment_data = {"content": content, "musicId": music_id, "parentId": 0, "rootId": 0}
                async with session.post(f"{self.base_url}/musicComment/addComment", json=comment_data, headers=self.headers, proxy=self.proxy if self.proxy and urlparse(self.proxy).scheme in ["http", "https"] else None) as response:
                    data = await response.json()
                    return data.get("success", False)
            except Exception:
                return False

    async def play_session(self):
        try:
            if self.daily_play_count >= self.DAILY_LIMIT:
                self.log(f"🎵 Limit reached ({self.daily_play_count}/{self.DAILY_LIMIT})")
                return False

            songs = await self.get_recommended_songs()
            if not songs:
                self.log("❌ No songs available")
                await asyncio.sleep(5)
                return True

            for song in songs:
                if song["id"] in self.played_songs:
                    continue

                self.played_songs.add(song["id"])
                self.daily_play_count += 1

                music_details = await self.get_music_details(song["id"]) or {}
                duration = music_details.get("duration", song.get("duration", 180))
                await self.add_to_history(song["id"])

                song_name = song.get("musicName", music_details.get("musicName", "Unknown Song"))
                self.log(f"▶️ Playing: {song_name[:20]}\n📊 {self.daily_play_count}/{self.DAILY_LIMIT}")

                await self.like_music(song["id"])
                await self.comment_music(song["id"])

                if await self.play_music(song["id"]):
                    for time_left in range(duration, 0, -1):
                        await self.send_heartbeat()
                        self.total_listening_time += 1
                        await asyncio.sleep(1)
                    if await self.end_music(song["id"]):
                        self.log("✅ Song finished")
                    else:
                        self.log("⚠️ End event failed")
                    await self.get_user_info()
                    break
                else:
                    self.log("❌ Play failed")

            return True
        except Exception as e:
            self.log(f"❌ Session error: {str(e)}")
            await asyncio.sleep(5)
            return True

    async def start_daily_loop(self):
        while True:
            should_continue = await self.play_session()
            if not should_continue:
                self.log("⏰ Waiting 24h for reset")
                for _ in range(24 * 60 * 60):
                    await asyncio.sleep(1)
                self.daily_play_count = 0
                self.played_songs.clear()
                self.total_listening_time = 0
                self.log("🔄 New session")
                await self.get_user_info()
            else:
                await asyncio.sleep(5)

    def run(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(self.start_daily_loop())

def main():
    global stop_display
    # Prompt for mode selection as the very first action
    print()  # Blank line for clarity
    while True:
        print(Fore.CYAN + "Select mode:" + Style.RESET_ALL)
        print(Fore.CYAN + "1. Run main account (token.txt)" + Style.RESET_ALL)
        print(Fore.CYAN + "2. Run referral accounts (generated_wallets.txt)" + Style.RESET_ALL)
        mode = input(Fore.CYAN + "Enter choice (1 or 2): " + Style.RESET_ALL).strip()
        if mode in ["1", "2"]:
            break
        print(Fore.RED + "❌ Please enter '1' or '2'" + Style.RESET_ALL)

    # Set token file based on mode
    token_file = "token.txt" if mode == "1" else "generated_wallets.txt"

    # Prompt for proxy usage
    print()  # Blank line for clarity
    while True:
        use_proxy = input(Fore.CYAN + "Use proxy (y/n)? " + Style.RESET_ALL).strip().lower()
        if use_proxy in ["y", "n"]:
            break
        print(Fore.RED + "❌ Please enter 'y' or 'n'" + Style.RESET_ALL)

    # Start grid display thread only after prompts
    threading.Thread(target=print_grid, daemon=True).start()

    # Proceed with other outputs
    proxies = []
    if use_proxy == "y":
        print()  # Add spacing
        proxies = asyncio.run(read_proxies())
        if not proxies:
            print(Fore.RED + "❌ No proxies found, running without proxies" + Style.RESET_ALL)

    tokens = asyncio.run(read_tokens(token_file))
    if not tokens:
        print(Fore.RED + f"❌ No tokens found in {token_file}" + Style.RESET_ALL)
        stop_display = True
        exit(1)

    print(Fore.CYAN + f"📱 Found {len(tokens)} account(s)" + Style.RESET_ALL)
    if proxies:
        print(Fore.CYAN + f"🛡️ Found {len(proxies)} proxy(ies)" + Style.RESET_ALL)

    bots = []
    for i, token in enumerate(tokens):
        proxy = random.choice(proxies) if proxies else None
        bots.append(FireverseMusicBot(token, i + 1, proxy))

    threads = []
    for bot in bots:
        if asyncio.run(bot.initialize()):
            thread = threading.Thread(target=bot.run, daemon=True)
            threads.append(thread)
            thread.start()
        else:
            bot.log("❌ Initialization failed")

    if not threads:
        print(Fore.RED + "❌ No accounts initialized" + Style.RESET_ALL)
        stop_display = True
        exit(1)

    try:
        for thread in threads:
            thread.join()
    except KeyboardInterrupt:
        stop_display = True
        print(Fore.RED + "🛑 Stopping bot..." + Style.RESET_ALL)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(Fore.RED + f"❌ Main error: {str(e)}" + Style.RESET_ALL)
