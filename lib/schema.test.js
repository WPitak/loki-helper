/* eslint-env jest */
const schema = require('./schema')

const matchers = (schema) => ({
  valid: (obj) => expect(schema.validate(obj).error).toBeNull(),
  invalid: (obj) => expect(schema.validate(obj).error).toBeTruthy()
})

describe('schema', () => {
  describe('lokiID schema', () => {
    const { valid, invalid } = matchers(schema.lokiID)
    it('allows positive integers', () => {
      valid(1)
      valid(4)
      valid(12)
    })
    it('rejects zero and negative integers', () => {
      invalid(0)
      invalid(-1)
      invalid(-12)
    })
    it('rejects null', () => {
      invalid(null)
    })
  })
  describe('lokiObject schema', () => {
    const { valid, invalid } = matchers(schema.lokiObject)
    it('allows object with Loki properties', () => {
      const object = {
        $loki: 1,
        meta: { revision: 0, created: 1509432952783, version: 0 },
        content: 'CONTENT'
      }
      valid(object)
    })
    it('rejects object without Loki properties', () => {
      const object = {
        name: 'STAFF',
        type: 'STAFF',
        passcode: '1234'
      }
      invalid(object)
    })
  })
})
