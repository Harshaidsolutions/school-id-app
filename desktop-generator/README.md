# My School ID Card – Offline ID Card Generator (Windows)

A licensed desktop app (.exe / .msi) that creates ID cards **without internet**:
Excel/CSV → photos & signatures (ZIP or folder) → PNG/JPG/PDF template → design → Generate (one ZIP with 300 DPI cards, A4 print PDF and a details sheet).
It uses the same card engine as the admin website's ID Card Generator.

## How licensing works

* Super admin creates a **licence key** per customer computer in the admin website → **Desktop Licences**.
* The customer installs the app, connects to the internet **once**, enters the key and presses **Activate**.
* The server locks the key to that computer (Windows MachineGuid, hashed) and returns a licence signed with the server's private key.
* From then on the app checks that signature **offline** at every start, plus that the licence belongs to *this* computer. The licence file is also encrypted with Windows (DPAPI).
* Copying the installer or the installed app to another computer does **not** work: the other computer has no licence, and the same key is refused on a second computer.
* To move a customer to a new computer: Desktop Licences → **Move to new PC**, then activate again on the new computer.
* **Disable** blocks new activations immediately. A computer that is already activated keeps working offline until it is reinstalled, its licence is reset, or the licence's expiry date passes. Use an **expiry date** for time-limited customers.

## One-time setup

1. **Create the signing keys** (once, ever):
   ```bash
   cd admin-web/backend
   npm run license:keys
   ```
   * Copy the `DESKTOP_LICENSE_PRIVATE_KEY=...` line into `admin-web/backend/.env` **on the EC2 server**, then restart the backend (`pm2 restart harsha-backend --update-env`). Keep it secret.
   * Copy the printed **public key** (the `-----BEGIN PUBLIC KEY-----` block) into `desktop-generator/electron/publicKey.cjs`, replacing the placeholder.
   * Never regenerate after customers have activated – their licences are signed with this key.
2. Deploy the backend as usual (`bash admin-web/scripts/deploy-ec2.sh`). Its migration adds the `desktop_licenses` table.

## Build the installers (Windows PC)

Requirements: Windows 10/11, Node.js 20+ (https://nodejs.org), Git, internet (for npm only).

```powershell
cd C:\path\to\school-id-app
powershell -ExecutionPolicy Bypass -File .\desktop-generator\scripts\build-windows.ps1
```

Output in `desktop-generator\release\`:
* `MySchoolIDCard-Generator-Setup-1.0.0.exe` – normal installer (recommended)
* `MySchoolIDCard-Generator-Setup-1.0.0.msi` – for IT departments / group policy

Give the customer the installer **and** their licence key (the admin page can send both instructions on WhatsApp).

Windows SmartScreen may show "Windows protected your PC" for unsigned installers. Click **More info → Run anyway**, or buy a code-signing certificate to remove the warning.

## Develop

```bash
cd desktop-generator
npm install
npm run dev        # Vite + Electron; set MSIDC_LICENSE_URL to test against a local backend
```

## Notes

* Fonts: Poppins is built in. Google fonts are not available offline – use the **upload font** button in the text toolbar for any other .ttf/.otf font (it is remembered on that computer).
* Excel: `.xlsx` and `.csv` (first sheet, first row = column names). Old `.xls` files: save as `.xlsx` first.
* Photos are matched to rows by the column chosen under **Match photos by** (e.g. `Photo ID` → `1001.jpg`), or by row number.
* Update the version in `package.json` for every new release.
