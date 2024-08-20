#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const process = require('process');
const url = require('url');
const express = require('express');
const puppeteer = require('puppeteer');

const packageInfo = require('./package');

let maxConcurrentChecks = 5;
let protocolTimeout = 30000;
let pageLoadTimeout = 60000;
let port = 3000;
let baseUrl = `http://localhost:${port}`;
let ignoreStatuses = new Set();
let dryRun = false;

let dir = path.resolve(__dirname, process.argv[2] || process.cwd());
let contextFile = null;
let vars = {};

process.argv.forEach((arg, index) => {
    if (arg === '--context' && process.argv[index + 1]) {
        contextFile = path.resolve(process.argv[index + 1]);
        if (fs.existsSync(contextFile)) {
            vars = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
            console.log(`Loaded context variables from ${contextFile}`);
        } else {
            console.error(`Context file not found: ${contextFile}`);
            process.exit(1);
        }
    } else if (arg === '--max-concurrent-checks' && process.argv[index + 1]) {
        maxConcurrentChecks = parseInt(process.argv[index + 1], 10);
    } else if (arg === '--protocol-timeout' && process.argv[index + 1]) {
        protocolTimeout = parseInt(process.argv[index + 1], 10);
    } else if (arg === '--page-load-timeout' && process.argv[index + 1]) {
        pageLoadTimeout = parseInt(process.argv[index + 1], 10);
    } else if (arg === '--port' && process.argv[index + 1]) {
        port = parseInt(process.argv[index + 1], 10);
        baseUrl = `http://localhost:${port}`;
    } else if (arg === '--ignore-statuses' && process.argv[index + 1]) {
        ignoreStatuses = new Set(process.argv[index + 1].split(',').map(Number));
    } else if (arg === '--dry-run') {
        dryRun = true;
    }
});

if (process.argv.includes('-h') || process.argv.includes('--help')) {
    console.log('ssblc: Static Site Broken Link Checker');
    console.log('A broken-link checker for static sites, like the ones generated with docsify');
    console.log();
    console.log('Usage:');
    console.log('ssblc [directory]\tChecks the static site in the directory, CWD if none is specified');
    console.log('--context [file]\tLoads a JSON file with context variables for link replacement');
    console.log('--max-concurrent-checks [number]\tSets the maximum number of concurrent checks (default: 5)');
    console.log('--protocol-timeout [milliseconds]\tSets the protocol timeout for Puppeteer (default: 30000 ms)');
    console.log('--page-load-timeout [milliseconds]\tSets the page load timeout for Puppeteer (default: 60000 ms)');
    console.log('--port [number]\tSets the port number for the local server (default: 3000)');
    console.log('--ignore-statuses [statuses]\tComma-separated list of HTTP statuses to ignore (e.g., 401,403)');
    console.log('--dry-run\tIf present, exit with code 0 even if errors are found');
    console.log('-h --help\tDisplays help');
    console.log('-v --version\tPrint version number');
    process.exit(0);
} else if (process.argv.includes('-v') || process.argv.includes('--version')) {
    console.log(`${packageInfo.name} v${packageInfo.version}`);
    console.log(`by ${packageInfo.author}`);
    process.exit(0);
} else {
    let found = 0;
    let checked = 0;

    let foundLinks = new Set([`${baseUrl}/`]);
    let checkedLinks = new Set();
    let unfoundLinks = new Set();
    let ignoredLinks = new Set();

    const startTime = Date.now();

    if (fs.existsSync(dir) && fs.lstatSync(dir).isDirectory()) {
        const app = express();
        app.use(express.static(dir));

        console.log('Starting link check with the following configuration:');
        console.log(`Directory: ${dir}`);
        console.log(`Base URL: ${baseUrl}`);
        console.log(`Max Concurrent Checks: ${maxConcurrentChecks}`);
        console.log(`Protocol Timeout: ${protocolTimeout} ms`);
        console.log(`Page Load Timeout: ${pageLoadTimeout} ms`);
        
        if (contextFile) {
            console.log(`Context File: ${contextFile}`);
        } else {
            console.log('Context File: None');
        }
        
        if (ignoreStatuses.size > 0) {
            console.log(`Ignored HTTP Statuses: ${Array.from(ignoreStatuses).join(', ')}`);
        } else {
            console.log('Ignored HTTP Statuses: None');
        }
        
        console.log(`Dry Run: ${dryRun ? 'Enabled' : 'Disabled'}`);

        const replaceVars = (link) => {
            if (contextFile) {
                const decodedLink = decodeURIComponent(link);
                const replacedLink = decodedLink.replace(/{{\s*vars\.(.*?)\s*}}/g, (match, p1) => {
                    const value = p1.split('.').reduce((acc, key) => (acc && acc[key] !== undefined) ? acc[key] : undefined, vars);
                    return value !== undefined ? value : match;
                });
                return encodeURI(replacedLink);
            }
            return link;
        };

        const action = async () => {
            const browser = await puppeteer.launch({
                headless: true,
                protocolTimeout: protocolTimeout,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const pagePool = await Promise.all(
                Array.from({ length: maxConcurrentChecks }, async () => {
                    const page = await browser.newPage();
                    await page.setDefaultNavigationTimeout(protocolTimeout);
                    await page.setCacheEnabled(false);
                    await page.setRequestInterception(true);

                    // Disable JavaScript and images to reduce load time
                    page.on('request', (req) => {
                        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                            req.abort();
                        } else {
                            req.continue();
                        }
                    });

                    return page;
                })
            );

            const checkLink = async (page, link) => {
                link = replaceVars(link);

                page.once("response", response => {
                    const request = response.request();
                    const url = request.url();

                    if (unfoundLinks.has(url) || ignoredLinks.has(url)) return;
                    if (url === link) {
                        if (ignoreStatuses.has(response.status())) {
                            console.warn(`Ignored ${url} with status ${response.status()}`);
                            ignoredLinks.add(url);
                        } else if (response.status() > 399) {
                            console.error(`Failed to load ${url}: ${response.status()}`);
                            unfoundLinks.add(url);
                        }
                    } else if (response.status() > 399 && url.endsWith('.md') && !url.endsWith('_sidebar.md')) {
                        // Docsify markdown
                        console.error(`Failed to load ${url}: ${response.status()}`);
                        unfoundLinks.add(url);
                    }
                });

                try {
                    if (checkedLinks.has(link)) return;

                    checkedLinks.add(link);
                    console.log(`${checked + 1}/${found + 1} Checking link: ${link}`);
                    const response = await page.goto(link, { timeout: pageLoadTimeout, waitUntil: 'networkidle2' });

                    if (response?.status() < 200 || response?.status() > 299) {
                        if (!ignoreStatuses.has(response?.status())) {
                            console.error(`Failed to load ${link}: ${response.status()}`);
                            unfoundLinks.add(link);
                        }
                        return;
                    }

                    if (link.startsWith(baseUrl)) {
                        const content = await page.content();
                        const newLinks = Array.from(
                            content.matchAll(/href="([^"]*)"/g),
                            m => m[1]
                        ).map(nlink => url.resolve(link, nlink))
                            .filter(nlink => !checkedLinks.has(nlink))
                            .filter(nlink => !foundLinks.has(nlink))
                            .filter(nlink => !foundLinks.has(nlink))
                            .filter(nlink => !nlink.startsWith('mailto:'))
                            .filter(nlink => !nlink.startsWith('tel:'));
                        newLinks.forEach(nlink => foundLinks.add(nlink));
                        found += newLinks.length;
                    }
                } catch (error) {
                    console.error(`Failed to load ${link}: ${error.message}`);
                    unfoundLinks.add(link);
                }
            };

            while (foundLinks.size > 0) {
                const linkBatches = Array.from(foundLinks).splice(0, maxConcurrentChecks);
                linkBatches.forEach(link => foundLinks.delete(link));
                await Promise.all(linkBatches.map((link, i) => checkLink(pagePool[i % maxConcurrentChecks], link)));
                checked += linkBatches.length;
            }

            await Promise.all(pagePool.map(page => page.removeAllListeners('response').close()));
            await browser.close();
        };

        const runServer = async () => {
            const server = app.listen(port);
            console.log(`\nRunning at ${baseUrl} ...\n`);
            try {
                await action();
            } catch (e) {
                console.error(`Something didn't quite work as expected: ${e.message}`);
            } finally {
                server.close(() => {
                    const endTime = Date.now();
                    const elapsedTime = (endTime - startTime) / 1000;

                    console.log('\n=== Summary ===');
                    console.log(`Elapsed Time: ${elapsedTime} seconds`);
                    console.log(`Found Links: ${found}`);
                    console.log(`Checked Links: ${checked}`);
                    console.log(`Broken Links: ${unfoundLinks.size}`);
                    console.log(`Ignored Links (--ignore-statuses): ${ignoredLinks.size}`);

                    if (ignoredLinks.size > 0) {
                        console.warn('\nIgnored links:');
                        console.log(Array.from(ignoredLinks).reduce((previousValue, currentValue) => previousValue + '- ' + currentValue + '\n', ''));
                    }

                    if (unfoundLinks.size > 0) {
                        console.warn('\nBroken links were detected:');
                        console.log(Array.from(unfoundLinks).reduce((previousValue, currentValue) => previousValue + '- ' + currentValue + '\n', ''));
                        process.exit(dryRun ? 0 : 1);
                    } else {
                        console.info('All checks passed, no broken links detected...');
                        process.exit(0);
                    }
                });
            }
        };

        runServer();
    }
}
