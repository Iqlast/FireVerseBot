import subprocess
from colorama import init, Fore, Style

# Inisialisasi colorama
init(autoreset=True)

def banner():
    print(Fore.CYAN + Style.BRIGHT + "\n=== MENU UTAMA ===\n")

def menu():
    print(Fore.YELLOW + "Pilih opsi:")
    print(Fore.GREEN + "1. 🎵 Play Music (Python)")
    print(Fore.BLUE + "2. 🛠️ Generate Account (JavaScript)")
    print(Fore.MAGENTA + "3. 📤 Send Point (JavaScript)")
    print(Fore.RED + "0. ❌ Keluar\n")

def main():
    while True:
        banner()
        menu()
        pilihan = input(Fore.WHITE + "Masukkan pilihan (1/2/3/0): ")

        if pilihan == '1':
            print(Fore.CYAN + "▶ Menjalankan play.py ...")
            subprocess.run(["python3", "play.py"])
        elif pilihan == '2':
            print(Fore.CYAN + "⚙️ Menjalankan gen.js ...")
            subprocess.run(["node", "gen.js"])
        elif pilihan == '3':
            print(Fore.CYAN + "📨 Menjalankan send.js ...")
            subprocess.run(["node", "send.js"])
        elif pilihan == '0':
            print(Fore.RED + "👋 Keluar dari program.")
            break
        else:
            print(Fore.LIGHTRED_EX + "❗ Pilihan tidak valid, coba lagi.")

if __name__ == "__main__":
    main()
