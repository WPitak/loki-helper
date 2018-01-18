/* eslint-env jest */
const { stripLokiProperties, idToLokiID, lokiIDToID } = require('./object')

describe('object helpers', () => {
  describe('stripLokiProperties', () => {
    it('remove meta and $loki properties from object', () => {
      const object = {
        $loki: 1,
        meta: { revision: 0, created: 1509432952783, version: 0 },
        content: 'content'
      }
      const result = stripLokiProperties(object)
      expect(result).not.toHaveProperty('$loki')
      expect(result).not.toHaveProperty('meta')
    })
  })
  describe('idToLokiID', () => {
    it('renames id field to $loki', () => {
      const object = {
        id: 44,
        content: 'xxx'
      }
      const result = idToLokiID(object)
      expect(result).toEqual({ $loki: 44, content: 'xxx' })
    })
  })
  describe('lokiIDToID', () => {
    it('renames $loki field to id', () => {
      const object = {
        $loki: 44,
        content: 'xxx'
      }
      const result = lokiIDToID(object)
      expect(result).toEqual({ id: 44, content: 'xxx' })
    })
  })
})
 