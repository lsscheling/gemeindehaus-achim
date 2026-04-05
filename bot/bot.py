import os
import httpx
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://backend:3000")

# Du kannst hier später deine Live-Domain einfügen
# Da die WebApp zwingend HTTPS erfordert, muss hier später die finale URL rein.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://deinedomain.de")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    # 1. Nur im privaten Chat antworten! (Schutz vor Gruppen)
    if update.message.chat.type != "private":
        return

    user = update.message.from_user
    telegram_id = user.id

    try:
        # 2. Beim Backend anfragen (ist der Nutzer schon in der DB?)
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{BACKEND_URL}/api/check-user?telegram_id={telegram_id}")
            resp.raise_for_status()
            data = resp.json()
            is_registered = data.get("registered", False)
            
    except Exception as e:
        print(f"Fehler bei der Server-Anfrage: {e}")
        await update.message.reply_text("Entschuldigung, der Server ist gerade nicht erreichbar.")
        return

    # 3. Den passenden Link für den WebApp-Button setzen
    if is_registered:
        text = (
            f"Hallo {user.first_name}! 👋\n\n"
            "Du bist als Helfer bei uns registriert.\n"
            "Hier geht's direkt zu deinem Dashboard:"
        )
        url_to_open = f"{FRONTEND_URL}/dashboard.html" 
    else:
        text = (
            f"Hallo {user.first_name}! 👋\n\n"
            "Schön, dass du beim Gemeindehaus Achim helfen möchtest.\n"
            "Klicke auf den Button, um das Anmeldeformular zu öffnen:"
        )
        url_to_open = f"{FRONTEND_URL}/anmeldung.html"

    # Inline Keyboard Button mit WebApp Info erstellen
    keyboard = [
        [InlineKeyboardButton("Öffnen", web_app=WebAppInfo(url=url_to_open))]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    # 4. Text und Button an den Nutzer senden
    await update.message.reply_text(text, reply_markup=reply_markup)

def main() -> None:
    if not TOKEN:
        print("Fehler: TELEGRAM_BOT_TOKEN ist nicht gesetzt!")
        return

    print("Starte Telegram Bot...")
    app = Application.builder().token(TOKEN).build()
    
    # Der Bot reagiert nur auf /start
    app.add_handler(CommandHandler("start", start))

    print("Bot wartet auf Nachrichten...")
    app.run_polling()

if __name__ == "__main__":
    main()
