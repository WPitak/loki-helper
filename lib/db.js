const fs = require('fs')
const path = require('path')
const _ = require('lodash')
const Loki = require('lokijs')
const mkdirp = require('mkdirp')

/**
 * Remove all collections in database
 * @param {Loki} db
 */
const clearDatabase = (db) => {
  if (db.collections) {
    const collectionNames = db.collections.map(collection => collection.name)
    collectionNames.forEach(name => db.removeCollection(name))
  }
}

/**
 * Remove all data in all collections
 * @param {Loki} db
 */
const clearAllData = (db) => {
  if (db.collections) {
    db.collections.forEach(collection => collection.clear())
  }
}

/**
 * Promise wrapper for Loki.loadDatabase()
 * @param {Loki} db
 * @param {object} options - options to be passed to Loki.loadDatabase method
 * @return {Promise<Loki>}
 */
const loadDatabasePromise = (db, options = {}) =>
  new Promise((resolve, reject) => {
    db.loadDatabase(options, error => (error ? reject(error) : resolve(db)))
  })

/**
 * Promise wrapper for Loki.saveDatabase()
 * @param {Loki} db
 * @return {Promise<Loki>}
 */
const saveDatabasePromise = (db) =>
  new Promise((resolve, reject) => {
    db.saveDatabase((error) => (error ? reject(error) : resolve(db)))
  })

/**
 * Promise wrapper for Loki.deleteDatabase()
 * @param {Loki} db
 * @return {Promise<Loki>}
 */
const deleteDatabasePromise = (db) =>
  new Promise((resolve, reject) => {
    db.deleteDatabase((error) => (error ? reject(error) : resolve(db)))
  })

/**
 * Extension methods applicable to both in-memory only and persisting database
 */
const extensionMethods = {
  loadDatabasePromise (options = {}) {
    return loadDatabasePromise(this, options)
  },
  saveDatabasePromise () {
    return saveDatabasePromise(this)
  },
  deleteDatabasePromise () {
    return deleteDatabasePromise(this)
  },
  clearDatabase () {
    return clearDatabase(this)
  },
  clearAllData () {
    return clearAllData(this)
  }
}

/**
 * Create Loki database whose Loki.saveDatabase() method will not persist any data to disk.
 * Database also contains extra convenient methods.
 * @param {string} fileName file name input to Loki constructor, reference for data loading
 * @param {object} _options options input to Loki constructor, will ignore persistence option eg. autosave and autosaveInterval
 * @param {function} _options.dbConstructor - custom database constructor to be used instead of built-in one
 * @return {Loki} modified Loki object
 */
module.exports.createInMemoryOnlyDB = (fileName, _options = {}) => {
  // Process options
  const options = _.omit(_options, ['autosave', 'autosaveInterval', 'dbConstructor'])

  // Instantiate database
  const DBConstructor = _options.dbConstructor || Loki
  const db = new DBConstructor(fileName, options)

  // Nullify persistence method
  db.saveDatabase = (callback) => {
    if (_.isFunction(callback)) {
      callback()
    }
  }
  db.deleteDatabase = (callback) => {
    if (_.isFunction(callback)) {
      callback()
    }
  }

  return Object.assign(db, extensionMethods)
}

/**
 * Create Loki database with extra option to create path to file if not already exist.
 * Database also contains extra convenient methods
 * @param {string} _fileName file name input to Loki constructor
 * @param {object} options options input for Loki constructor
 * @param {function} options.dbConstructor - custom database constructor to be used instead of built-in one
 * @return {Loki} modified Loki object
 */
module.exports.createPersistingDB = (_fileName, options = {}) => {
  // Create path to file if not exist
  const fileName = path.resolve(_fileName)
  const pathToFile = path.dirname(fileName)
  const createPath = _.isUndefined(options.createPath) ? true : options.createPath
  if (!fs.existsSync(pathToFile) && createPath) {
    mkdirp.sync(pathToFile)
  }

  // Instantiate database
  const DBConstructor = options.dbConstructor || Loki
  const db = new DBConstructor(fileName, options)

  return Object.assign(db, extensionMethods)
}

module.exports.clearDatabase = clearDatabase
module.exports.clearAllData = clearAllData
module.exports.loadDatabasePromise = loadDatabasePromise
module.exports.saveDatabasePromise = saveDatabasePromise
module.exports.deleteDatabasePromise = deleteDatabasePromise
