/* eslint-env jest */
const DB = require('./db')
const Loki = require('lokijs')
const fs = require('fs')
const path = require('path')
const rimraf = require('rimraf')

const tempDir = path.resolve('.', '.temp')
const generateFileName = (() => {
  let count = 0
  return () => `${tempDir}${path.sep}db-test-${count++}`
})()

beforeAll(() => {
  rimraf.sync(tempDir)
  fs.mkdirSync(tempDir)
})
afterAll(() => {
  rimraf.sync(tempDir)
})

describe('database helper', () => {
  describe('loadDatabasePromise', () => {
    it('returns Promise of Loki.loadDatabase result which resolve to database itself', async () => {
      const fileName = generateFileName()
      const oDB = new Loki(fileName)
      const oCol = oDB.addCollection('TEST')
      oCol.insert({slug: 'xxx'})
      expect(fs.existsSync(fileName)).toBe(false)

      await new Promise((resolve, reject) => {
        oDB.saveDatabase((error) => (error ? reject(error) : resolve()))
      })
      expect(fs.existsSync(fileName)).toBe(true)

      oDB.close()

      const nDB = new Loki(fileName)
      expect(nDB.getCollection('TEST')).toBeNull()

      const lDB = await DB.loadDatabasePromise(nDB)
      const nCol = nDB.getCollection('TEST')
      expect(lDB).toBe(nDB)
      expect(typeof nCol).toBe('object')
      expect(nCol.find({slug: 'xxx'})).toHaveLength(1)
    })
  })
  describe('saveDatabasePromise', () => {
    it('returns Promise of Loki.saveDatabase result which resolve to database itself', async () => {
      const fileName = generateFileName()
      const oDB = new Loki(fileName)
      expect(fs.existsSync(fileName)).toBe(false)

      const sDB = await DB.saveDatabasePromise(oDB)
      expect(sDB).toBe(oDB)
      expect(fs.existsSync(fileName)).toBe(true)
    })
  })
  describe('deleteDatabasePromise', () => {
    it('returns Promise of Loki.deletePromise result which resolve to database itself', async () => {
      const fileName = generateFileName()
      const oDB = new Loki(fileName)
      expect(fs.existsSync(fileName)).toBe(false)

      await new Promise((resolve, reject) => {
        oDB.saveDatabase((error) => (error ? reject(error) : resolve()))
      })
      expect(fs.existsSync(fileName)).toBe(true)

      const dDB = await DB.deleteDatabasePromise(oDB)
      expect(dDB).toBe(oDB)
      expect(fs.existsSync(fileName)).toBe(false)
    })
  })
  describe('clearDatabase', () => {
    it('removes all collections in database', () => {
      const fileName = generateFileName()
      const db = new Loki(fileName)
      db.addCollection('c1')
      db.addCollection('c2')
      expect(typeof db.getCollection('c1')).toBe('object')
      expect(typeof db.getCollection('c2')).toBe('object')

      DB.clearDatabase(db)
      expect(db.getCollection('c1')).toBeNull()
      expect(db.getCollection('c2')).toBeNull()
    })
  })
  describe('clearAllData', () => {
    it('removes all data from all collections', () => {
      const fileName = generateFileName()
      const db = new Loki(fileName)
      const c1 = db.addCollection('c1')
      c1.insert({x: 1})
      c1.insert({x: 2})
      const c2 = db.addCollection('c2')
      c2.insert({y: 1})
      c2.insert({y: 2})
      expect(c1.count()).toBe(2)
      expect(c2.count()).toBe(2)

      DB.clearAllData(db)
      expect(c1.count()).toBe(0)
      expect(c2.count()).toBe(0)
    })
  })
  describe('createInMemoryOnlyDB', () => {
    it('creates database with extension methods', () => {
      const fileName = generateFileName()
      const db = DB.createInMemoryOnlyDB(fileName)
      expect(db instanceof Loki).toBe(true)
      expect(typeof db.loadDatabasePromise).toBe('function')
      expect(typeof db.saveDatabasePromise).toBe('function')
      expect(typeof db.deleteDatabasePromise).toBe('function')
      expect(typeof db.clearDatabase).toBe('function')
      expect(typeof db.clearAllData).toBe('function')
    })
    it('creates database with nullified saveDatabase and deleteDatabase methods', async () => {
      const fileName = generateFileName()
      const db = DB.createInMemoryOnlyDB(fileName)
      expect(fs.existsSync(fileName)).toBe(false)

      await new Promise((resolve, reject) => {
        db.saveDatabase((error) => (error ? reject(error) : resolve()))
      })
      expect(fs.existsSync(fileName)).toBe(false)

      const deleteError = await new Promise((resolve) => {
        db.deleteDatabase(resolve)
      })
      expect(deleteError).toBeUndefined()
    })
  })
  describe('createPersistingDB', () => {
    it('creates database with extension methods', () => {
      const fileName = generateFileName()
      const db = DB.createPersistingDB(fileName)
      expect(db instanceof Loki).toBe(true)
      expect(typeof db.loadDatabasePromise).toBe('function')
      expect(typeof db.saveDatabasePromise).toBe('function')
      expect(typeof db.deleteDatabasePromise).toBe('function')
      expect(typeof db.clearDatabase).toBe('function')
      expect(typeof db.clearAllData).toBe('function')
    })
    it('creates path to database file if not already exist', async () => {
      const fileName = `${tempDir}${path.sep}non${path.sep}existing${path.sep}db-persist-test`
      const pathToFile = path.dirname(fileName)
      rimraf.sync(pathToFile)
      expect(fs.existsSync(pathToFile)).toBe(false)

      const db = DB.createPersistingDB(fileName)
      expect(fs.existsSync(pathToFile)).toBe(true)
      expect(fs.existsSync(fileName)).toBe(false)

      await db.saveDatabasePromise()
      expect(fs.existsSync(fileName)).toBe(true)

      await db.deleteDatabasePromise()
      expect(fs.existsSync(fileName)).toBe(false)
    })
  })
})
