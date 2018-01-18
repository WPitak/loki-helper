const _ = require('lodash')
const Joi = require('joi')
const debug = require('debug')('loki-helper:collection')

const { stripLokiProperties } = require('./object')
const { lokiID } = require('./schema')
const { ValidationError, ObjectNotFoundError } = require('./error')

/** Schema for input validation */
const Schema = (() => {
  const uniqueKey = Joi.string().min(1)
  const uniqueKeys = Joi.array()
    .items(uniqueKey)
    .unique()

  return {
    uniqueKeys
  }
})()

/**
 * Wrap non-array value in an array, otherwise return original array
 * @param {any} input - original input
 * @return {any[]}
 */
const valueToArray = input => (Array.isArray(input) ? input : [input])

/**
 * Get names of properties with binary index
 * @param {Loki.Collection} collection
 * @return {string[]}
 */
const indexedProperties = collection =>
  (collection.binaryIndices ? Object.keys(collection.binaryIndices) : [])

/**
 * Get names of properties with unique value constraint
 * @param {Loki.Collection} collection
 * @return {string[]}
 */
const uniqueProperties = collection => collection.uniqueNames || []

/**
 * Check if collection enforces unique value constraint on properties
 * @param {Loki.Collection} collection
 * @param {string|string[]} uniqueKeys
 * @return {bool} true if collection has unique constraint on all given properties
 */
const hasUniqueProperties = (collection, uniqueKeys) =>
  _.difference(valueToArray(uniqueKeys), collection.uniqueNames || []).length === 0

/**
 * Create extension methods for collection
 * Object schema is given to be access as private property to avoid issue
 * with circular reference on database serialization
 * @param {Joi.Schema} objectSchema
 */
const extensionMethods = (objectSchema) => ({
  /**
   * Find object with given ID
   * @param {number} id
   * @return {object}
   * @throws {ValidationError} given ID is not a positive integer
   * @throws {ObjectNotFoundError} no object with given ID
   */
  getByID (id) {
    if (!id || lokiID.validate(id).error) {
      throw new ValidationError()
    }
    const doc = this.get(id)
    if (!doc) {
      throw new ObjectNotFoundError()
    }
    return doc
  },
  /**
   * Remove object whose unique field value match given value
   * @param {string} field
   * @param {any} value
   * @throws {TypeError} given field does not have unique constraint
   */
  removeBy (field, value) {
    const doc = this.by(field, value)
    if (doc) {
      this.remove(doc)
    }
  },
  /**
   * Update if object existed in collection
   * Insert otherwise
   * @param {object} doc
   * @return {object|undefined} if inserted, return object
   */
  upsert (doc) {
    const { $loki: id } = doc
    if (id && this.get(id)) {
      return this.update(doc)
    }
    return this.insert(stripLokiProperties(doc))
  },
  /**
   * Validate object with collection's object schema
   * @param {object} doc
   * @return {object} validated value
   * @throws {ValidationError} input is invalid
   */
  validateObjectSchema (doc) {
    const { error, value } = objectSchema.validate(doc)
    if (error) {
      throw new ValidationError(null, _.pick(error, ['details', 'anotate']))
    }
    return value
  },
  /**
   * Check if object contains duplicated value on unique constraints
   * @param {object} doc - object to validate
   * @param {object} existing - object which is expected to be target of modification by given object
   * and thus should not be validated against
   * @return {bool} true if object has no duplicated unique constraint
   * @throws {ValidationError} object has duplicated value
   */
  validateUniqueProperties (doc, existing) {
    if (this.uniqueNames && this.uniqueNames.length > 0) {
      this.uniqueNames.forEach((key) => {
        const keyValue = doc[key]
        const equalExisting = existing && existing[key] && _.isEqual(keyValue, existing[key])
        if (keyValue && !equalExisting && this.by(key, keyValue)) {
          throw new ValidationError(`Duplicate key for property ${key}: ${keyValue}`, {
            key,
            value: keyValue
          })
        }
      })
    }
    return true
  },
  /**
   * Validate object against object schema and unique constraint then insert if valid
   * @param {object} doc
   * @return {object} inserted object
   */
  validateAndInsert (doc) {
    const validated = this.validateObjectSchema(doc)
    this.validateUniqueProperties(doc)
    return this.insert(validated)
  },
  /**
   * Replace existing object with given one
   * @param {object} doc - object to replace existing one, must have existing $loki field value
   * @return {object} updated object
   */
  validateAndReplace (doc) {
    const { $loki: id } = doc
    const existing = this.getByID(id)
    const validated = this.validateObjectSchema(doc)
    this.validateUniqueProperties(validated, existing)
    const updated = Object.assign({}, validated, _.pick(existing, ['$loki', 'meta']))
    return this.update(updated)
  },
  /**
   * Patch existing object with given one
   * @param {object} doc - object to merge with existing one
   * must have existing $loki field value
   * @return {object} patched object
   */
  validateAndPatch (doc) {
    const { $loki: id } = doc
    const existing = this.getByID(id)
    this.validateUniqueProperties(doc, existing)
    const patched = _.defaultsDeep(_.pick(existing, ['$loki', 'meta']), doc, existing)
    this.validateObjectSchema(patched)
    return this.update(patched)
  },
  /**
   * Remove object with given id
   * @param {number} id
   * @return {object} clone of removed object
   */
  removeByID (id) {
    const doc = this.getByID(id)
    const clone = _.cloneDeep(doc)
    this.remove(doc)
    return clone
  }
})

const initializationMethods = {
  /**
   * Validate and attempt to fix target collection
   * Create new collection if not exist
   * @return {Loki.Collection}
   * @throws {ValidationError} existing data cannot be reconciled with required constraint
   */
  initialize () {
    if (this.shouldRebuild()) {
      this.rebuild()
    }
    const collection = this.db.getCollection(this.collectionName)
    return Object.assign(collection, extensionMethods(this.objectSchema))
  },
  /**
   * Check if existing collection should be rebuilt
   * @return {bool} true if collection should be rebuilt
   */
  shouldRebuild () {
    const existingCollection = this.db.getCollection(this.collectionName)
    return !(existingCollection && hasUniqueProperties(existingCollection, this.uniqueKeys))
  },
  /**
   * Create new collection with given constraint assume no existing collection
   */
  create () {
    this.preCreate()
    this.db.addCollection(this.collectionName, {
      unique: this.uniqueKeys
    })
    this.postCreate()
  },
  /**
   * Run before create method main logic, can be used for database preparation
   * or extra inspection by overriding this method
   */
  preCreate () {
    debug('preCreate not implemented')
  },
  /**
   * Run after create method main logic, can be used for post processing data
   * by overriding this method
   */
  postCreate () {
    debug('postCreate not implementd')
  },
  /**
   * Remove and recreate collection then attempt to insert data back in afterward
   * @throws {ValidationError} existing data cannot be reconciled with given constraint
   */
  rebuild () {
    this.preRebuild()
    const existingCollection = this.db.getCollection(this.collectionName)
    if (!existingCollection) {
      debug(`${this.collectionName} collection not exist`)
      this.create()
    } else {
      const existingData = this.collectionSchema.validate(existingCollection.data.map(stripLokiProperties))
      if (existingData.error) {
        const message = `unable to rebuild ${this
          .collectionName} collection: invalid existing data`
        debug(message)
        debug(existingData.error)
        throw new ValidationError(message)
      }

      this.db.removeCollection(this.collectionName)
      this.create()
      this.db.getCollection(this.collectionName).insert(existingData.value)
    }
    this.postRebuild()
  },
  /**
   * Run before rebuild method main logic, to be overriden
   */
  preRebuild () {
    debug('preRebuild not implemented')
  },
  /**
   * Run after rebuild method main logic, to be overriden
   */
  postRebuild () {
    debug('postRebuild not implemented')
  }
}

module.exports.Initializer = (
  db,
  collectionName,
  _uniqueKeys = [],
  collectionSchema = Joi.any(),
  objectSchema = Joi.any()
) => {
  // Process unique keys input
  const validatedUniqueKeys = Schema.uniqueKeys.validate(valueToArray(_uniqueKeys))
  if (validatedUniqueKeys.error) {
    const message = `invalid uniqueKeys`
    debug(message)
    debug(validatedUniqueKeys.error)
    throw new ValidationError(message)
  }
  const uniqueKeys = validatedUniqueKeys.value

  // Members
  const members = {
    db,
    collectionName,
    uniqueKeys,
    collectionSchema,
    objectSchema
  }

  return Object.assign(members, initializationMethods)
}

module.exports.hasUniqueProperties = hasUniqueProperties
module.exports.indexedProperties = indexedProperties
module.exports.uniqueProperties = uniqueProperties
