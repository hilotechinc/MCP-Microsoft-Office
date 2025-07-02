/**
 * @fileoverview Database Migration System for MCP Server
 * Handles database schema creation, updates, and version management across SQLite, PostgreSQL, and MySQL.
 */

const fs = require('fs');
const path = require('path');
const ErrorService = require('./error-service.cjs');
const MonitoringService = require('./monitoring-service.cjs');

/**
 * Database Migration Manager
 */
class MigrationManager {
  constructor(databaseFactory) {
    this.databaseFactory = databaseFactory;
    this.migrations = [];
    this.loadMigrations();
  }

  /**
   * Load all migration definitions
   */
  loadMigrations() {
    // Migration 001: Initial schema
    this.migrations.push({
      version: 1,
      name: 'initial_schema',
      description: 'Create initial database schema',
      up: {
        sqlite: `
          CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            user_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(key, user_id)
          );

          CREATE TABLE IF NOT EXISTS secure_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL,
            encrypted_value TEXT NOT NULL,
            user_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(key, user_id)
          );

          CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event TEXT NOT NULL,
            payload TEXT NOT NULL,
            ts DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS migration_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL UNIQUE,
            name TEXT NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            device_secret TEXT NOT NULL,
            user_id TEXT,
            device_name TEXT,
            device_type TEXT,
            last_seen DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_settings_key_user ON settings(key, user_id);
          CREATE INDEX IF NOT EXISTS idx_secure_settings_key_user ON secure_settings(key, user_id);
          CREATE INDEX IF NOT EXISTS idx_history_ts ON history(ts);
          CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
          CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
        `,
        postgresql: `
          CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            key VARCHAR(255) NOT NULL,
            value TEXT NOT NULL,
            user_id VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(key, user_id)
          );

          CREATE TABLE IF NOT EXISTS secure_settings (
            id SERIAL PRIMARY KEY,
            key VARCHAR(255) NOT NULL,
            encrypted_value TEXT NOT NULL,
            user_id VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(key, user_id)
          );

          CREATE TABLE IF NOT EXISTS history (
            id SERIAL PRIMARY KEY,
            event VARCHAR(255) NOT NULL,
            payload TEXT NOT NULL,
            ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS migration_history (
            id SERIAL PRIMARY KEY,
            version INTEGER NOT NULL UNIQUE,
            name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS devices (
            id VARCHAR(255) PRIMARY KEY,
            device_secret VARCHAR(255) NOT NULL,
            user_id VARCHAR(255),
            device_name VARCHAR(255),
            device_type VARCHAR(255),
            last_seen TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_settings_key_user ON settings(key, user_id);
          CREATE INDEX IF NOT EXISTS idx_secure_settings_key_user ON secure_settings(key, user_id);
          CREATE INDEX IF NOT EXISTS idx_history_ts ON history(ts);
          CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
          CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
        `,
        mysql: `
          CREATE TABLE IF NOT EXISTS settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            \`key\` VARCHAR(255) NOT NULL,
            value TEXT NOT NULL,
            user_id VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_key_user (\`key\`, user_id)
          );

          CREATE TABLE IF NOT EXISTS secure_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            \`key\` VARCHAR(255) NOT NULL,
            encrypted_value TEXT NOT NULL,
            user_id VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_key_user (\`key\`, user_id)
          );

          CREATE TABLE IF NOT EXISTS history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event VARCHAR(255) NOT NULL,
            payload TEXT NOT NULL,
            ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS migration_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            version INT NOT NULL UNIQUE,
            name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS devices (
            id VARCHAR(255) PRIMARY KEY,
            device_secret VARCHAR(255) NOT NULL,
            user_id VARCHAR(255),
            device_name VARCHAR(255),
            device_type VARCHAR(255),
            last_seen TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX idx_settings_key_user ON settings(\`key\`, user_id);
          CREATE INDEX idx_secure_settings_key_user ON secure_settings(\`key\`, user_id);
          CREATE INDEX idx_history_ts ON history(ts);
          CREATE INDEX idx_devices_user_id ON devices(user_id);
          CREATE INDEX idx_devices_last_seen ON devices(last_seen);
        `
      },
      down: {
        sqlite: `
          DROP INDEX IF EXISTS idx_history_ts;
          DROP INDEX IF EXISTS idx_secure_settings_key_user;
          DROP INDEX IF EXISTS idx_settings_key_user;
          DROP TABLE IF EXISTS migration_history;
          DROP TABLE IF EXISTS history;
          DROP TABLE IF EXISTS secure_settings;
          DROP TABLE IF EXISTS settings;
          DROP TABLE IF EXISTS devices;
        `,
        postgresql: `
          DROP INDEX IF EXISTS idx_history_ts;
          DROP INDEX IF EXISTS idx_secure_settings_key_user;
          DROP INDEX IF EXISTS idx_settings_key_user;
          DROP TABLE IF EXISTS migration_history;
          DROP TABLE IF EXISTS history;
          DROP TABLE IF EXISTS secure_settings;
          DROP TABLE IF EXISTS settings;
          DROP TABLE IF EXISTS devices;
        `,
        mysql: `
          DROP INDEX idx_history_ts ON history;
          DROP INDEX idx_secure_settings_key_user ON secure_settings;
          DROP INDEX idx_settings_key_user ON settings;
          DROP TABLE IF EXISTS migration_history;
          DROP TABLE IF EXISTS history;
          DROP TABLE IF EXISTS secure_settings;
          DROP TABLE IF EXISTS settings;
          DROP TABLE IF EXISTS devices;
        `
      }
    });

    // Migration 002: Add OAuth device flow columns
    this.migrations.push({
      version: 2,
      name: 'oauth_device_flow',
      description: 'Update devices table with OAuth device flow support',
      up: {
        sqlite: `
          -- Drop existing devices table and recreate with new schema
          DROP TABLE IF EXISTS devices;
          
          CREATE TABLE devices (
            device_id TEXT PRIMARY KEY,
            device_secret TEXT NOT NULL,
            device_code TEXT,
            user_code TEXT,
            verification_uri TEXT,
            expires_at INTEGER,
            is_authorized BOOLEAN DEFAULT FALSE,
            user_id TEXT,
            device_name TEXT,
            device_type TEXT,
            last_seen DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            metadata TEXT
          );
          
          CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
          CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
          CREATE INDEX IF NOT EXISTS idx_devices_device_code ON devices(device_code);
          CREATE INDEX IF NOT EXISTS idx_devices_user_code ON devices(user_code);
          CREATE INDEX IF NOT EXISTS idx_devices_expires_at ON devices(expires_at);
        `,
        postgresql: `
          -- Drop existing devices table and recreate with new schema
          DROP TABLE IF EXISTS devices;
          
          CREATE TABLE devices (
            device_id VARCHAR(255) PRIMARY KEY,
            device_secret TEXT NOT NULL,
            device_code VARCHAR(255),
            user_code VARCHAR(255),
            verification_uri TEXT,
            expires_at BIGINT,
            is_authorized BOOLEAN DEFAULT FALSE,
            user_id VARCHAR(255),
            device_name VARCHAR(255),
            device_type VARCHAR(100),
            last_seen TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            metadata TEXT
          );
          
          CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
          CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
          CREATE INDEX IF NOT EXISTS idx_devices_device_code ON devices(device_code);
          CREATE INDEX IF NOT EXISTS idx_devices_user_code ON devices(user_code);
          CREATE INDEX IF NOT EXISTS idx_devices_expires_at ON devices(expires_at);
        `,
        mysql: `
          -- Drop existing devices table and recreate with new schema
          DROP TABLE IF EXISTS devices;
          
          CREATE TABLE devices (
            device_id VARCHAR(255) PRIMARY KEY,
            device_secret TEXT NOT NULL,
            device_code VARCHAR(255),
            user_code VARCHAR(255),
            verification_uri TEXT,
            expires_at BIGINT,
            is_authorized BOOLEAN DEFAULT FALSE,
            user_id VARCHAR(255),
            device_name VARCHAR(255),
            device_type VARCHAR(100),
            last_seen TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            metadata TEXT
          );
          
          CREATE INDEX idx_devices_user_id ON devices(user_id);
          CREATE INDEX idx_devices_last_seen ON devices(last_seen);
          CREATE INDEX idx_devices_device_code ON devices(device_code);
          CREATE INDEX idx_devices_user_code ON devices(user_code);
          CREATE INDEX idx_devices_expires_at ON devices(expires_at);
        `
      },
      down: {
        sqlite: `
          DROP INDEX IF EXISTS idx_devices_expires_at;
          DROP INDEX IF EXISTS idx_devices_user_code;
          DROP INDEX IF EXISTS idx_devices_device_code;
          DROP INDEX IF EXISTS idx_devices_last_seen;
          DROP INDEX IF EXISTS idx_devices_user_id;
          DROP TABLE IF EXISTS devices;
        `,
        postgresql: `
          DROP INDEX IF EXISTS idx_devices_expires_at;
          DROP INDEX IF EXISTS idx_devices_user_code;
          DROP INDEX IF EXISTS idx_devices_device_code;
          DROP INDEX IF EXISTS idx_devices_last_seen;
          DROP INDEX IF EXISTS idx_devices_user_id;
          DROP TABLE IF EXISTS devices;
        `,
        mysql: `
          DROP INDEX idx_devices_expires_at ON devices;
          DROP INDEX idx_devices_user_code ON devices;
          DROP INDEX idx_devices_device_code ON devices;
          DROP INDEX idx_devices_last_seen ON devices;
          DROP INDEX idx_devices_user_id ON devices;
          DROP TABLE IF EXISTS devices;
        `
      }
    });

    // Migration 003: User Sessions for Multi-User Support
    this.migrations.push({
      version: 3,
      name: 'user_sessions',
      description: 'Create user sessions table for multi-user Microsoft Graph authentication',
      up: {
        sqlite: `
          CREATE TABLE IF NOT EXISTS user_sessions (
            session_id TEXT PRIMARY KEY,
            session_secret TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            last_seen INTEGER NOT NULL,
            user_agent TEXT,
            ip_address TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            microsoft_token TEXT,
            microsoft_refresh_token TEXT,
            microsoft_token_expires_at INTEGER,
            user_info TEXT
          );
          
          CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
          CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON user_sessions(is_active);
          CREATE INDEX IF NOT EXISTS idx_user_sessions_created_at ON user_sessions(created_at);
        `,
        postgresql: `
          CREATE TABLE IF NOT EXISTS user_sessions (
            session_id VARCHAR(255) PRIMARY KEY,
            session_secret VARCHAR(255) NOT NULL,
            expires_at BIGINT NOT NULL,
            created_at BIGINT NOT NULL,
            last_seen BIGINT NOT NULL,
            user_agent TEXT,
            ip_address VARCHAR(255),
            is_active BOOLEAN DEFAULT TRUE,
            microsoft_token TEXT,
            microsoft_refresh_token TEXT,
            microsoft_token_expires_at BIGINT,
            user_info TEXT
          );
          
          CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
          CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON user_sessions(is_active);
          CREATE INDEX IF NOT EXISTS idx_user_sessions_created_at ON user_sessions(created_at);
        `,
        mysql: `
          CREATE TABLE IF NOT EXISTS user_sessions (
            session_id VARCHAR(255) PRIMARY KEY,
            session_secret VARCHAR(255) NOT NULL,
            expires_at BIGINT NOT NULL,
            created_at BIGINT NOT NULL,
            last_seen BIGINT NOT NULL,
            user_agent TEXT,
            ip_address VARCHAR(255),
            is_active BOOLEAN DEFAULT TRUE,
            microsoft_token TEXT,
            microsoft_refresh_token TEXT,
            microsoft_token_expires_at BIGINT,
            user_info TEXT
          );
          
          CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
          CREATE INDEX idx_user_sessions_is_active ON user_sessions(is_active);
          CREATE INDEX idx_user_sessions_created_at ON user_sessions(created_at);
        `
      },
      down: {
        sqlite: `
          DROP INDEX IF EXISTS idx_user_sessions_created_at;
          DROP INDEX IF EXISTS idx_user_sessions_is_active;
          DROP INDEX IF EXISTS idx_user_sessions_expires_at;
          DROP TABLE IF EXISTS user_sessions;
        `,
        postgresql: `
          DROP INDEX IF EXISTS idx_user_sessions_created_at;
          DROP INDEX IF EXISTS idx_user_sessions_is_active;
          DROP INDEX IF EXISTS idx_user_sessions_expires_at;
          DROP TABLE IF EXISTS user_sessions;
        `,
        mysql: `
          DROP INDEX idx_user_sessions_created_at ON user_sessions;
          DROP INDEX idx_user_sessions_is_active ON user_sessions;
          DROP INDEX idx_user_sessions_expires_at ON user_sessions;
          DROP TABLE IF EXISTS user_sessions;
        `
      }
    });

    // Migration 004: User-specific logging table
    this.migrations.push({
      version: 4,
      name: 'user_logs',
      description: 'Create user-specific logging table',
      up: {
        sqlite: `
          CREATE TABLE IF NOT EXISTS user_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            level TEXT NOT NULL,
            message TEXT NOT NULL,
            category TEXT,
            context TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            trace_id TEXT,
            device_id TEXT
          );
          
          CREATE INDEX IF NOT EXISTS idx_user_logs_user_id ON user_logs(user_id);
          CREATE INDEX IF NOT EXISTS idx_user_logs_timestamp ON user_logs(timestamp);
          CREATE INDEX IF NOT EXISTS idx_user_logs_category ON user_logs(category);
          CREATE INDEX IF NOT EXISTS idx_user_logs_level ON user_logs(level);
        `,
        postgresql: `
          CREATE TABLE IF NOT EXISTS user_logs (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            level VARCHAR(50) NOT NULL,
            message TEXT NOT NULL,
            category VARCHAR(100),
            context TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            trace_id VARCHAR(100),
            device_id VARCHAR(100)
          );
          
          CREATE INDEX IF NOT EXISTS idx_user_logs_user_id ON user_logs(user_id);
          CREATE INDEX IF NOT EXISTS idx_user_logs_timestamp ON user_logs(timestamp);
          CREATE INDEX IF NOT EXISTS idx_user_logs_category ON user_logs(category);
          CREATE INDEX IF NOT EXISTS idx_user_logs_level ON user_logs(level);
        `,
        mysql: `
          CREATE TABLE IF NOT EXISTS user_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            level VARCHAR(50) NOT NULL,
            message TEXT NOT NULL,
            category VARCHAR(100),
            context TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            trace_id VARCHAR(100),
            device_id VARCHAR(100)
          );
          
          CREATE INDEX idx_user_logs_user_id ON user_logs(user_id);
          CREATE INDEX idx_user_logs_timestamp ON user_logs(timestamp);
          CREATE INDEX idx_user_logs_category ON user_logs(category);
          CREATE INDEX idx_user_logs_level ON user_logs(level);
        `
      },
      down: {
        sqlite: `
          DROP TABLE IF EXISTS user_logs;
        `,
        postgresql: `
          DROP TABLE IF EXISTS user_logs;
        `,
        mysql: `
          DROP TABLE IF EXISTS user_logs;
        `
      }
    });

    MonitoringService.info('Loaded database migrations', {
      migrationCount: this.migrations.length,
      versions: this.migrations.map(m => m.version)
    }, 'database');
  }

  /**
   * Get current database version
   */
  async getCurrentVersion() {
    try {
      const connection = await this.databaseFactory.getConnection();
      
      // Check if migration_history table exists
      let tableExists = false;
      
      switch (connection.type) {
        case 'sqlite':
          const sqliteResult = await connection.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='migration_history'"
          );
          tableExists = sqliteResult.length > 0;
          break;
          
        case 'postgresql':
          const pgResult = await connection.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'migration_history'"
          );
          tableExists = pgResult.length > 0;
          break;
          
        case 'mysql':
          const mysqlResult = await connection.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'migration_history'"
          );
          tableExists = mysqlResult.length > 0;
          break;
      }

      if (!tableExists) {
        await connection.close();
        return 0; // No migrations applied yet
      }

      // Get latest migration version
      const versionResult = await connection.query(
        'SELECT MAX(version) as max_version FROM migration_history'
      );
      
      await connection.close();
      
      const maxVersion = versionResult[0]?.max_version || 0;
      return maxVersion;

    } catch (error) {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.DATABASE,
        `Failed to get current migration version: ${error.message}`,
        ErrorService.SEVERITIES.ERROR,
        { error: error.stack }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
  }

  /**
   * Apply a single migration
   */
  async applyMigration(migration) {
    const startTime = Date.now();
    
    MonitoringService.info('Applying migration', {
      version: migration.version,
      name: migration.name,
      description: migration.description,
      timestamp: new Date().toISOString()
    }, 'database');

    try {
      const connection = await this.databaseFactory.getConnection();
      
      // Get the appropriate SQL for the database type
      const sql = migration.up[connection.type];
      if (!sql) {
        throw new Error(`No migration SQL defined for database type: ${connection.type}`);
      }

      // Split SQL into individual statements and execute them
      const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
      
      for (const statement of statements) {
        await connection.query(statement.trim());
      }

      // Record migration in history
      await connection.query(
        'INSERT INTO migration_history (version, name) VALUES (?, ?)',
        [migration.version, migration.name]
      );

      await connection.close();

      const executionTime = Date.now() - startTime;
      MonitoringService.trackMetric('migration_applied_success', executionTime, {
        version: migration.version,
        name: migration.name,
        timestamp: new Date().toISOString()
      });

      MonitoringService.info('Migration applied successfully', {
        version: migration.version,
        name: migration.name,
        executionTime,
        timestamp: new Date().toISOString()
      }, 'database');

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.DATABASE,
        `Failed to apply migration ${migration.version} (${migration.name}): ${error.message}`,
        ErrorService.SEVERITIES.CRITICAL,
        { 
          version: migration.version,
          name: migration.name,
          error: error.stack 
        }
      );
      
      MonitoringService.logError(mcpError);
      MonitoringService.trackMetric('migration_applied_failure', executionTime, {
        version: migration.version,
        name: migration.name,
        errorType: error.code || 'unknown',
        timestamp: new Date().toISOString()
      });
      
      throw mcpError;
    }
  }

  /**
   * Run all pending migrations
   */
  async migrate() {
    const startTime = Date.now();
    
    try {
      const currentVersion = await this.getCurrentVersion();
      const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);

      if (pendingMigrations.length === 0) {
        MonitoringService.info('No pending migrations', {
          currentVersion,
          timestamp: new Date().toISOString()
        }, 'database');
        return { applied: 0, currentVersion };
      }

      MonitoringService.info('Starting database migration', {
        currentVersion,
        pendingMigrations: pendingMigrations.length,
        targetVersion: Math.max(...pendingMigrations.map(m => m.version)),
        timestamp: new Date().toISOString()
      }, 'database');

      // Sort migrations by version to ensure proper order
      pendingMigrations.sort((a, b) => a.version - b.version);

      for (const migration of pendingMigrations) {
        await this.applyMigration(migration);
      }

      const finalVersion = await this.getCurrentVersion();
      const executionTime = Date.now() - startTime;

      MonitoringService.info('Database migration completed', {
        previousVersion: currentVersion,
        currentVersion: finalVersion,
        migrationsApplied: pendingMigrations.length,
        executionTime,
        timestamp: new Date().toISOString()
      }, 'database');

      return { 
        applied: pendingMigrations.length, 
        currentVersion: finalVersion,
        previousVersion: currentVersion
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.DATABASE,
        `Database migration failed: ${error.message}`,
        ErrorService.SEVERITIES.CRITICAL,
        { error: error.stack }
      );
      
      MonitoringService.logError(mcpError);
      MonitoringService.trackMetric('migration_failed', executionTime, {
        errorType: error.code || 'unknown',
        timestamp: new Date().toISOString()
      });
      
      throw mcpError;
    }
  }

  /**
   * Get migration status
   */
  async getStatus() {
    try {
      const currentVersion = await this.getCurrentVersion();
      const totalMigrations = this.migrations.length;
      const maxVersion = Math.max(...this.migrations.map(m => m.version));
      const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);

      return {
        currentVersion,
        maxVersion,
        totalMigrations,
        pendingMigrations: pendingMigrations.length,
        upToDate: pendingMigrations.length === 0,
        migrations: this.migrations.map(m => ({
          version: m.version,
          name: m.name,
          description: m.description,
          applied: m.version <= currentVersion
        }))
      };

    } catch (error) {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.DATABASE,
        `Failed to get migration status: ${error.message}`,
        ErrorService.SEVERITIES.ERROR,
        { error: error.stack }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
  }
}

module.exports = {
  MigrationManager
};
