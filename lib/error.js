const errorFactory = require('custom-error-factory')

module.exports.ValidationError = errorFactory('ValidationError')
module.exports.ObjectNotFoundError = errorFactory('ObjectNotFoundError')
