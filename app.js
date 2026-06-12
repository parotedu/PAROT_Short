/* ==========================================================================
   P-Short Client-Side Application Code
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const generatorView = document.getElementById('generator-view');
    const redirectorView = document.getElementById('redirector-view');
    
    // Generator elements
    const shortenForm = document.getElementById('shorten-form');
    const longUrlInput = document.getElementById('long-url');
    const generateBtn = document.getElementById('generate-btn');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    
    // Result elements
    const resultArea = document.getElementById('result-area');
    const shortUrlInput = document.getElementById('short-url');
    const copyBtn = document.getElementById('copy-btn');
    const qrBtn = document.getElementById('qr-btn');
    const openBtn = document.getElementById('open-btn');
    const qrContainer = document.getElementById('qr-container');
    const qrCanvas = document.getElementById('qr-canvas');
    const downloadQrBtn = document.getElementById('download-qr-btn');
    
    // History elements
    const historySection = document.getElementById('history-section');
    const historyList = document.getElementById('history-list');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    
    // Redirector elements
    const redirectTargetUrl = document.getElementById('redirect-target-url');
    const redirectTargetDomain = document.getElementById('redirect-target-domain');
    const countdownNumber = document.getElementById('countdown-number');
    const countdownCircle = document.getElementById('countdown-circle');
    const cancelRedirectBtn = document.getElementById('cancel-redirect-btn');
    const instantRedirectBtn = document.getElementById('instant-redirect-btn');

    // State Variables
    let redirectTimeout = null;
    let redirectInterval = null;
    let qrGenerator = null;

    // Initialize Lucide Icons
    if (window.lucide) {
        window.lucide.createIcons();
    }

    /* ==========================================================================
       1. Base64url Utilities
       ========================================================================== */
    function bytesToBase64Url(bytes) {
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    function base64UrlToBytes(base64url) {
        let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
            base64 += '=';
        }
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function generateCustomHash() {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let part1 = '';
        let part2 = '';
        for (let i = 0; i < 4; i++) {
            part1 += chars.charAt(Math.floor(Math.random() * chars.length));
            part2 += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `${part1}-${part2}`;
    }

    /* ==========================================================================
       2. URL Compression & Encoding
       ========================================================================== */
    async function compressStr(str) {
        const bytes = new TextEncoder().encode(str);
        const stream = new Blob([bytes]).stream();
        const compressedStream = stream.pipeThrough(new CompressionStream('deflate'));
        const chunks = [];
        const reader = compressedStream.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        const blob = new Blob(chunks);
        const buffer = await blob.arrayBuffer();
        return bytesToBase64Url(new Uint8Array(buffer));
    }

    async function decompressStr(hash) {
        const bytes = base64UrlToBytes(hash);
        const stream = new Blob([bytes]).stream();
        const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate'));
        const chunks = [];
        const reader = decompressedStream.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        const blob = new Blob(chunks);
        const buffer = await blob.arrayBuffer();
        return new TextDecoder().decode(buffer);
    }

    function encodeRaw(str) {
        const bytes = new TextEncoder().encode(str);
        return bytesToBase64Url(bytes);
    }

    function decodeRaw(hash) {
        const bytes = base64UrlToBytes(hash);
        return new TextDecoder().decode(bytes);
    }

    // Main Shorten function
    async function shortenURL(url) {
        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const customHash = generateCustomHash();
            
            try {
                const response = await fetch("https://spoo.me/", {
                    method: "POST",
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/x-www-form-urlencoded"
                    },
                    body: `url=${encodeURIComponent(url)}&alias=${customHash}`
                });
                
                if (response.status === 200 || response.status === 400) {
                    const data = await response.json();
                    if (data && data.short_url) {
                        return customHash;
                    } else if (data && data.AliasError) {
                        // Custom alias already in use, try another one
                        console.warn(`Custom alias ${customHash} already taken on spoo.me, retrying...`);
                        continue;
                    }
                }
                break;
            } catch (e) {
                console.warn("External shortener API failed, falling back to local compression", e);
                break;
            }
        }

        // Fallback to local compression if the API is offline/rate-limited
        const rawPart = encodeRaw(url);
        const rawFull = 'r-' + rawPart;
        
        // Use compression if supported
        if (typeof window.CompressionStream === 'undefined') {
            return rawFull;
        }

        try {
            const compPart = await compressStr(url);
            const compFull = 'c-' + compPart;
            // Return whichever is shorter
            return compFull.length < rawFull.length ? compFull : rawFull;
        } catch (e) {
            console.warn("Compression failed, falling back to raw base64", e);
            return rawFull;
        }
    }

    // Main Decompression/Decoding function
    async function expandURL(hash) {
        if (hash.startsWith('c-')) {
            return await decompressStr(hash.substring(2));
        } else if (hash.startsWith('r-')) {
            return decodeRaw(hash.substring(2));
        } else if (/^[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}$/.test(hash)) {
            // It is our custom 8-character short link; resolve through spoo.me
            return `https://spoo.me/${hash}`;
        } else if (/^[a-zA-Z0-9_-]+$/.test(hash) && hash.length <= 12) {
            // It is an external short hash token; resolve through is.gd
            return `https://is.gd/${hash}`;
        } else {
            // Backward compatibility / fallback if marker is missing
            try {
                return await decompressStr(hash);
            } catch (e) {
                return decodeRaw(hash);
            }
        }
    }

    /* ==========================================================================
       3. URL Helpers
       ========================================================================== */
    function normalizeUrl(url) {
        url = url.trim();
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }
        return url;
    }

    function isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch (_) {
            return false;
        }
    }

    function getDomainName(urlStr) {
        try {
            const parsed = new URL(urlStr);
            return parsed.hostname;
        } catch (_) {
            return '';
        }
    }

    /* ==========================================================================
       4. Local Storage History Manager
       ========================================================================== */
    function getHistory() {
        const history = localStorage.getItem('pshort_history');
        return history ? JSON.parse(history) : [];
    }

    function saveHistory(history) {
        localStorage.setItem('pshort_history', JSON.stringify(history));
    }

    function addHistoryItem(original, short) {
        const history = getHistory();
        // Avoid duplicate short URLs in history
        const filtered = history.filter(item => item.short !== short);
        filtered.unshift({
            original,
            short,
            date: new Date().toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            })
        });
        // Limit to 50 items
        if (filtered.length > 50) {
            filtered.pop();
        }
        saveHistory(filtered);
        renderHistory();
    }

    function deleteHistoryItem(shortUrl) {
        const history = getHistory();
        const updated = history.filter(item => item.short !== shortUrl);
        saveHistory(updated);
        renderHistory();
    }

    function renderHistory() {
        const history = getHistory();
        if (history.length === 0) {
            historySection.classList.add('hidden');
            return;
        }

        historySection.classList.remove('hidden');
        historyList.innerHTML = '';

        history.forEach(item => {
            const li = document.createElement('li');
            li.className = 'history-item';
            li.innerHTML = `
                <div class="history-urls">
                    <a href="${item.short}" class="history-short" target="_blank">${item.short}</a>
                    <span class="history-original" title="${item.original}">${item.original}</span>
                </div>
                <div class="history-actions">
                    <button class="btn-icon-only history-copy-btn tooltip" data-tooltip="Copy Link" data-url="${item.short}">
                        <i data-lucide="copy"></i>
                    </button>
                    <button class="btn-icon-only history-qr-btn tooltip" data-tooltip="Show QR Code" data-url="${item.short}">
                        <i data-lucide="qr-code"></i>
                    </button>
                    <button class="btn-icon-only delete-item-btn tooltip" data-tooltip="Delete" data-url="${item.short}">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;
            historyList.appendChild(li);
        });

        // Initialize actions
        document.querySelectorAll('.history-copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = btn.getAttribute('data-url');
                copyTextToClipboard(url, btn);
            });
        });

        document.querySelectorAll('.history-qr-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = btn.getAttribute('data-url');
                showQrForLink(url);
            });
        });

        document.querySelectorAll('.delete-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = btn.getAttribute('data-url');
                deleteHistoryItem(url);
            });
        });

        // Re-trigger Lucide to render icons
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    /* ==========================================================================
       5. Clipboard Manager
       ========================================================================== */
    function copyTextToClipboard(text, buttonEl) {
        navigator.clipboard.writeText(text).then(() => {
            // Visual feedback on the button
            const icon = buttonEl.querySelector('i');
            const originalIconName = icon.getAttribute('data-lucide');
            
            buttonEl.setAttribute('data-tooltip', 'Copied!');
            icon.setAttribute('data-lucide', 'check');
            buttonEl.classList.add('text-accent');
            
            if (window.lucide) {
                window.lucide.createIcons();
            }

            setTimeout(() => {
                buttonEl.setAttribute('data-tooltip', 'Copy Link');
                icon.setAttribute('data-lucide', originalIconName);
                buttonEl.classList.remove('text-accent');
                if (window.lucide) {
                    window.lucide.createIcons();
                }
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    }

    /* ==========================================================================
       6. QR Code Integration
       ========================================================================== */
    function showQrForLink(url) {
        qrContainer.classList.remove('hidden');
        
        if (!qrGenerator) {
            qrGenerator = new QRious({
                element: qrCanvas,
                size: 200,
                foreground: '#8b5cf6', // Indigo-violet matching brand color
                background: '#ffffff',
                level: 'H'
            });
        }
        
        qrGenerator.value = url;
        
        // Scroll to output result if coming from history
        resultArea.classList.remove('hidden');
        shortUrlInput.value = url;
        openBtn.href = url;
        
        resultArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Download QR canvas as PNG
    downloadQrBtn.addEventListener('click', () => {
        const dataUrl = qrCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'p-short-qr.png';
        link.href = dataUrl;
        link.click();
    });

    /* ==========================================================================
       7. Generator View Handling
       ========================================================================== */
    shortenForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.classList.add('hidden');
        
        let url = longUrlInput.value.trim();
        url = normalizeUrl(url);

        if (!isValidUrl(url)) {
            errorText.textContent = "Please enter a valid URL (e.g. https://example.com).";
            errorMessage.classList.remove('hidden');
            return;
        }

        // Disable button while processing
        generateBtn.disabled = true;
        const btnText = generateBtn.querySelector('span');
        const originalText = btnText.textContent;
        btnText.textContent = 'Generating...';

        try {
            const shortHash = await shortenURL(url);
            
            // Build shortened link dynamically relative to current origin and path
            const shortUrl = window.location.origin + window.location.pathname + '#' + shortHash;
            
            // Show result
            shortUrlInput.value = shortUrl;
            openBtn.href = shortUrl;
            resultArea.classList.remove('hidden');
            qrContainer.classList.add('hidden'); // Hide QR until clicked
            
            // Add to history
            addHistoryItem(url, shortUrl);
            
            // Focus result input
            shortUrlInput.select();
        } catch (err) {
            console.error(err);
            errorText.textContent = "An error occurred while compressing the link. Please try again.";
            errorMessage.classList.remove('hidden');
        } finally {
            generateBtn.disabled = false;
            btnText.textContent = originalText;
        }
    });

    copyBtn.addEventListener('click', () => {
        copyTextToClipboard(shortUrlInput.value, copyBtn);
    });

    qrBtn.addEventListener('click', () => {
        if (qrContainer.classList.contains('hidden')) {
            showQrForLink(shortUrlInput.value);
        } else {
            qrContainer.classList.add('hidden');
        }
    });

    clearHistoryBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear all shortened links from history?")) {
            localStorage.removeItem('pshort_history');
            renderHistory();
        }
    });

    /* ==========================================================================
       8. Redirector View & Routing Logic
       ========================================================================== */
    async function checkRoute() {
        const hash = window.location.hash.substring(1);
        if (!hash) {
            // Show Generator view
            generatorView.classList.remove('hidden');
            redirectorView.classList.add('hidden');
            renderHistory();
            return;
        }

        // Hash present - Redirect mode
        generatorView.classList.add('hidden');
        redirectorView.classList.remove('hidden');

        try {
            const originalUrl = await expandURL(hash);
            if (!isValidUrl(originalUrl)) {
                throw new Error("Decoded value is not a valid URL");
            }

            // Populate Redirect view elements
            redirectTargetUrl.textContent = originalUrl;
            redirectTargetUrl.href = originalUrl;
            
            let domain = getDomainName(originalUrl);
            if (domain === 'is.gd') {
                domain = 'is.gd (Secure Redirect Gateway)';
            }
            redirectTargetDomain.textContent = domain;
            
            instantRedirectBtn.href = originalUrl;

            // Start countdown
            startRedirectCountdown(originalUrl);

        } catch (e) {
            console.error("Redirection failure:", e);
            // Render nice error inside redirector view
            redirectorView.innerHTML = `
                <div class="glass-card redirect-card">
                    <div class="redirect-header">
                        <div class="security-shield" style="background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.2)">
                            <i data-lucide="shield-alert" style="color: var(--danger)"></i>
                        </div>
                        <h2>Invalid Short Link</h2>
                        <p>The link you followed is invalid, corrupted, or has expired.</p>
                    </div>
                    <div class="redirect-actions">
                        <button id="error-home-btn" class="btn btn-primary">
                            <i data-lucide="home"></i> Go to P-Short Homepage
                        </button>
                    </div>
                </div>
            `;
            
            if (window.lucide) {
                window.lucide.createIcons();
            }

            document.getElementById('error-home-btn').addEventListener('click', () => {
                window.location.hash = '';
                window.location.reload();
            });
        }
    }

    function startRedirectCountdown(targetUrl) {
        let secondsLeft = 3;
        const totalDuration = 3; // in seconds
        
        countdownNumber.textContent = secondsLeft;
        
        const circumference = 2 * Math.PI * 50; // Radius of progress ring is 50
        countdownCircle.style.strokeDasharray = circumference;
        countdownCircle.style.strokeDashoffset = 0; // Starts fully drawn

        const updateRateMs = 20; // Smoother animations
        const totalSteps = (totalDuration * 1000) / updateRateMs;
        let stepCount = 0;

        // Visual Countdown Progress Ring Animation
        redirectInterval = setInterval(() => {
            stepCount++;
            const progressRatio = stepCount / totalSteps;
            const newOffset = progressRatio * circumference;
            countdownCircle.style.strokeDashoffset = newOffset;

            // Update numerical text
            const roundedSeconds = Math.ceil(totalDuration - (progressRatio * totalDuration));
            if (roundedSeconds !== parseInt(countdownNumber.textContent) && roundedSeconds >= 0) {
                countdownNumber.textContent = roundedSeconds;
            }

            if (stepCount >= totalSteps) {
                clearInterval(redirectInterval);
            }
        }, updateRateMs);

        // Actual Redirection Timeout
        redirectTimeout = setTimeout(() => {
            window.location.replace(targetUrl);
        }, totalDuration * 1000);
    }

    // Cancel Button Actions
    cancelRedirectBtn.addEventListener('click', () => {
        // Clear timeouts/intervals
        clearTimeout(redirectTimeout);
        clearInterval(redirectInterval);
        
        // Remove hash from URL and reload page cleanly to home screen
        window.location.hash = '';
        window.location.reload();
    });

    // Handle hash change events dynamically
    window.addEventListener('hashchange', () => {
        clearTimeout(redirectTimeout);
        clearInterval(redirectInterval);
        checkRoute();
    });

    // Run router on initial page load
    checkRoute();
});
