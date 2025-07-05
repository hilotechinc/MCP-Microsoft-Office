/**
 * @fileoverview Database Backup and Recovery System for MCP Server
 * Provides automated backup, restore, and cleanup functionality for production databases.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ErrorService = require('./error-service.cjs');
const MonitoringService = require('./monitoring-service.cjs');

/**
 * Database Backup Manager
 */
class BackupManager {
  constructor(config, databaseFactory) {
    this.config = config;
    this.databaseFactory = databaseFactory;
    this.backupDir = config.BACKUP_DIR || path.join(__dirname, '../../backups');
    this.retentionDays = config.BACKUP_RETENTION_DAYS || 30;
    this.maxBackups = config.BACKUP_MAX_COUNT || 50;
    
    // Ensure backup directory exists
    this.ensureBackupDirectory();
  }

  /**
   * Ensure backup directory exists
   */
  ensureBackupDirectory() {
    try {
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
        MonitoringService.info('Created backup directory', {
          backupDir: this.backupDir,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
    } catch (error) {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.SYSTEM,
        `Failed to create backup directory: ${error.message}`,
        ErrorService.SEVERITIES.ERROR,
        { backupDir: this.backupDir, error: error.stack }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
  }

  /**
   * Generate backup filename
   */
  generateBackupFilename(type = 'full') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dbType = this.config.DB_TYPE;
    return `mcp-backup-${dbType}-${type}-${timestamp}.sql`;
  }

  /**
   * Create SQLite backup
   */
  async backupSQLite() {
    const startTime = Date.now();
    const backupFilename = this.generateBackupFilename();
    const backupPath = path.join(this.backupDir, backupFilename);

    try {
      // For SQLite, we can simply copy the database file
      const sourcePath = this.config.DB_PATH;
      
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`SQLite database file not found: ${sourcePath}`);
      }

      // Create a SQL dump for better portability
      const connection = await this.databaseFactory.getConnection();
      
      // Get all table names
      const tables = await connection.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );

      let sqlDump = '-- SQLite Database Backup\n';
      sqlDump += `-- Created: ${new Date().toISOString()}\n`;
      sqlDump += `-- Database: ${sourcePath}\n\n`;

      // Add table creation and data for each table
      for (const table of tables) {
        const tableName = table.name;
        
        // Get table schema
        const schema = await connection.query(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`
        );
        
        if (schema.length > 0) {
          sqlDump += `-- Table: ${tableName}\n`;
          sqlDump += `${schema[0].sql};\n\n`;
          
          // Get table data
          const rows = await connection.query(`SELECT * FROM ${tableName}`);
          
          if (rows.length > 0) {
            // Get column names
            const columns = Object.keys(rows[0]);
            const columnList = columns.map(col => `"${col}"`).join(', ');
            
            sqlDump += `-- Data for table: ${tableName}\n`;
            
            for (const row of rows) {
              const values = columns.map(col => {
                const value = row[col];
                if (value === null) return 'NULL';
                if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
                return value;
              }).join(', ');
              
              sqlDump += `INSERT INTO ${tableName} (${columnList}) VALUES (${values});\n`;
            }
            sqlDump += '\n';
          }
        }
      }

      await connection.close();

      // Write SQL dump to file
      fs.writeFileSync(backupPath, sqlDump, 'utf8');

      const executionTime = Date.now() - startTime;
      const backupSize = fs.statSync(backupPath).size;

      MonitoringService.trackMetric('backup_created_success', executionTime, {
        dbType: 'sqlite',
        backupSize,
        filename: backupFilename,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        filename: backupFilename,
        path: backupPath,
        size: backupSize,
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.DATABASE,
        `SQLite backup failed: ${error.message}`,
        ErrorService.SEVERITIES.ERROR,
        { backupPath, error: error.stack }
      );
      
      MonitoringService.logError(mcpError);
      MonitoringService.trackMetric('backup_created_failure', executionTime, {
        dbType: 'sqlite',
        errorType: error.code || 'unknown',
        timestamp: new Date().toISOString()
      });
      
      throw mcpError;
    }
  }

  /**
   * Create PostgreSQL backup using pg_dump
   */
  async backupPostgreSQL() {
    const startTime = Date.now();
    const backupFilename = this.generateBackupFilename();
    const backupPath = path.join(this.backupDir, backupFilename);

    return new Promise((resolve, reject) => {
      try {
        const pgDumpArgs = [
          '--host', this.config.DB_HOST,
          '--port', this.config.DB_PORT.toString(),
          '--username', this.config.DB_USER,
          '--dbname', this.config.DB_NAME,
          '--verbose',
          '--clean',
          '--if-exists',
          '--create',
          '--file', backupPath
        ];

        const pgDump = spawn('pg_dump', pgDumpArgs, {
          env: {
            ...process.env,
            PGPASSWORD: this.config.DB_PASSWORD
          }
        });

        let errorOutput = '';

        pgDump.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        pgDump.on('close', (code) => {
          const executionTime = Date.now() - startTime;

          if (code === 0) {
            const backupSize = fs.existsSync(backupPath) ? fs.statSync(backupPath).size : 0;
            
            MonitoringService.trackMetric('backup_created_success', executionTime, {
              dbType: 'postgresql',
              backupSize,
              filename: backupFilename,
              timestamp: new Date().toISOString()
            });

            resolve({
              success: true,
              filename: backupFilename,
              path: backupPath,
              size: backupSize,
              executionTime
            });
          } else {
            const mcpError = ErrorService.createError(
              ErrorService.CATEGORIES.DATABASE,
              `PostgreSQL backup failed with exit code ${code}: ${errorOutput}`,
              ErrorService.SEVERITIES.ERROR,
              { backupPath, exitCode: code, errorOutput }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('backup_created_failure', executionTime, {
              dbType: 'postgresql',
              exitCode: code,
              timestamp: new Date().toISOString()
            });
            
            reject(mcpError);
          }
        });

        pgDump.on('error', (error) => {
          const executionTime = Date.now() - startTime;
          
          const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.DATABASE,
            `PostgreSQL backup process error: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            { backupPath, error: error.stack }
          );
          
          MonitoringService.logError(mcpError);
          MonitoringService.trackMetric('backup_created_failure', executionTime, {
            dbType: 'postgresql',
            errorType: 'process_error',
            timestamp: new Date().toISOString()
          });
          
          reject(mcpError);
        });

      } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
          ErrorService.CATEGORIES.DATABASE,
          `PostgreSQL backup setup failed: ${error.message}`,
          ErrorService.SEVERITIES.ERROR,
          { backupPath, error: error.stack }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('backup_created_failure', executionTime, {
          dbType: 'postgresql',
          errorType: 'setup_error',
          timestamp: new Date().toISOString()
        });
        
        reject(mcpError);
      }
    });
  }

  /**
   * Create MySQL backup using mysqldump
   */
  async backupMySQL() {
    const startTime = Date.now();
    const backupFilename = this.generateBackupFilename();
    const backupPath = path.join(this.backupDir, backupFilename);

    return new Promise((resolve, reject) => {
      try {
        const mysqldumpArgs = [
          '--host', this.config.DB_HOST,
          '--port', this.config.DB_PORT.toString(),
          '--user', this.config.DB_USER,
          `--password=${this.config.DB_PASSWORD}`,
          '--single-transaction',
          '--routines',
          '--triggers',
          '--add-drop-database',
          '--create-options',
          '--result-file', backupPath,
          this.config.DB_NAME
        ];

        const mysqldump = spawn('mysqldump', mysqldumpArgs);

        let errorOutput = '';

        mysqldump.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        mysqldump.on('close', (code) => {
          const executionTime = Date.now() - startTime;

          if (code === 0) {
            const backupSize = fs.existsSync(backupPath) ? fs.statSync(backupPath).size : 0;
            
            MonitoringService.trackMetric('backup_created_success', executionTime, {
              dbType: 'mysql',
              backupSize,
              filename: backupFilename,
              timestamp: new Date().toISOString()
            });

            resolve({
              success: true,
              filename: backupFilename,
              path: backupPath,
              size: backupSize,
              executionTime
            });
          } else {
            const mcpError = ErrorService.createError(
              ErrorService.CATEGORIES.DATABASE,
              `MySQL backup failed with exit code ${code}: ${errorOutput}`,
              ErrorService.SEVERITIES.ERROR,
              { backupPath, exitCode: code, errorOutput }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('backup_created_failure', executionTime, {
              dbType: 'mysql',
              exitCode: code,
              timestamp: new Date().toISOString()
            });
            
            reject(mcpError);
          }
        });

        mysqldump.on('error', (error) => {
          const executionTime = Date.now() - startTime;
          
          const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.DATABASE,
            `MySQL backup process error: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            { backupPath, error: error.stack }
          );
          
          MonitoringService.logError(mcpError);
          MonitoringService.trackMetric('backup_created_failure', executionTime, {
            dbType: 'mysql',
            errorType: 'process_error',
            timestamp: new Date().toISOString()
          });
          
          reject(mcpError);
        });

      } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
          ErrorService.CATEGORIES.DATABASE,
          `MySQL backup setup failed: ${error.message}`,
          ErrorService.SEVERITIES.ERROR,
          { backupPath, error: error.stack }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('backup_created_failure', executionTime, {
          dbType: 'mysql',
          errorType: 'setup_error',
          timestamp: new Date().toISOString()
        });
        
        reject(mcpError);
      }
    });
  }

  /**
   * Create database backup
   */
  async createBackup() {
    MonitoringService.info('Starting database backup', {
      dbType: this.config.DB_TYPE,
      backupDir: this.backupDir,
      timestamp: new Date().toISOString()
    }, 'backup');

    try {
      let result;

      switch (this.config.DB_TYPE) {
        case 'sqlite':
          result = await this.backupSQLite();
          break;
        case 'postgresql':
          result = await this.backupPostgreSQL();
          break;
        case 'mysql':
          result = await this.backupMySQL();
          break;
        default:
          throw new Error(`Unsupported database type for backup: ${this.config.DB_TYPE}`);
      }

      MonitoringService.info('Database backup completed successfully', {
        ...result,
        dbType: this.config.DB_TYPE,
        timestamp: new Date().toISOString()
      }, 'backup');

      // Clean up old backups
      await this.cleanupOldBackups();

      return result;

    } catch (error) {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.DATABASE,
        `Database backup failed: ${error.message}`,
        ErrorService.SEVERITIES.ERROR,
        { dbType: this.config.DB_TYPE, error: error.stack }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
  }

  /**
   * List available backups
   */
  async listBackups() {
    try {
      const files = fs.readdirSync(this.backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('mcp-backup-') && file.endsWith('.sql'))
        .map(file => {
          const filePath = path.join(this.backupDir, file);
          const stats = fs.statSync(filePath);
          
          return {
            filename: file,
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
        .sort((a, b) => b.created - a.created); // Sort by creation date, newest first

      return backupFiles;

    } catch (error) {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.SYSTEM,
        `Failed to list backups: ${error.message}`,
        ErrorService.SEVERITIES.ERROR,
        { backupDir: this.backupDir, error: error.stack }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupOldBackups() {
    try {
      const backups = await this.listBackups();
      const now = new Date();
      const retentionMs = this.retentionDays * 24 * 60 * 60 * 1000;
      
      let deletedCount = 0;
      let deletedSize = 0;

      // Delete backups older than retention period
      for (const backup of backups) {
        const age = now - backup.created;
        
        if (age > retentionMs || backups.indexOf(backup) >= this.maxBackups) {
          try {
            fs.unlinkSync(backup.path);
            deletedCount++;
            deletedSize += backup.size;
            
            MonitoringService.debug('Deleted old backup', {
              filename: backup.filename,
              age: Math.round(age / (24 * 60 * 60 * 1000)),
              size: backup.size,
              timestamp: new Date().toISOString()
            }, 'backup');
            
          } catch (deleteError) {
            MonitoringService.warn('Failed to delete old backup', {
              filename: backup.filename,
              error: deleteError.message,
              timestamp: new Date().toISOString()
            }, 'backup');
          }
        }
      }

      if (deletedCount > 0) {
        MonitoringService.info('Cleaned up old backups', {
          deletedCount,
          deletedSize,
          remainingBackups: backups.length - deletedCount,
          timestamp: new Date().toISOString()
        }, 'backup');
      }

      return { deletedCount, deletedSize };

    } catch (error) {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.SYSTEM,
        `Failed to cleanup old backups: ${error.message}`,
        ErrorService.SEVERITIES.ERROR,
        { error: error.stack }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
  }

  /**
   * Get backup status and statistics
   */
  async getBackupStatus() {
    try {
      const backups = await this.listBackups();
      const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
      const latestBackup = backups.length > 0 ? backups[0] : null;

      return {
        backupDir: this.backupDir,
        totalBackups: backups.length,
        totalSize,
        latestBackup: latestBackup ? {
          filename: latestBackup.filename,
          created: latestBackup.created,
          size: latestBackup.size
        } : null,
        retentionDays: this.retentionDays,
        maxBackups: this.maxBackups,
        dbType: this.config.DB_TYPE
      };

    } catch (error) {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.SYSTEM,
        `Failed to get backup status: ${error.message}`,
        ErrorService.SEVERITIES.ERROR,
        { error: error.stack }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
  }
}

module.exports = {
  BackupManager
};
