const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// Bypass SSL issues during testing

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

jest.setTimeout(20000);

const app = path.resolve(__dirname, '..');
const testSite1Location = path.resolve(__dirname, 'test-site-1');
const testSite2Location = path.resolve(__dirname, 'test-site-2');

const site1Links = [
    'http://localhost:3000/',
    'http://localhost:3000/index.html',
    'http://localhost:3000/index.html#abc',
    'http://localhost:3000/page2.html',
    'http://localhost:3000/page3.html',
];

const site2Links = [
    'http://localhost:3000/',
    'http://localhost:3000/index.html',
    'http://localhost:3000/indexfj.html',
    'http://localhost:3000/index.html#abc',
    'http://localhost:3000/page2.html',
    'http://localhost:3000/page3.html',
    'https://xdplugins.pabloklaschka.de/',
];

const runApp = (siteLocation) => {
    return new Promise((resolve, reject) => {
        const process = spawn('node', [app, siteLocation]);

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            resolve({ code, stdout, stderr });
        });

        process.on('error', (err) => {
            reject(err);
        });
    });
};

describe('@waylay/ssblc', () => {
    describe('test-site-1: Site with no broken links', () => {
        let results;

        beforeAll(async () => {
            results = await runApp(testSite1Location);
        });

        it('should stop with an exit code of 0 (success)', () => {
            expect(results.code).toBe(0);
        });

        it('should check all internal links', () => {
            for (let link of site1Links) {
                expect(results.stdout).toContain(link + '\n');
            }
        });

        it('should not output any errors', () => {
            expect(results.stderr).toBeFalsy();
        });
    });

    describe('test-site-2: Site with broken links', () => {
        let results;

        beforeAll(async () => {
            results = await runApp(testSite2Location);
        });

        it('should stop with an exit code of not 0 (failure)', () => {
            // Failures:
            // http://localhost:3000/indexfj.html fails to load with net::ERR_NAME_NOT_RESOLVED
            // https://xdplugins.pabloklaschka.de/ fails to load with net::ERR_SSL_VERSION_OR_CIPHER_MISMATCH
            expect(results.code).not.toBe(0);
        });

        it('should check all internal links', () => {
            for (let link of site2Links) {
                expect(results.stdout).toContain(link + '\n');
            }
        });

        it('should output errors', () => {
            expect(results.stderr).toBeTruthy();
        });
    });

    describe('Exceptions', () => {
        it('should fail when the port is already in use', async () => {
            const server = http.createServer();
            server.listen(3000);
            
            let results;
            try {
                results = await runApp(testSite1Location);
            } catch (error) {
                results = error;
            }

            expect(results.code).not.toBe(0);
            expect(results.stderr).toContain('address already in use');
            server.close();
        });
    });
});
