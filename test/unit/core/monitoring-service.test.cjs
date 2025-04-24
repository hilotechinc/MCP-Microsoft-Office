/**
 * @fileoverview Unit tests for MonitoringService: logging and metric tracking.
 * Mocks Winston to verify log output and enrichment.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const winston = require('winston');
const MonitoringService = require('../../../src/core/monitoring-service');

const tmpLogPath = path.join(__dirname, '../../../logs/test-mcp.log');

beforeEach(() => {
    const logsDir = path.dirname(tmpLogPath);
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    if (fs.existsSync(tmpLogPath)) fs.unlinkSync(tmpLogPath);
});

afterAll(() => {
    if (fs.existsSync(tmpLogPath)) fs.unlinkSync(tmpLogPath);
});

// Utility: wait for log file to exist and have at least one line
function waitForLogLine(filePath, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        function check() {
            if (fs.existsSync(filePath)) {
                const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
                if (lines.length > 0) return resolve(lines);
            }
            if (Date.now() - start > timeout) return reject(new Error('Log file not written in time'));
            setTimeout(check, 25);
        }
        check();
    });
}

describe('MonitoringService', () => {
    it('logs info with enriched context', async () => {
        process.env.MCP_LOG_PATH = tmpLogPath;
        MonitoringService._resetLoggerForTest(tmpLogPath);
        MonitoringService.info('Test info', { foo: 'bar' });
        const lines = await waitForLogLine(tmpLogPath, 8000);
        const lastLog = JSON.parse(lines[lines.length - 1]);
        expect(lastLog).toMatchObject({
            message: 'Test info',
            context: { foo: 'bar' },
            pid: process.pid,
            hostname: os.hostname(),
            version: expect.any(String)
        });
    }, 10000);

    it('logs warn with enriched context', async () => {
        process.env.MCP_LOG_PATH = tmpLogPath;
        MonitoringService._resetLoggerForTest(tmpLogPath);
        MonitoringService.warn('Test warn', { a: 1 });
        const lines = await waitForLogLine(tmpLogPath, 8000);
        const lastLog = JSON.parse(lines[lines.length - 1]);
        expect(lastLog).toMatchObject({
            message: 'Test warn',
            context: { a: 1 },
            pid: process.pid,
            hostname: os.hostname(),
            version: expect.any(String)
        });
    }, 10000);

    it('logs debug with enriched context', async () => {
        process.env.MCP_LOG_PATH = tmpLogPath;
        MonitoringService._resetLoggerForTest(tmpLogPath, 'debug');
        MonitoringService.debug('Test debug', { b: 2 });
        const lines = await waitForLogLine(tmpLogPath, 8000);
        const lastLog = JSON.parse(lines[lines.length - 1]);
        // Winston's default format for debug may differ; check both root and .message
        if (lastLog.message && typeof lastLog.message === 'object') {
            expect(lastLog.message).toMatchObject({
                message: 'Test debug',
                context: { b: 2 }
            });
        } else {
            expect(lastLog).toMatchObject({
                message: 'Test debug',
                context: { b: 2 }
            });
        }
    }, 10000);

    it('logs error via logError with enriched context', async () => {
        process.env.MCP_LOG_PATH = tmpLogPath;
        MonitoringService._resetLoggerForTest(tmpLogPath);
        const error = {
            id: '123',
            category: 'test',
            message: 'fail',
            severity: 'error',
            context: { foo: 'bar' },
            timestamp: new Date().toISOString()
        };
        MonitoringService.logError(error);
        const lines = await waitForLogLine(tmpLogPath, 8000);
        const lastLog = JSON.parse(lines[lines.length - 1]);
        expect(lastLog).toMatchObject({
            id: '123',
            category: 'test',
            message: 'fail',
            severity: 'error',
            context: { foo: 'bar' },
            pid: process.pid,
            hostname: os.hostname(),
            version: expect.any(String)
        });
    }, 10000);

    it('logs metrics with type:metric and enriched context', async () => {
        process.env.MCP_LOG_PATH = tmpLogPath;
        MonitoringService._resetLoggerForTest(tmpLogPath);
        MonitoringService.trackMetric('test_metric', 42, { user: 'alice' });
        const lines = await waitForLogLine(tmpLogPath, 8000);
        const lastLog = JSON.parse(lines[lines.length - 1]);
        // Metrics log is nested under message
        expect(lastLog.message).toMatchObject({
            type: 'metric',
            metric: 'test_metric',
            value: 42,
            context: { user: 'alice' },
        });
    }, 10000);
});
