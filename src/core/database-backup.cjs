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
  ensureBackupDirectory(userId, sessionId) {
    const startTime = Date.now();
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Ensuring backup directory exists', {
          backupDir: this.backupDir,
          userId,
          sessionId,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
        
        // Pattern 2: User Activity Logs
        if (userId) {
          MonitoringService.info('Created backup directory', {
            backupDir: this.backupDir,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString()
          }, 'backup', null, userId);
        } else if (sessionId) {
          MonitoringService.info('Created backup directory with session', {
            sessionId,
            backupDir: this.backupDir,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString()
          }, 'backup');
        }
      }
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'backup',
        `Failed to create backup directory: ${error.message}`,
        'error',
        { 
          backupDir: this.backupDir, 
          error: error.message,
          stack: error.stack,
          userId,
          sessionId,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (userId) {
        MonitoringService.error('Failed to create backup directory', {
          error: error.message,
          backupDir: this.backupDir,
          timestamp: new Date().toISOString()
        }, 'backup', null, userId);
      } else if (sessionId) {
        MonitoringService.error('Failed to create backup directory', {
          sessionId,
          error: error.message,
          backupDir: this.backupDir,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
      throw mcpError;
    }
  }

  /**
   * Generate backup filename
   */
  generateBackupFilename(type = 'full', userId, sessionId) {
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Generating backup filename', {
          type,
          dbType: this.config.DB_TYPE,
          userId,
          sessionId,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dbType = this.config.DB_TYPE;
      const filename = `mcp-backup-${dbType}-${type}-${timestamp}.sql`;
      
      // Pattern 2: User Activity Logs (for successful generation)
      if (userId) {
        MonitoringService.info('Generated backup filename', {
          filename,
          type,
          dbType,
          timestamp: new Date().toISOString()
        }, 'backup', null, userId);
      } else if (sessionId) {
        MonitoringService.info('Generated backup filename with session', {
          sessionId,
          filename,
          type,
          dbType,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
      return filename;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'backup',
        `Failed to generate backup filename: ${error.message}`,
        'error',
        { 
          type,
          dbType: this.config.DB_TYPE,
          error: error.message,
          stack: error.stack,
          userId,
          sessionId,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (userId) {
        MonitoringService.error('Failed to generate backup filename', {
          error: error.message,
          type,
          timestamp: new Date().toISOString()
        }, 'backup', null, userId);
      } else if (sessionId) {
        MonitoringService.error('Failed to generate backup filename', {
          sessionId,
          error: error.message,
          type,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
      throw mcpError;
    }
  }

  /**
   * Create SQLite backup
   */
  async backupSQLite(userId, sessionId) {
    const startTime = Date.now();
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Starting SQLite backup process', {
          dbType: 'sqlite',
          sourcePath: this.config.DB_PATH,
          backupDir: this.backupDir,
          userId,
          sessionId,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
      const backupFilename = this.generateBackupFilename('full', userId, sessionId);
      const backupPath = path.join(this.backupDir, backupFilename);

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
      
      // Pattern 2: User Activity Logs
      if (userId) {
        MonitoringService.info('SQLite backup completed successfully', {
          filename: backupFilename,
          backupSize,
          executionTime,
          dbType: 'sqlite',
          timestamp: new Date().toISOString()
        }, 'backup', null, userId);
      } else if (sessionId) {
        MonitoringService.info('SQLite backup completed with session', {
          sessionId,
          filename: backupFilename,
          backupSize,
          executionTime,
          dbType: 'sqlite',
          timestamp: new Date().toISOString()
        }, 'backup');
      }

      return {
        success: true,
        filename: backupFilename,
        path: backupPath,
        size: backupSize,
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'backup',
        `SQLite backup failed: ${error.message}`,
        'error',
        { 
          backupPath, 
          error: error.message,
          stack: error.stack,
          dbType: 'sqlite',
          userId,
          sessionId,
          timestamp: new Date().toISOString()
        }
      );
      
      MonitoringService.logError(mcpError);
      MonitoringService.trackMetric('backup_created_failure', executionTime, {
        dbType: 'sqlite',
        errorType: error.code || 'unknown',
        timestamp: new Date().toISOString()
      });
      
      // Pattern 4: User Error Tracking
      if (userId) {
        MonitoringService.error('SQLite backup failed', {
          error: error.message,
          executionTime,
          dbType: 'sqlite',
          timestamp: new Date().toISOString()
        }, 'backup', null, userId);
      } else if (sessionId) {
        MonitoringService.error('SQLite backup failed', {
          sessionId,
          error: error.message,
          executionTime,
          dbType: 'sqlite',
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
      throw mcpError;
    }
  }

  /**
   * Create PostgreSQL backup using pg_dump
   */
  async backupPostgreSQL(userId, sessionId) {
    const startTime = Date.now();
    
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Starting PostgreSQL backup process', {
        dbType: 'postgresql',
        host: this.config.DB_HOST,
        port: this.config.DB_PORT,
        database: this.config.DB_NAME,
        backupDir: this.backupDir,
        userId,
        sessionId,
        timestamp: new Date().toISOString()
      }, 'backup');
    }
    
    const backupFilename = this.generateBackupFilename('full', userId, sessionId);
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
            
            // Pattern 2: User Activity Logs
            if (userId) {
              MonitoringService.info('PostgreSQL backup completed successfully', {
                filename: backupFilename,
                backupSize,
                executionTime,
                dbType: 'postgresql',
                timestamp: new Date().toISOString()
              }, 'backup', null, userId);
            } else if (sessionId) {
              MonitoringService.info('PostgreSQL backup completed with session', {
                sessionId,
                filename: backupFilename,
                backupSize,
                executionTime,
                dbType: 'postgresql',
                timestamp: new Date().toISOString()
              }, 'backup');
            }

            resolve({
              success: true,
              filename: backupFilename,
              path: backupPath,
              size: backupSize,
              executionTime
            });
          } else {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
              'backup',
              `PostgreSQL backup failed with exit code ${code}: ${errorOutput}`,
              'error',
              { 
                backupPath, 
                exitCode: code, 
                errorOutput,
                dbType: 'postgresql',
                userId,
                sessionId,
                timestamp: new Date().toISOString()
              }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('backup_created_failure', executionTime, {
              dbType: 'postgresql',
              exitCode: code,
              timestamp: new Date().toISOString()
            });
            
            // Pattern 4: User Error Tracking
            if (userId) {
              MonitoringService.error('PostgreSQL backup failed', {
                error: `Exit code ${code}: ${errorOutput}`,
                executionTime,
                dbType: 'postgresql',
                timestamp: new Date().toISOString()
              }, 'backup', null, userId);
            } else if (sessionId) {
              MonitoringService.error('PostgreSQL backup failed', {
                sessionId,
                error: `Exit code ${code}: ${errorOutput}`,
                executionTime,
                dbType: 'postgresql',
                timestamp: new Date().toISOString()
              }, 'backup');
            }
            
            reject(mcpError);
          }
        });

        pgDump.on('error', (error) => {
          const executionTime = Date.now() - startTime;
          
          // Pattern 3: Infrastructure Error Logging
          const mcpError = ErrorService.createError(
            'backup',
            `PostgreSQL backup process error: ${error.message}`,
            'error',
            { 
              backupPath, 
              error: error.message,
              stack: error.stack,
              dbType: 'postgresql',
              userId,
              sessionId,
              timestamp: new Date().toISOString()
            }
          );
          
          MonitoringService.logError(mcpError);
          MonitoringService.trackMetric('backup_created_failure', executionTime, {
            dbType: 'postgresql',
            errorType: 'process_error',
            timestamp: new Date().toISOString()
          });
          
          // Pattern 4: User Error Tracking
          if (userId) {
            MonitoringService.error('PostgreSQL backup process error', {
              error: error.message,
              executionTime,
              dbType: 'postgresql',
              timestamp: new Date().toISOString()
            }, 'backup', null, userId);
          } else if (sessionId) {
            MonitoringService.error('PostgreSQL backup process error', {
              sessionId,
              error: error.message,
              executionTime,
              dbType: 'postgresql',
              timestamp: new Date().toISOString()
            }, 'backup');
          }
          
          reject(mcpError);
        });

      } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
          'backup',
          `PostgreSQL backup setup failed: ${error.message}`,
          'error',
          { 
            backupPath, 
            error: error.message,
            stack: error.stack,
            dbType: 'postgresql',
            userId,
            sessionId,
            timestamp: new Date().toISOString()
          }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('backup_created_failure', executionTime, {
          dbType: 'postgresql',
          errorType: 'setup_error',
          timestamp: new Date().toISOString()
        });
        
        // Pattern 4: User Error Tracking
        if (userId) {
          MonitoringService.error('PostgreSQL backup setup failed', {
            error: error.message,
            executionTime,
            dbType: 'postgresql',
            timestamp: new Date().toISOString()
          }, 'backup', null, userId);
        } else if (sessionId) {
          MonitoringService.error('PostgreSQL backup setup failed', {
            sessionId,
            error: error.message,
            executionTime,
            dbType: 'postgresql',
            timestamp: new Date().toISOString()
          }, 'backup');
        }
        
        reject(mcpError);
      }
    });
  }

  /**
   * Create MySQL backup using mysqldump
   */
  async backupMySQL(userId, sessionId) {
    const startTime = Date.now();
    
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Starting MySQL backup process', {
        dbType: 'mysql',
        host: this.config.DB_HOST,
        port: this.config.DB_PORT,
        database: this.config.DB_NAME,
        backupDir: this.backupDir,
        userId,
        sessionId,
        timestamp: new Date().toISOString()
      }, 'backup');
    }
    
    const backupFilename = this.generateBackupFilename('full', userId, sessionId);
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
            
            // Pattern 2: User Activity Logs
            if (userId) {
              MonitoringService.info('MySQL backup completed successfully', {
                filename: backupFilename,
                backupSize,
                executionTime,
                dbType: 'mysql',
                timestamp: new Date().toISOString()
              }, 'backup', null, userId);
            } else if (sessionId) {
              MonitoringService.info('MySQL backup completed with session', {
                sessionId,
                filename: backupFilename,
                backupSize,
                executionTime,
                dbType: 'mysql',
                timestamp: new Date().toISOString()
              }, 'backup');
            }

            resolve({
              success: true,
              filename: backupFilename,
              path: backupPath,
              size: backupSize,
              executionTime
            });
          } else {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
              'backup',
              `MySQL backup failed with exit code ${code}: ${errorOutput}`,
              'error',
              { 
                backupPath, 
                exitCode: code, 
                errorOutput,
                dbType: 'mysql',
                userId,
                sessionId,
                timestamp: new Date().toISOString()
              }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('backup_created_failure', executionTime, {
              dbType: 'mysql',
              exitCode: code,
              timestamp: new Date().toISOString()
            });
            
            // Pattern 4: User Error Tracking
            if (userId) {
              MonitoringService.error('MySQL backup failed', {
                error: `Exit code ${code}: ${errorOutput}`,
                executionTime,
                dbType: 'mysql',
                timestamp: new Date().toISOString()
              }, 'backup', null, userId);
            } else if (sessionId) {
              MonitoringService.error('MySQL backup failed', {
                sessionId,
                error: `Exit code ${code}: ${errorOutput}`,
                executionTime,
                dbType: 'mysql',
                timestamp: new Date().toISOString()
              }, 'backup');
            }
            
            reject(mcpError);
          }
        });

        mysqldump.on('error', (error) => {
          const executionTime = Date.now() - startTime;
          
          // Pattern 3: Infrastructure Error Logging
          const mcpError = ErrorService.createError(
            'backup',
            `MySQL backup process error: ${error.message}`,
            'error',
            { 
              backupPath, 
              error: error.message,
              stack: error.stack,
              dbType: 'mysql',
              userId,
              sessionId,
              timestamp: new Date().toISOString()
            }
          );
          
          MonitoringService.logError(mcpError);
          MonitoringService.trackMetric('backup_created_failure', executionTime, {
            dbType: 'mysql',
            errorType: 'process_error',
            timestamp: new Date().toISOString()
          });
          
          // Pattern 4: User Error Tracking
          if (userId) {
            MonitoringService.error('MySQL backup process error', {
              error: error.message,
              executionTime,
              dbType: 'mysql',
              timestamp: new Date().toISOString()
            }, 'backup', null, userId);
          } else if (sessionId) {
            MonitoringService.error('MySQL backup process error', {
              sessionId,
              error: error.message,
              executionTime,
              dbType: 'mysql',
              timestamp: new Date().toISOString()
            }, 'backup');
          }
          
          reject(mcpError);
        });

      } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
          'backup',
          `MySQL backup setup failed: ${error.message}`,
          'error',
          { 
            backupPath, 
            error: error.message,
            stack: error.stack,
            dbType: 'mysql',
            userId,
            sessionId,
            timestamp: new Date().toISOString()
          }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('backup_created_failure', executionTime, {
          dbType: 'mysql',
          errorType: 'setup_error',
          timestamp: new Date().toISOString()
        });
        
        // Pattern 4: User Error Tracking
        if (userId) {
          MonitoringService.error('MySQL backup setup failed', {
            error: error.message,
            executionTime,
            dbType: 'mysql',
            timestamp: new Date().toISOString()
          }, 'backup', null, userId);
        } else if (sessionId) {
          MonitoringService.error('MySQL backup setup failed', {
            sessionId,
            error: error.message,
            executionTime,
            dbType: 'mysql',
            timestamp: new Date().toISOString()
          }, 'backup');
        }
        
        reject(mcpError);
      }
    });
  }

  /**
   * Create database backup
   */
  async createBackup(userId, sessionId) {
    const startTime = Date.now();
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Starting database backup process', {
          dbType: this.config.DB_TYPE,
          backupDir: this.backupDir,
          userId,
          sessionId,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
      MonitoringService.info('Starting database backup', {
        dbType: this.config.DB_TYPE,
        backupDir: this.backupDir,
        timestamp: new Date().toISOString()
      }, 'backup');

      let result;

      switch (this.config.DB_TYPE) {
        case 'sqlite':
          result = await this.backupSQLite(userId, sessionId);
          break;
        case 'postgresql':
          result = await this.backupPostgreSQL(userId, sessionId);
          break;
        case 'mysql':
          result = await this.backupMySQL(userId, sessionId);
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
      await this.cleanupOldBackups(userId, sessionId);
      
      // Pattern 2: User Activity Logs
      if (userId) {
        MonitoringService.info('Database backup process completed', {
          dbType: this.config.DB_TYPE,
          filename: result.filename,
          backupSize: result.size,
          executionTime: result.executionTime,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }, 'backup', null, userId);
      } else if (sessionId) {
        MonitoringService.info('Database backup process completed with session', {
          sessionId,
          dbType: this.config.DB_TYPE,
          filename: result.filename,
          backupSize: result.size,
          executionTime: result.executionTime,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }, 'backup');
      }

      return result;

    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'backup',
        `Database backup failed: ${error.message}`,
        'error',
        { 
          dbType: this.config.DB_TYPE, 
          error: error.message,
          stack: error.stack,
          userId,
          sessionId,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (userId) {
        MonitoringService.error('Database backup failed', {
          error: error.message,
          dbType: this.config.DB_TYPE,
          timestamp: new Date().toISOString()
        }, 'backup', null, userId);
      } else if (sessionId) {
        MonitoringService.error('Database backup failed', {
          sessionId,
          error: error.message,
          dbType: this.config.DB_TYPE,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
      throw mcpError;
    }
  }

  /**
   * List available backups
   */
  async listBackups(userId, sessionId) {
    const startTime = Date.now();
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Listing available backups', {
          backupDir: this.backupDir,
          userId,
          sessionId,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
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

      // Pattern 2: User Activity Logs
      if (userId) {
        MonitoringService.info('Listed available backups', {
          backupCount: backupFiles.length,
          totalSize: backupFiles.reduce((sum, file) => sum + file.size, 0),
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }, 'backup', null, userId);
      } else if (sessionId) {
        MonitoringService.info('Listed available backups with session', {
          sessionId,
          backupCount: backupFiles.length,
          totalSize: backupFiles.reduce((sum, file) => sum + file.size, 0),
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }, 'backup');
      }

      return backupFiles;

    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'backup',
        `Failed to list backups: ${error.message}`,
        'error',
        { 
          backupDir: this.backupDir, 
          error: error.message,
          stack: error.stack,
          userId,
          sessionId,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (userId) {
        MonitoringService.error('Failed to list backups', {
          error: error.message,
          backupDir: this.backupDir,
          timestamp: new Date().toISOString()
        }, 'backup', null, userId);
      } else if (sessionId) {
        MonitoringService.error('Failed to list backups', {
          sessionId,
          error: error.message,
          backupDir: this.backupDir,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
      throw mcpError;
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupOldBackups(userId, sessionId) {
    const startTime = Date.now();
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Starting backup cleanup process', {
          retentionDays: this.retentionDays,
          maxBackups: this.maxBackups,
          backupDir: this.backupDir,
          userId,
          sessionId,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
      const backups = await this.listBackups(userId, sessionId);
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
      
      // Pattern 2: User Activity Logs
      if (userId) {
        MonitoringService.info('Backup cleanup completed', {
          deletedCount,
          deletedSize,
          remainingBackups: backups.length - deletedCount,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }, 'backup', null, userId);
      } else if (sessionId) {
        MonitoringService.info('Backup cleanup completed with session', {
          sessionId,
          deletedCount,
          deletedSize,
          remainingBackups: backups.length - deletedCount,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }, 'backup');
      }

      return { deletedCount, deletedSize };

    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'backup',
        `Failed to cleanup old backups: ${error.message}`,
        'error',
        { 
          error: error.message,
          stack: error.stack,
          retentionDays: this.retentionDays,
          maxBackups: this.maxBackups,
          userId,
          sessionId,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (userId) {
        MonitoringService.error('Failed to cleanup old backups', {
          error: error.message,
          retentionDays: this.retentionDays,
          timestamp: new Date().toISOString()
        }, 'backup', null, userId);
      } else if (sessionId) {
        MonitoringService.error('Failed to cleanup old backups', {
          sessionId,
          error: error.message,
          retentionDays: this.retentionDays,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
      throw mcpError;
    }
  }

  /**
   * Get backup status and statistics
   */
  async getBackupStatus(userId, sessionId) {
    const startTime = Date.now();
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Retrieving backup status and statistics', {
          backupDir: this.backupDir,
          dbType: this.config.DB_TYPE,
          userId,
          sessionId,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
      const backups = await this.listBackups(userId, sessionId);
      const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
      const latestBackup = backups.length > 0 ? backups[0] : null;

      const status = {
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
      
      // Pattern 2: User Activity Logs
      if (userId) {
        MonitoringService.info('Retrieved backup status', {
          totalBackups: backups.length,
          totalSize,
          hasLatestBackup: !!latestBackup,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }, 'backup', null, userId);
      } else if (sessionId) {
        MonitoringService.info('Retrieved backup status with session', {
          sessionId,
          totalBackups: backups.length,
          totalSize,
          hasLatestBackup: !!latestBackup,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }, 'backup');
      }

      return status;

    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'backup',
        `Failed to get backup status: ${error.message}`,
        'error',
        { 
          error: error.message,
          stack: error.stack,
          backupDir: this.backupDir,
          dbType: this.config.DB_TYPE,
          userId,
          sessionId,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (userId) {
        MonitoringService.error('Failed to get backup status', {
          error: error.message,
          backupDir: this.backupDir,
          timestamp: new Date().toISOString()
        }, 'backup', null, userId);
      } else if (sessionId) {
        MonitoringService.error('Failed to get backup status', {
          sessionId,
          error: error.message,
          backupDir: this.backupDir,
          timestamp: new Date().toISOString()
        }, 'backup');
      }
      
      throw mcpError;
    }
  }
}

module.exports = {
  BackupManager
};
