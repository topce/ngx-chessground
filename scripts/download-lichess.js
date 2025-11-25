#!/usr/bin/env node

/**
 * Download Lichess broadcast .zst files locally
 * 
 * Usage:
 *   npm run download-lichess -- <year> <month>           # Download single month
 *   npm run download-lichess -- <year> <startMonth> <endMonth>  # Download range
 *   npm run download-lichess -- all                      # Download all available (2020-01 to current-1)
 * 
 * Examples:
 *   npm run download-lichess -- 2022 1        # Download January 2022
 *   npm run download-lichess -- 2022 1 3      # Download Jan-Mar 2022
 *   npm run download-lichess -- all           # Download all available months
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://database.lichess.org/broadcast/';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'lichess', 'broadcast');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Download a file from URL to local path
 */
function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(outputPath);

        https.get(url, (response) => {
            if (response.statusCode === 200) {
                const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
                let downloadedBytes = 0;

                response.pipe(file);

                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    if (totalBytes > 0) {
                        const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
                        process.stdout.write(`\r  Progress: ${percent}% (${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)})`);
                    }
                });

                file.on('finish', () => {
                    file.close();
                    console.log(''); // New line after progress
                    resolve();
                });
            } else if (response.statusCode === 404) {
                file.close();
                fs.unlinkSync(outputPath);
                reject(new Error(`File not found (404): ${url}`));
            } else {
                file.close();
                fs.unlinkSync(outputPath);
                reject(new Error(`HTTP ${response.statusCode}: ${url}`));
            }
        }).on('error', (err) => {
            file.close();
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
            reject(err);
        });
    });
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Download a specific month
 */
async function downloadMonth(year, month) {
    const monthStr = month.toString().padStart(2, '0');
    const filename = `lichess_db_broadcast_${year}-${monthStr}.pgn.zst`;
    const url = BASE_URL + filename;
    const outputPath = path.join(OUTPUT_DIR, filename);

    // Check if file already exists
    if (fs.existsSync(outputPath)) {
        console.log(`✓ ${filename} already exists, skipping`);
        return true;
    }

    console.log(`Downloading ${filename}...`);

    try {
        await downloadFile(url, outputPath);
        const stats = fs.statSync(outputPath);
        console.log(`✓ Downloaded ${filename} (${formatBytes(stats.size)})`);
        return true;
    } catch (error) {
        console.error(`✗ Failed to download ${filename}: ${error.message}`);
        return false;
    }
}

/**
 * Download all available months from 2020-01 to current month - 1
 */
async function downloadAll() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    const downloads = [];

    for (let year = 2020; year <= currentYear; year++) {
        const startMonth = (year === 2020) ? 1 : 1;
        const endMonth = (year === currentYear) ? currentMonth : 12;

        for (let month = startMonth; month <= endMonth; month++) {
            downloads.push({ year, month });
        }
    }

    console.log(`Downloading ${downloads.length} files...\n`);

    let successCount = 0;
    let failCount = 0;

    for (const { year, month } of downloads) {
        const success = await downloadMonth(year, month);
        if (success) {
            successCount++;
        } else {
            failCount++;
        }
    }

    console.log(`\nDownload complete: ${successCount} succeeded, ${failCount} failed`);
}

/**
 * Download a range of months
 */
async function downloadRange(year, startMonth, endMonth) {
    console.log(`Downloading ${year}-${startMonth} to ${year}-${endMonth}...\n`);

    let successCount = 0;
    let failCount = 0;

    for (let month = startMonth; month <= endMonth; month++) {
        const success = await downloadMonth(year, month);
        if (success) {
            successCount++;
        } else {
            failCount++;
        }
    }

    console.log(`\nDownload complete: ${successCount} succeeded, ${failCount} failed`);
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Usage:');
    console.log('  npm run download-lichess -- <year> <month>');
    console.log('  npm run download-lichess -- <year> <startMonth> <endMonth>');
    console.log('  npm run download-lichess -- all');
    console.log('');
    console.log('Examples:');
    console.log('  npm run download-lichess -- 2022 1        # Download January 2022');
    console.log('  npm run download-lichess -- 2022 1 3      # Download Jan-Mar 2022');
    console.log('  npm run download-lichess -- all           # Download all available');
    process.exit(1);
}

if (args[0] === 'all') {
    downloadAll();
} else if (args.length === 2) {
    const year = parseInt(args[0], 10);
    const month = parseInt(args[1], 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        console.error('Invalid year or month');
        process.exit(1);
    }

    downloadMonth(year, month);
} else if (args.length === 3) {
    const year = parseInt(args[0], 10);
    const startMonth = parseInt(args[1], 10);
    const endMonth = parseInt(args[2], 10);

    if (isNaN(year) || isNaN(startMonth) || isNaN(endMonth) ||
        startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12 ||
        startMonth > endMonth) {
        console.error('Invalid year or month range');
        process.exit(1);
    }

    downloadRange(year, startMonth, endMonth);
} else {
    console.error('Invalid arguments');
    process.exit(1);
}
