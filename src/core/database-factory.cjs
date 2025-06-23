/**
 * @fileoverview Database Factory for MCP Server - Production Database Support
 * Provides abstraction layer for SQLite, PostgreSQL, and MySQL databases with connection pooling.
 */

const path = require('path');
const fs = require('fs');
const ErrorService = require('./error-service.cjs');
const MonitoringService = require('./monitoring-service.cjs');

// Database drivers
let sqlite3, pg, mysql2;

// Connection pools
let pgPool = null;
let mysqlPool = null;

/**
 * Database connection interface
 */
class DatabaseConnection {
  constructor(type, connection) {
    this.type = type;
    this.connection = connection;
  }

  async query(sql, params = []) {
    switch (this.type) {
      case 'sqlite':
        return this.querySQLite(sql, params);
      case 'postgresql':
        return this.queryPostgreSQL(sql, params);
      case 'mysql':
        return this.queryMySQL(sql, params);
      default:
        throw new Error(`Unsupported database type: ${this.type}`);
    }
  }

  async querySQLite(sql, params) {
    return new Promise((resolve, reject) => {
      if (sql.toLowerCase().startsWith('select') || sql.toLowerCase().startsWith('pragma')) {
        this.connection.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      } else {
        this.connection.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes, lastID: this.lastID });
        });
      }
    });
  }

  async queryPostgreSQL(sql, params) {
    // Convert SQLite-style ? placeholders to PostgreSQL $1, $2, etc.
    let pgSql = sql;
    let pgParams = params;
    
    if (params.length > 0) {
      let paramIndex = 1;
      pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    }

    const result = await this.connection.query(pgSql, pgParams);
    return result.rows;
  }

  async queryMySQL(sql, params) {
    const [rows] = await this.connection.execute(sql, params);
    return rows;
  }

  async close() {
    switch (this.type) {
      case 'sqlite':
        return new Promise((resolve) => {
          this.connection.close(resolve);
        });
      case 'postgresql':
        // Connection is returned to pool automatically
        this.connection.release();
        break;
      case 'mysql':
        // Connection is returned to pool automatically
        this.connection.release();
        break;
    }
  }

  async release() {
    return this.close();
  }
}

/**
 * Database Factory
 */
class DatabaseFactory {
  constructor() {
    this.config = null;
    this.initialized = false;
  }

  /**
   * Initialize the database factory with configuration
   */
  async init(config) {
    this.config = config;
    
    MonitoringService.info('Initializing database factory', {
      dbType: config.DB_TYPE,
      timestamp: new Date().toISOString()
    }, 'database');

    switch (config.DB_TYPE) {
      case 'sqlite':
        await this.initSQLite();
        break;
      case 'postgresql':
        await this.initPostgreSQL();
        break;
      case 'mysql':
        await this.initMySQL();
        break;
      default:
        throw new Error(`Unsupported database type: ${config.DB_TYPE}`);
    }

    this.initialized = true;
    MonitoringService.info('Database factory initialized successfully', {
      dbType: config.DB_TYPE,
      timestamp: new Date().toISOString()
    }, 'database');
  }

  async initSQLite() {
    try {
      sqlite3 = require('sqlite3').verbose();
      
      // Ensure data directory exists
      const dataDir = path.dirname(this.config.DB_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Test connection
      const testDb = new sqlite3.Database(this.config.DB_PATH);
      await new Promise((resolve, reject) => {
        testDb.close((err) => err ? reject(err) : resolve());
      });

      MonitoringService.info('SQLite database initialized', {
        dbPath: this.config.DB_PATH,
        timestamp: new Date().toISOString()
      }, 'database');

    } catch (error) {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.DATABASE,
        `Failed to initialize SQLite: ${error.message}`,
        ErrorService.SEVERITIES.CRITICAL,
        { error: error.stack }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
  }

  async initPostgreSQL() {
    try {
      const { Pool } = require('pg');
      
      pgPool = new Pool({
        host: this.config.DB_HOST,
        port: this.config.DB_PORT,
        database: this.config.DB_NAME,
        user: this.config.DB_USER,
        password: this.config.DB_PASSWORD,
        max: this.config.DB_POOL_MAX || 20,
        idleTimeoutMillis: this.config.DB_IDLE_TIMEOUT || 30000,
        connectionTimeoutMillis: this.config.DB_CONNECTION_TIMEOUT || 2000,
      });

      // Test connection
      const client = await pgPool.connect();
      await client.query('SELECT NOW()');
      client.release();

      MonitoringService.info('PostgreSQL connection pool initialized', {
        host: this.config.DB_HOST,
        database: this.config.DB_NAME,
        maxConnections: this.config.DB_POOL_MAX || 20,
        timestamp: new Date().toISOString()
      }, 'database');

    } catch (error) {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.DATABASE,
        `Failed to initialize PostgreSQL: ${error.message}`,
        ErrorService.SEVERITIES.CRITICAL,
        { error: error.stack }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
  }

  async initMySQL() {
    try {
      mysql2 = require('mysql2/promise');
      
      mysqlPool = mysql2.createPool({
        host: this.config.DB_HOST,
        port: this.config.DB_PORT,
        database: this.config.DB_NAME,
        user: this.config.DB_USER,
        password: this.config.DB_PASSWORD,
        connectionLimit: this.config.DB_POOL_MAX || 20,
        idleTimeout: this.config.DB_IDLE_TIMEOUT || 30000,
        acquireTimeout: this.config.DB_CONNECTION_TIMEOUT || 2000,
      });

      // Test connection
      const connection = await mysqlPool.getConnection();
      await connection.query('SELECT 1');
      connection.release();

      MonitoringService.info('MySQL connection pool initialized', {
        host: this.config.DB_HOST,
        database: this.config.DB_NAME,
        connectionLimit: this.config.DB_POOL_MAX || 20,
        timestamp: new Date().toISOString()
      }, 'database');

    } catch (error) {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.DATABASE,
        `Failed to initialize MySQL: ${error.message}`,
        ErrorService.SEVERITIES.CRITICAL,
        { error: error.stack }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
  }

  /**
   * Get a database connection
   */
  async getConnection() {
    if (!this.initialized) {
      throw new Error('Database factory not initialized');
    }

    const startTime = Date.now();

    try {
      let connection;

      switch (this.config.DB_TYPE) {
        case 'sqlite':
          connection = new sqlite3.Database(this.config.DB_PATH);
          break;
        case 'postgresql':
          connection = await pgPool.connect();
          break;
        case 'mysql':
          connection = await mysqlPool.getConnection();
          break;
        default:
          throw new Error(`Unsupported database type: ${this.config.DB_TYPE}`);
      }

      const executionTime = Date.now() - startTime;
      MonitoringService.trackMetric('database_connection_acquired', executionTime, {
        dbType: this.config.DB_TYPE,
        timestamp: new Date().toISOString()
      });

      return new DatabaseConnection(this.config.DB_TYPE, connection);

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.DATABASE,
        `Failed to get database connection: ${error.message}`,
        ErrorService.SEVERITIES.ERROR,
        { 
          dbType: this.config.DB_TYPE,
          error: error.stack 
        }
      );
      
      MonitoringService.logError(mcpError);
      MonitoringService.trackMetric('database_connection_failed', executionTime, {
        dbType: this.config.DB_TYPE,
        errorType: error.code || 'unknown',
        timestamp: new Date().toISOString()
      });
      
      throw mcpError;
    }
  }

  /**
   * Close all database connections and pools
   */
  async close() {
    try {
      if (pgPool) {
        await pgPool.end();
        pgPool = null;
      }

      if (mysqlPool) {
        await mysqlPool.end();
        mysqlPool = null;
      }

      this.initialized = false;
      
      MonitoringService.info('Database factory closed', {
        dbType: this.config?.DB_TYPE,
        timestamp: new Date().toISOString()
      }, 'database');

    } catch (error) {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.DATABASE,
        `Failed to close database factory: ${error.message}`,
        ErrorService.SEVERITIES.ERROR,
        { error: error.stack }
      );
      MonitoringService.logError(mcpError);
      throw mcpError;
    }
  }

  /**
   * Get database health status
   */
  async getHealthStatus() {
    if (!this.initialized) {
      return { status: 'not_initialized', healthy: false };
    }

    try {
      const connection = await this.getConnection();
      
      // Simple health check query
      switch (this.config.DB_TYPE) {
        case 'sqlite':
          await connection.query('SELECT 1');
          break;
        case 'postgresql':
          await connection.query('SELECT 1');
          break;
        case 'mysql':
          await connection.query('SELECT 1');
          break;
      }
      
      await connection.close();
      
      return {
        status: 'healthy',
        healthy: true,
        dbType: this.config.DB_TYPE,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        healthy: false,
        error: error.message,
        dbType: this.config.DB_TYPE,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Singleton instance
const databaseFactory = new DatabaseFactory();

module.exports = {
  DatabaseFactory,
  DatabaseConnection,
  databaseFactory
};
