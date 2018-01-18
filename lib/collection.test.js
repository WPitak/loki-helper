/* eslint-env jest */
const Collection = require('./collection')
const { createInMemoryOnlyDB } = require('./db')
const Loki = require('lokijs')
const Joi = require('joi')
const { ValidationError, ObjectNotFoundError } = require('./error')

const db = createInMemoryOnlyDB('test')
const clear = () => {
  db.clearDatabase()
}

describe('Loki collection helpers', () => {
  describe('uniqueProperties', () => {
    beforeEach(clear)
    it('yields names of properties with unique constraint', () => {
      const collection = db.addCollection('TESTS', { unique: ['name', 'content'] })
      const result = Collection.uniqueProperties(collection)
      expect(result).toContain('name')
      expect(result).toContain('content')
    })
  })
  describe('indexedProperties', () => {
    beforeEach(clear)
    it('yields names of properties with binary index', () => {
      const collection = db.addCollection('TESTS')
      expect(Collection.indexedProperties(collection)).toEqual([])

      collection.ensureIndex('name')
      collection.ensureIndex('content')
      const result = Collection.indexedProperties(collection)
      expect(result).toContain('name')
      expect(result).toContain('content')
    })
  })
  describe('hasUniqueProperties', () => {
    beforeEach(clear)
    it('returns true if given properties has unique constraint', () => {
      const collection = db.addCollection('TEST', {
        unique: ['name', 'content']
      })
      const hasConstraint = Collection.hasUniqueProperties.bind(null, collection)
      expect(hasConstraint('name')).toBe(true)
      expect(hasConstraint(['content'])).toBe(true)
      expect(hasConstraint(['name', 'content'])).toBe(true)
      expect(hasConstraint('invalid')).toBe(false)
      expect(hasConstraint(['name', 'invalid'])).toBe(false)
    })
  })
})

describe('Initializer', () => {
  describe('factory function', () => {
    beforeEach(clear)
    it('returns Initializer with initialize method', () => {
      const initializer = Collection.Initializer(db, 'TESTS')
      expect(initializer).toHaveProperty('initialize')
    })
    it('throws if non string array or string is given as unique keys', () => {
      expect(() => Collection.Initializer(db, 'TESTS', 7)).toThrow(ValidationError)
      expect(() => Collection.Initializer(db, 'TESTS', [true, false, true])).toThrow(ValidationError)
    })
  })
  describe('create', () => {
    beforeEach(clear)
    it('creates collection of given name with given unique constraint', () => {
      const initializer = Collection.Initializer(db, 'TESTS', ['name', 'content'])
      initializer.create()
      const collection = db.getCollection('TESTS')
      expect(collection).toBeInstanceOf(Loki.Collection)
      expect(collection.name).toBe('TESTS')
      expect(collection.uniqueNames).toContain('name')
      expect(collection.uniqueNames).toContain('content')
    })
    it('calls preCreate and postCreate', () => {
      const preCreate = jest.fn()
      const postCreate = jest.fn()
      const initializer = Collection.Initializer(db, 'TESTS')
      initializer.preCreate = preCreate
      initializer.postCreate = postCreate
      initializer.create()
      expect(preCreate).toHaveBeenCalledTimes(1)
      expect(postCreate).toHaveBeenCalledTimes(1)
    })
  })
  describe('rebuild', () => {
    beforeEach(clear)
    it('calls preRebuild and postRebuild', () => {
      const preRebuild = jest.fn()
      const postRebuild = jest.fn()
      const initializer = Collection.Initializer(db, 'TESTS')
      initializer.preRebuild = preRebuild
      initializer.postRebuild = postRebuild
      initializer.rebuild()
      expect(preRebuild).toHaveBeenCalledTimes(1)
      expect(postRebuild).toHaveBeenCalledTimes(1)
    })
    it('preserves existing data', () => {
      const data = [{ name: 'john', content: 'smith' }, { name: 'julius', content: 'caesar' }]
      db.addCollection('TESTS').insert(data)
      const initializer = Collection.Initializer(db, 'TESTS', ['name'])
      initializer.rebuild()
      const collection = db.getCollection('TESTS')
      expect(collection).toBeInstanceOf(Loki.Collection)
      expect(collection.count()).toBe(2)
      expect(collection.find({ name: 'john', content: 'smith' })).toHaveLength(1)
      expect(collection.find({ name: 'julius', content: 'caesar' })).toHaveLength(1)
    })
    it('throws if existing data does not conform to given constraint', () => {
      const data = [{ name: 'john', content: 'smith' }, { name: 'john', content: 'travolta' }]
      db.addCollection('TESTS').insert(data)
      const initializer = Collection.Initializer(db, 'TESTS', ['name'])
      expect(() => initializer.rebuild()).toThrow()
    })
    it('throws if existing data is invalid according to schema', () => {
      const data = [{ name: 'john' }]
      db.addCollection('TESTS').insert(data)
      const schema = Joi.array().items(Joi.object().keys({
        name: Joi.number().required()
      }))
      const initializer = Collection.Initializer(db, 'TESTS', [], schema)
      expect(() => initializer.rebuild()).toThrow(ValidationError)
    })
  })
  describe('initialize', () => {
    beforeEach(clear)
    it('returns new Loki.Collection if not exist', () => {
      const initializer = Collection.Initializer(db, 'TESTS')
      const collection = initializer.initialize()
      expect(collection).toBeInstanceOf(Loki.Collection)
      expect(collection.name).toBe('TESTS')
    })
    it('returns existing collection if it is valid', () => {
      const data = [{ id: 1 }, { id: 2 }]
      db.addCollection('TESTS').insert(data)
      const rebuild = jest.fn((...args) => this.rebuild(...args))
      const initializer = Collection.Initializer(db, 'TESTS')
      initializer.rebuild = rebuild
      const collection = initializer.initialize()
      expect(rebuild).not.toHaveBeenCalled()
      expect(collection).toBeInstanceOf(Loki.Collection)
      expect(collection).toBe(db.getCollection('TESTS'))
    })
    it('recreates collection if not valid', () => {
      db.addCollection('TESTS')
      const initializer = Collection.Initializer(db, 'TESTS', ['name'])
      const collection = initializer.initialize()
      expect(collection).toBeInstanceOf(Loki.Collection)
      expect(collection).toBe(db.getCollection('TESTS'))
      expect(collection.uniqueNames).toContain('name')
    })
  })
})

describe('Collection extension methods', () => {
  let collection
  const objectSchema = Joi.object()
    .keys({
      slug: Joi.string()
        .min(1)
        .required(),
      content: Joi.string(),
      isDisabled: Joi.bool()
        .strict()
        .default(false)
    })
    .unknown()
  const collectionSchema = Joi.array()
    .items(objectSchema)
    .unique('slug')
  const initializer = Collection.Initializer(db, 'TESTS', ['slug'], collectionSchema, objectSchema)
  const reset = () => {
    if (initializer.shouldRebuild()) {
      db.clearDatabase()
      collection = initializer.initialize()
    }
    collection.clear()
    collection.insert({ slug: 'a', content: '123' })
    collection.insert({ slug: 'b', content: '456' })
  }
  describe('getByID', () => {
    beforeEach(reset)
    it('returns object with given id', () => {
      const aObject = collection.by('slug', 'a')
      expect(collection.getByID(aObject.$loki)).toEqual(aObject)
    })
    it('throws if non positive integer is given', () => {
      expect(() => collection.getByID('xxx')).toThrow(ValidationError)
      expect(() => collection.getByID()).toThrow(ValidationError)
    })
    it('throws if there is no object with given id', () => {
      expect(() => collection.getByID(42)).toThrow(ObjectNotFoundError)
    })
  })
  describe('removeBy', () => {
    beforeEach(reset)
    it('removes object with given unique constraint', () => {
      expect(collection.by('slug', 'a')).toBeDefined()
      expect(collection.count()).toBe(2)
      collection.removeBy('slug', 'a')
      expect(collection.by('slug', 'a')).toBeUndefined()
      expect(collection.count()).toBe(1)
    })
    it('throws if there is no given field is not unique constraint', () => {
      expect(() => collection.removeBy('name', 'sam')).toThrow()
    })
  })
  describe('upsert', () => {
    beforeEach(reset)
    it('inserts object if it does not have $loki property', () => {
      const cObject = { slug: 'c', content: '789' }
      collection.upsert(cObject)
      const iObject = collection.by('slug', 'c')
      expect(collection.count()).toBe(3)
      expect(iObject).toBeDefined()
      expect(iObject).toMatchObject(cObject)
    })
    it('strips meta property if object is to be inserted', () => {
      const cObject = { slug: 'c', content: '199', meta: { a: 1, b: 2 } }
      collection.upsert(cObject)
      const iObject = collection.by('slug', 'c')
      expect(iObject).toBeDefined()
      expect(iObject.content).toBe(cObject.content)
      expect(iObject.meta).toBeDefined()
      expect(iObject.meta).not.toEqual(cObject.meta)
    })
    it('updates existing object if it is a valid Loki object with existing $loki', () => {
      const originalAObject = collection.by('slug', 'a')
      const modifiedAObject = Object.assign({}, originalAObject, { content: '321' })
      collection.upsert(modifiedAObject)
      const updatedAObject = collection.by('slug', 'a')
      expect(collection.count()).toBe(2)
      expect(updatedAObject).toBeDefined()
      expect(updatedAObject.content).toBe('321')
    })
    it('inserts object if it has $loki that is not existing in collection', () => {
      const cObject = {
        $loki: 42,
        meta: {},
        slug: 'c',
        content: '789'
      }
      const insertedObject = collection.upsert(cObject)
      expect(collection.count()).toBe(3)
      expect(insertedObject.$loki).toBe(3)
    })
  })
  describe('validateObjectSchema', () => {
    beforeEach(reset)
    it('returns validated value if input is valid', () => {
      const cObject = { slug: 'c', content: '789' }
      const result = collection.validateObjectSchema(cObject)
      expect(result).toBeDefined()
      expect(result.isDisabled).toBe(false)
    })
    it('throws if input is invalid', () => {
      const invalidObject = { slug: 1 }
      expect.assertions(1)
      try {
        collection.validateObjectSchema(invalidObject)
      } catch (error) {
        expect(error.name).toBe('ValidationError')
      }
    })
  })
  describe('validateUniqueProperties', () => {
    let uCollection
    const uInitializer = Collection.Initializer(db, 'UNIQUES', ['u1', 'u2'])
    const uReset = () => {
      if (uInitializer.shouldRebuild()) {
        db.clearDatabase()
        uCollection = uInitializer.initialize()
      }
      uCollection.clear()
      uCollection.insert({ u1: 1, u2: 'a' })
      uCollection.insert({ u1: 2, u2: 'b' })
    }
    beforeEach(uReset)
    it('returns true if all unique keys is not duplicated', () => {
      expect(uCollection.validateUniqueProperties({ u1: 3, u2: 'c' })).toBe(true)
    })
    it('throws if there is any duplicated unique key', () => {
      const unique = o => uCollection.validateUniqueProperties(o)
      expect.assertions(4)
      expect(() => unique({ u1: 1, u2: 'a' })).toThrow()
      expect(() => unique({ u1: 2 })).toThrow()
      expect(() => unique({ u2: 'b' })).toThrow()
      try {
        unique({ u1: 1 })
      } catch (error) {
        expect(error.name).toBe('ValidationError')
      }
    })
    it('return true if object contains duplicated value equals to provided existing object', () => {
      const existingObject = uCollection.by('u1', 1)
      const unique = (o, e) => uCollection.validateUniqueProperties(o, e)
      expect(unique({ u1: 1, u2: 'a' }, existingObject)).toBe(true)
      expect(unique({ u1: 1, u2: 'c' }, existingObject)).toBe(true)
      expect(() => unique({ u1: 1, u2: 'b' })).toThrow()
    })
  })
  describe('validateAndInsert', () => {
    beforeEach(reset)
    it('calls validateObjectSchema and validateUniqueProperties', () => {
      const schemaSpy = jest.spyOn(collection, 'validateObjectSchema')
      const uniqueSpy = jest.spyOn(collection, 'validateUniqueProperties')
      const cObject = { slug: 'c', content: '789' }
      collection.validateAndInsert(cObject)
      expect(collection.count()).toBe(3)
      expect(schemaSpy).toHaveBeenCalled()
      expect(uniqueSpy).toHaveBeenCalled()
    })
  })
  describe('validateAndReplace', () => {
    beforeEach(reset)
    it('replaces whole object with given one', () => {
      const aObject = collection.by('slug', 'a')
      const newObject = { $loki: aObject.$loki, slug: 'c' }
      const result = collection.validateAndReplace(newObject)
      expect(result.slug).toBe('c')
      expect(result.$loki).toBe(aObject.$loki)
      expect(result).not.toHaveProperty('content')
    })
    it('throws if attempting to replace with duplicated unique key', () => {
      const aObject = collection.by('slug', 'a')
      const newObject = { $loki: aObject.$loki, slug: 'b' }
      expect(() => collection.validateAndReplace(newObject)).toThrow()
    })
  })
  describe('validateAndPatch', () => {
    beforeEach(reset)
    it('patches part of object with value in given object', () => {
      const aObject = collection.by('slug', 'a')
      const patch = { $loki: aObject.$loki, slug: 'c', extra: 'xxx' }
      const result = collection.validateAndPatch(patch)
      expect(result.$loki).toBe(aObject.$loki)
      expect(result.slug).toBe('c')
      expect(result.content).toBe('123')
      expect(result.extra).toBe('xxx')
    })
  })
  describe('removeByID', () => {
    beforeEach(reset)
    it('returns value of removed object', () => {
      const { $loki: id } = collection.by('slug', 'a')
      const result = collection.removeByID(id)
      expect(collection.get(id)).toBeNull()
      expect(result).toMatchObject({ slug: 'a', content: '123' })
    })
  })
})
