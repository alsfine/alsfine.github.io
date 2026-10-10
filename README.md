# ClearVoice DSP — Open Day Website

This directory contains the mobile-first, interactive demonstration website created for the **University of the Witwatersrand EIE Open Day** by **Ryan Jammy** and **Raphael Alsfine**.

---

## 1. Local Testing

To test or preview the website on your computer or phone over local Wi-Fi:

### Option A: Using Python (Built-in)
Run the following command from the `Website/` folder:
```bash
python -m http.server 8000
```
Then open:
* On your computer: `http://localhost:8000`
* On your phone (connected to the same Wi-Fi): `http://<your-computer-ip>:8000`

### Option B: Direct File Preview
You can also directly double-click `index.html` to open it in any modern browser (Chrome, Safari, Edge, Firefox).

---

## 2. Free Hosting via GitHub Pages (Zero Cost, No Credit Card)

GitHub Pages provides 100% free hosting with automatic HTTPS and no credit card required.

### 3-Step Setup:
1. **Push your code to GitHub**:
   Ensure this `Website/` folder is committed and pushed to your GitHub repository.
2. **Go to Repository Settings**:
   * Open your repository on GitHub.
   * Click **Settings** (top tab) &rarr; **Pages** (in the left sidebar).
3. **Select Source Branch**:
   * Under **Build and deployment** &rarr; **Branch**:
     * Select your active branch (e.g., `main`).
     * In the folder dropdown, choose `/Website` (or `/` if you move files to root or a dedicated `gh-pages` branch).
   * Click **Save**.

Your site will be live within 1–2 minutes at:
```text
https://<your-github-username>.github.io/<repository-name>/
```

---

## 3. Directory Overview

```text
Website/
├── index.html               # Mobile-first interactive Open Day presentation
├── css/
│   └── style.css            # Light-mode default + automatic OS dark mode
├── js/
│   ├── app.js               # Mobile interactions & animated metric bars
│   └── visual-slider.js     # Touch-friendly Before/After signal comparison slider
├── assets/
│   ├── results/             # Archived research graphs (reference storage)
│   ├── figures/             # Archived conceptual plots (reference storage)
│   └── audio/               # Archived test audio clips (reference storage)
└── README.md                # This deployment guide
```
