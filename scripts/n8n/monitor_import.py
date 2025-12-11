#!/usr/bin/env python3
"""
Monitor d'import des workflows n8n
Affiche la progression toutes les 5 secondes
"""

import sqlite3
import time
import sys
from datetime import datetime

DB_PATH = "/home/fsebb/.n8n/database.sqlite"
TOTAL_WORKFLOWS = 2061
REFRESH_INTERVAL = 5  # secondes

def get_count():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM workflow_entity")
        count = cursor.fetchone()[0]
        conn.close()
        return count
    except Exception as e:
        return -1

def main():
    print("=" * 50)
    print("📊 Monitor d'import des workflows n8n")
    print("=" * 50)
    print(f"Rafraîchissement toutes les {REFRESH_INTERVAL}s (Ctrl+C pour quitter)\n")

    start_time = time.time()
    last_count = 0

    try:
        while True:
            count = get_count()
            now = datetime.now().strftime("%H:%M:%S")
            pct = (count / TOTAL_WORKFLOWS) * 100

            # Calcul vitesse
            elapsed = time.time() - start_time
            if elapsed > 0 and count > 0:
                speed = count / elapsed  # workflows par seconde
                remaining = TOTAL_WORKFLOWS - count
                if speed > 0:
                    eta_seconds = remaining / speed
                    eta_min = int(eta_seconds // 60)
                    eta_sec = int(eta_seconds % 60)
                    eta_str = f"{eta_min}m{eta_sec}s"
                else:
                    eta_str = "???"
            else:
                eta_str = "calcul..."
                speed = 0

            # Barre de progression
            bar_width = 30
            filled = int(bar_width * count / TOTAL_WORKFLOWS)
            bar = "█" * filled + "░" * (bar_width - filled)

            # Affichage
            delta = count - last_count
            delta_str = f"(+{delta})" if delta > 0 else ""

            print(f"\r[{now}] [{bar}] {count}/{TOTAL_WORKFLOWS} ({pct:.1f}%) {delta_str} | ETA: {eta_str}    ", end="", flush=True)

            # Terminé ?
            if count >= TOTAL_WORKFLOWS:
                print(f"\n\n✅ Import terminé ! {count} workflows importés.")
                break

            last_count = count
            time.sleep(REFRESH_INTERVAL)

    except KeyboardInterrupt:
        print(f"\n\n⏹️  Arrêté. {count} workflows importés jusqu'ici.")
        sys.exit(0)

if __name__ == "__main__":
    main()
