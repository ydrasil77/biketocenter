# Dark Velocity — User Guide

Welcome to **Dark Velocity** — a multiplayer indoor cycling race game that uses your real bike power (via Bluetooth) or keyboard simulation.

---

## Getting Started

Open the app in your browser. You'll see the home screen with the **global leaderboard** at the top and two buttons at the bottom:

- **RIDER** — Join or create a race as a cyclist
- **INSTRUCTOR** — Create and manage a class session

---

## Playing as a Rider

### Step 1 — Choose RIDER
Tap the **RIDER** button on the home screen.

### Step 2 — Find a race
The **Ongoing Races** screen shows all active rooms:
- 🟢 **LIVE** — Race already started, join mid-race
- 🔵 **WAITING** — Race hasn't started yet, join the lobby
- ⛰️ **MOUNTAIN** — A mountain climb race (e.g. Alpe d'Huez)

You can also type a room code manually (given to you by your instructor) and press **JOIN**.

### Step 3 — Set up in the Lobby
Before joining, configure your profile:

| Field | Description |
|-------|-------------|
| **Name** | Your display name shown to other riders |
| **Weight (kg)** | Used to calculate watts/kg (W/kg) |
| **FTP (watts)** | Functional Threshold Power — affects speed calculation |
| **Gender** | Used for physics calculations |
| **City** | The city map you'll race in |
| **Room Code** | Pre-filled if you clicked a room, or enter manually |
| **Play Mode** | Solo / Team / Mountain |

Click **CONNECT BLUETOOTH** to pair your smart trainer or power meter. If you don't have one, the app simulates your power with keyboard/slider controls.

Click **START RIDING** when ready.

### Step 4 — Race!

**On the map:**
- Your bike 🚴 moves through the city in real-time
- Other riders are shown as colored dots
- Traffic lights stop you when red
- 🚔 Police checkpoints may stop you briefly

**HUD panels (left side):**
| Panel | What it shows |
|-------|---------------|
| **PWR** | Current watts output |
| **SPEED** | Speed in km/h |
| **HR** | Heart rate (if sensor connected) |
| **W/KG** | Watts per kilogram (your effort level) |
| **CADENCE** | Pedal RPM |
| **INCLINE** | Current road grade % |

**Progress bar** at the top shows distance to the finish.

**Leaderboard** on the right shows all riders ranked by distance.

### Finishing

When you reach the finish, you'll see a results screen. You can then upload your ride to **Strava** if connected.

---

## Mountain Mode

Mountain races follow a real climb profile (e.g. Alpe d'Huez).

- The screen shows a **side-on mountain profile** instead of the city map
- Your effort determines climbing speed
- Grade (%) is shown prominently — goes red above 8%, orange above 5%
- Rider boxes show name, W/kg, and heart rate
- The leaderboard is embedded in the mountain view

---

## Playing as an Instructor

### Step 1 — Choose INSTRUCTOR

### Step 2 — Configure the session
Set up the race parameters:
- **City** or **Mountain** to race in
- **Race distance**
- **Room code** (auto-generated, share this with your riders)
- **Number of bots** (optional simulated riders)

Click **START SESSION**.

### Step 3 — The Instructor View

You see the full map/mountain with all riders. Controls in the top bar:

| Control | Action |
|---------|--------|
| 🤖 + number + **▶ SIM** | Add simulated bot riders |
| **⏹ STOP** | Remove bots |
| **🏁 START** | Begin the race countdown (3-2-1-GO!) |
| **✕ END** | End the session and return to home |

**Bottom left panel** shows:
- QR code — riders can scan to join instantly
- Room code
- Number of riders on the map

### Sharing the Room Code
Give riders either:
- The **room code** (e.g. `CPH_1234`) to type manually
- The **QR code** to scan with their phone

---

## Bluetooth / Smart Trainer

The app connects to:
- **Smart trainers** (Wahoo, Tacx, Elite, etc.) via Bluetooth LE
- **Power meters**
- **Heart rate monitors**

To connect:
1. In the Lobby, click **CONNECT BLUETOOTH**
2. Your browser will scan for nearby devices
3. Select your trainer/sensor from the list
4. The PWR and HR panels will start showing live data

> ⚠️ Bluetooth only works in Chrome or Edge (desktop). It does not work in Firefox or Safari.

---

## Keyboard / Mouse Controls (no Bluetooth)

If you don't have a smart trainer, use the simulation controls:

| Control | Action |
|---------|--------|
| **Power slider** | Set simulated watts |
| **HR slider** | Set simulated heart rate |
| **Cadence slider** | Set simulated cadence |

---

## Team Mode

In team races, riders are automatically assigned to a team based on their W/kg:

| Team | W/kg range | Color |
|------|-----------|-------|
| 🔴 A | 3.5+ | Red |
| 🟠 B | 2.8–3.5 | Orange |
| 🟡 C | 2.0–2.8 | Yellow |
| 🟢 D | under 2.0 | Green |

Team members share a color on the map.

---

## Tips

- Higher FTP + lower weight = faster in the game
- Stay below red traffic lights — they will stop you
- Watch out for police checkpoints 🚔
- In mountain mode, maintaining consistent power is key
- The leaderboard orders by total **distance covered**
