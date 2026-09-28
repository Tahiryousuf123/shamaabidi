/**
 * 100% Free Local WhatsApp QR Bot for Shama Abidi PhD AI System
 * -------------------------------------------------------------
 * How it works:
 *   1. Developer scans the QR code using THEIR OWN WhatsApp (Settings -> Linked Devices -> Link a Device).
 *      (Client 0300-2460274 does NOT need to scan anything!)
 *   2. Once connected, this bot automatically sends real WhatsApp alerts directly
 *      to the client's number: 0300-2460274 (+92 300 2460274) and exposes a local
 *      webhook at http://localhost:3005/webhook/whatsapp for the Python backend.
 *
 * Run command:
 *   npm install @whiskeysockets/baileys qrcode-terminal pino
 *   node backend/whatsapp_qr_bot.js
 */

const http = require("http");

async function startWhatsAppBot() {
  let makeWASocket, useMultiFileAuthState, DisconnectReason, qrcode;
  try {
    const baileys = await import("@whiskeysockets/baileys");
    makeWASocket = baileys.default || baileys.makeWASocket;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    DisconnectReason = baileys.DisconnectReason;
    qrcode = (await import("qrcode-terminal")).default;
  } catch (err) {
    console.log("Installing required free WhatsApp QR libraries first...");
    console.log("Run: npm install @whiskeysockets/baileys qrcode-terminal pino");
    process.exit(1);
  }

  const pino = (await import("pino")).default;
  const { state, saveCreds } = await useMultiFileAuthState(".whatsapp_auth_session");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" })
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("\n========================================================");
      console.log("📱 APNE WHATSAPP SE YEH QR CODE SCAN KAREIN:");
      console.log("   (WhatsApp -> Linked Devices -> Link a Device)");
      console.log("   Client (0300-2460274) ko scan karne ki zaroorat NAHI hai!");
      console.log("========================================================\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      console.log("\n✅ WhatsApp Bot Connected Successfully!");
      const clientJid = "923002460274@s.whatsapp.net";
      const welcomeAlert =
        "🎓 *Shama Abidi PhD AI System — Live WhatsApp Alert*\n\n" +
        "👩‍🔬 *New Live 2026 Supervisors Matched:*\n" +
        "1. *Prof. Dr. Chiara Roni* (University of Trieste, Italy) — Carbapenem-Sparing Antimicrobial Stewardship (2026)\n" +
        "2. *Prof. Dr. Taotao Liu* (Guangxi Medical University) — ICU Clinical Pharmacist Antimicrobial Stewardship (2026)\n" +
        "3. *Prof. Dr. Timothy P. Gauthier* (Baptist Health South Florida, USA) — Carbapenem Stewardship (2026)\n\n" +
        "✉️ *Status:* Personalized PhD Email Drafts citing your 5 PJPS & JPPP papers are ready in the Approval Queue.\n" +
        "🔗 *Open Live CRM Dashboard:* https://aspnetaptech-cyber.github.io/shama-abidi-phd-system/";

      try {
        await sock.sendMessage(clientJid, { text: welcomeAlert });
        console.log("📲 Sent Live Automatic WhatsApp Message to Client: 0300-2460274 (+923002460274)!");
      } catch (e) {
        console.error("Failed to send initial WhatsApp message:", e.message);
      }
    }
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        startWhatsAppBot();
      }
    }
  });

  // Start Local Webhook Server on Port 3005 for Python Backend
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/webhook/whatsapp") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const data = JSON.parse(body || "{}");
          const rawPhone = (data.to || "923002460274").replace(/\D/g, "");
          const jid = `${rawPhone.startsWith("03") ? "92" + rawPhone.slice(1) : rawPhone}@s.whatsapp.net`;
          const text = data.message || data.text || "Shama Abidi PhD AI Alert";
          await sock.sendMessage(jid, { text });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "SENT_LIVE_WHATSAPP", to: jid }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else {
      res.writeHead(200);
      res.end("Shama Abidi WhatsApp Bot Active");
    }
  });

  server.listen(3005, () => {
    console.log("🌐 Local WhatsApp Webhook listening on http://localhost:3005/webhook/whatsapp");
  });
}

startWhatsAppBot();
